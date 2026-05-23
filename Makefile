.PHONY: install build dev start stop clean reset migrate-data test lint kill kill-test-app restart-test-app automate

# Install dependencies
install:
	pnpm install

# Build all packages
build:
	pnpm build

# Start dev servers (API on 3001, Web on 3000, Test App on 3002)
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
	-lsof -ti:3002 | xargs kill -9 2>/dev/null
	@echo "Ports 3000, 3001, and 3002 cleared"

# Kill test-app on port 3002
kill-test-app:
	-lsof -ti:3002 | xargs kill -9 2>/dev/null
	@echo "Port 3002 cleared"

# Restart test-app (kill, then start in background)
restart-test-app: kill-test-app
	@sleep 1
	cd packages/app/test-app && pnpm dev &
	@echo "Test app restarting on port 3002"

# Run UI automation against test-app (default 5 rounds)
automate:
	cd packages/app/test-app && node scripts/automate.mjs --rounds=$(or $(ROUNDS),5) --delay=$(or $(DELAY),600)

# Clean build artifacts
clean:
	find packages -type d -name dist -prune -exec rm -rf {} +
	find packages -name "*.tsbuildinfo" -delete
	rm -rf packages/app/web/.next packages/app/test-app/.next .turbo
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
