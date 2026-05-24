# @taka/test-app

A small Next.js notes app used as a recording target during development. It exists so the recorder, player, and differ can be exercised against a realistic UI without depending on an external site.

## Overview

The test-app is a simple notes manager (create, edit, delete, search) that boots with the `@taka/recorder` SDK already wired in. Every page load starts a recording, every interaction is captured, and the data is shipped to the local API at `http://localhost:3001/api`.

Runs on **http://localhost:3002** by default.

## Tech Stack

- **Next.js 16** with the App Router
- **React 19**
- **TypeScript**
- **@taka/recorder** (auto-initialized via `RecorderProvider`)
- **Puppeteer** for the included automation script

## Pages

| Route | Description |
|-------|-------------|
| `/` | Notes list with create / edit / delete / search |

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/notes` | List all notes |
| `POST` | `/api/notes` | Create a note |
| `PUT` | `/api/notes/[id]` | Update a note |
| `DELETE` | `/api/notes/[id]` | Delete a note |

These exist purely so the recorder has real network traffic to capture.

## Recorder integration

`src/components/RecorderProvider.tsx` wires up the recorder on the client:

- Skips initialization if `window.__taka_replay` is set (so the player does not record itself during replay)
- Configures the recorder with the local API endpoint, project ID, and capture flags
- Stores the recorder on `window.__takaRecorder` for debugging

### Pointing at a project (required)

The recorder requires a `projectId` to start. The test-app reads it from `NEXT_PUBLIC_TAKA_PROJECT_ID`:

```bash
NEXT_PUBLIC_TAKA_PROJECT_ID=notes-app pnpm dev
```

If the env var is unset, the test-app logs a clear error in the browser console and the recorder simply doesn't start (the rest of the notes UI keeps working). The project must already exist on the API server — create it with `POST /api/projects` or via the dashboard.

## Automation script

`scripts/automate.mjs` drives the test-app with Puppeteer to generate realistic session data. It performs:

- Creating 1–2 notes per round with varied titles and content
- Editing existing notes (60% chance/round)
- Searching notes (50%)
- Scrolling (70%)
- Hovering elements (40%)
- Deleting notes (30%, after round 3)

### Usage

```bash
# From the repo root, default 5 rounds with 600ms delay
make automate

# Customize rounds and delay
make automate ROUNDS=10 DELAY=400
```

Each run produces a fresh session in `data/user-sessions/` that you can replay from the dashboard.

## Running locally

```bash
pnpm dev    # Next.js dev server on :3002
pnpm build  # Production build
pnpm start  # Serve production build
```

Or from the repo root: `make dev` (starts test-app + web + API together).

## Useful Make targets

| Target | Description |
|--------|-------------|
| `make kill-test-app` | Kill just port 3002 |
| `make restart-test-app` | Kill and restart the test-app in the background |
| `make automate ROUNDS=N DELAY=ms` | Run the automation script |
