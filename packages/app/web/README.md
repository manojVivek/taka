# @taka/web

Next.js dashboard for browsing recorded sessions, running replay tests, and reviewing visual regressions.

## Overview

The web app is the human-facing UI for the platform. It talks to the API at `http://localhost:3001/api` and provides views for session management, test execution, and visual diff inspection.

Runs on **http://localhost:3000** by default.

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
| `/sessions` | Paginated session list with search, sort, and inline actions (replay, view, delete) |
| `/sessions/[id]` | Session detail — events, network requests, metadata |
| `/tests` | Visual regression test results, filterable by status |
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
pnpm dev    # Next.js dev server with Turbopack
pnpm build  # Production build
pnpm start  # Serve production build
```

Or from the repo root: `make dev` (starts web + API + test-app together).

## Configuration

The dashboard expects the API at `http://localhost:3001/api`. To change this, update the fetch helpers under `src/lib/api/`.
