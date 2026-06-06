# @taka/web

Next.js dashboard for browsing recorded sessions, running replay tests, and reviewing visual regressions.

## Overview

The web app is the human-facing UI for the platform. It talks to the API at `http://localhost:9001/api` and provides views for session management, test execution, and visual diff inspection.

Runs on **http://localhost:9000** by default.

## Tech Stack

- **Next.js 16** with the App Router
- **React 19**
- **Tailwind CSS 4**
- **Lucide React** icons
- **TypeScript** throughout
- **p-queue** for client-side request throttling

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — session stats, recent sessions, test queue status |
| `/sessions` | Session list with search, sort, recorded-origin filter, pagination, and inline actions (replay, view, delete) |
| `/sessions/[id]` | Session detail — baseline-frame flipstrip gallery, events, network requests, metadata |
| `/tests` | Visual regression test results, filterable by status (pass/fail) and the origin the test ran against |
| `/tests/[id]` | Test detail — baseline vs. head screenshots, diff images, pass/fail breakdown |
| `/getting-started` | Onboarding guide with recorder setup snippets and config reference |

## Key Components

| Component | Purpose |
|-----------|---------|
| `Sidebar` | Top-level navigation |
| `PageHeader` | Consistent page title + description |
| `SessionStats` | Aggregate metrics card on the dashboard |
| `RecentSessionsTable` | Recent sessions with inline actions |
| `TestQueue` | Live test execution queue |
| `StatusBadge` | Pill-style status indicator |
| `Pagination` | Reusable paginator |
| `LoadingSkeleton` | Placeholder skeletons for tables and cards |
| `EmptyState` | Contextual empty states with CTAs |
| `SearchInput` | Debounced session search |
| `CodeBlock` | Syntax-highlighted code snippets in the getting-started page |

## Features

- 5-second polling on the test queue for live status updates
- Server-side pagination (max 200 per page)
- URL/title search across sessions
- Sort by timestamp or event count
- Responsive layout with Tailwind
- Semantic HTML and ARIA where appropriate

## Running locally

```bash
pnpm dev          # Next.js dev server with Turbopack
pnpm build        # Production build
pnpm start        # Serve production build
pnpm gen:favicon  # Regenerate src/app/favicon.ico from src/app/icon.svg
```

Or from the repo root: `make dev` (starts web + API together).

### Favicon

The favicon is the `TerminalMark` logo symbol on a dark brand tile. `src/app/icon.svg` is the source of truth (auto-served to modern browsers); `src/app/favicon.ico` (16/32/48, for legacy/Safari) is generated from it by `scripts/gen-favicon.mjs` via `pnpm gen:favicon`. Edit the SVG, then regenerate.

## Configuration

The dashboard expects the API at `http://localhost:9001/api`. To change this, update the fetch helpers under `src/lib/api/`.
