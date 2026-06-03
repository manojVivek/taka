.PHONY: install build dev start stop clean reset migrate-data test lint kill fixture e2e e2e-headful e2e-keep

# Install dependencies
install:
	pnpm install

# Build all packages
build:
	pnpm build

# Start dev servers (API on 3001, Web on 3000)
dev:
	pnpm exec turbo dev --concurrency 20

# Start production servers
start:
	node packages/app/api/dist/index.js & \
	pnpm --filter @taka/web start

# Kill processes on dev ports
kill:
	-lsof -ti:3000 | xargs kill -9 2>/dev/null
	-lsof -ti:3001 | xargs kill -9 2>/dev/null
	-lsof -ti:3003 | xargs kill -9 2>/dev/null
	@echo "Ports 3000, 3001, and 3003 cleared"

# Run the test fixture standalone on :3003 for manual recording.
# Pass TAKA_PROJECT_ID to attribute recordings to a project.
fixture:
	TAKA_PROJECT_ID=$(or $(TAKA_PROJECT_ID),) node packages/app/test-fixture/server.mjs

# Full hermetic end-to-end test: builds, then spawns its own API + fixture +
# Chrome, records a session, and asserts record → baseline → pass → regression-fail.
e2e: build
	node packages/app/test-fixture/scripts/e2e.mjs

# Same, but with a visible browser for debugging.
e2e-headful: build
	E2E_HEADFUL=1 node packages/app/test-fixture/scripts/e2e.mjs

# Run the flow, then leave API + fixture + dashboard up to play with.
# Ctrl+C tears everything down and cleans the temp data dir.
e2e-keep: build
	E2E_KEEP=1 node packages/app/test-fixture/scripts/e2e.mjs

# Clean build artifacts
clean:
	find packages -type d -name dist -prune -exec rm -rf {} +
	find packages -name "*.tsbuildinfo" -delete
	rm -rf packages/app/web/.next .turbo
	@echo "Build artifacts cleaned"

# Reset data directory
reset:
	rm -rf ./data
	mkdir -p ./data/user-sessions ./data/test-sessions
	@echo "Data directory reset"

# Migrate existing data to new directory structure
migrate-data:
	@echo "Migrating data to new directory structure..."
	@mkdir -p ./data/user-sessions ./data/test-sessions
	@if [ -d "./data/sessions" ]; then \
		for f in ./data/sessions/*.json; do \
			[ -f "$$f" ] || continue; \
			id=$$(basename "$$f" .json); \
			[ "$$id" = "index" ] && continue; \
			mkdir -p "./data/user-sessions/$$id"; \
			mv "$$f" "./data/user-sessions/$$id/session.json"; \
			echo "  Migrated session: $$id"; \
		done; \
	fi
	@if [ -d "./data/screenshots" ]; then \
		for d in ./data/screenshots/*/; do \
			[ -d "$$d" ] || continue; \
			id=$$(basename "$$d"); \
			mkdir -p "./data/user-sessions/$$id/screenshots"; \
			cp -r "$$d"* "./data/user-sessions/$$id/screenshots/" 2>/dev/null || true; \
			echo "  Migrated screenshots for: $$id"; \
		done; \
	fi
	@if [ -d "./data/tests" ]; then \
		for d in ./data/tests/*/; do \
			[ -d "$$d" ] || continue; \
			id=$$(basename "$$d"); \
			mkdir -p "./data/test-sessions/$$id"; \
			cp -r "$$d"* "./data/test-sessions/$$id/" 2>/dev/null || true; \
			echo "  Migrated test: $$id"; \
		done; \
	fi
	@echo "Migration complete. Old directories preserved — remove manually after verifying."

# Run linting
lint:
	pnpm lint

# Type check all packages
typecheck:
	pnpm type-check

# Health check
health:
	@curl -s http://localhost:3001/api/health | python3 -m json.tool 2>/dev/null || echo "API not running"
