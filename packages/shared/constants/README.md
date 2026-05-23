# @taka/constants

Shared constants and default configuration for the Taka platform.

## Overview

Centralizes magic strings, default values, and configuration constants so they can be referenced consistently across the recorder, player, differ, API, and web dashboard.

## Key Exports

| Constant | Description |
|----------|-------------|
| `DEFAULT_CONFIG` | Default `RecorderConfig` (apiEndpoint, uploadInterval, maxBatchSize, capture flags) |
| `STORAGE_PATHS` | Filesystem paths for user sessions and test sessions under `./data` |
| `EVENT_TYPES` | String constants for event types (`CLICK`, `INPUT`, `SCROLL`, `NAVIGATION`, `MUTATION`) |
| `TEST_STATUS` | Test status enum values (`PENDING`, `RUNNING`, `PASSED`, `FAILED`) |
| `VISUAL_DIFF_THRESHOLD` | Default pixel difference threshold (10%) for failing a test |
| `QUEUE_CONCURRENCY` | Maximum concurrent jobs in the in-process queue (2) |

## Usage

```typescript
import { DEFAULT_CONFIG, EVENT_TYPES, TEST_STATUS } from '@taka/constants';

// Use defaults and override what you need
const config = { ...DEFAULT_CONFIG, uploadInterval: 10000 };

// Reference event types
if (event.type === EVENT_TYPES.CLICK) { ... }

// Reference test status
if (result.status === TEST_STATUS.FAILED) { ... }
```

## Build

```bash
pnpm build       # Compile TypeScript to dist/
pnpm type-check  # Type-check without emitting
```
