import { FileStorage } from './fileStorage';
import { LogOnlyStorage } from './logOnlyStorage';
import type { Storage, StorageKind, FileStorageConfig } from './types';

export { FileStorage } from './fileStorage';
export { LogOnlyStorage } from './logOnlyStorage';
export type {
  Storage,
  StorageKind,
  SessionSummary,
  ScreenshotRef,
  ListOptions,
  ListResult,
  SessionStats,
  DiffReport,
  DiffReportEntry,
  FileStorageConfig,
  ProjectUpdate,
} from './types';

export function createStorage(kind: StorageKind, config: { file?: FileStorageConfig }): Storage {
  switch (kind) {
    case 'file':
      if (!config.file) throw new Error('FileStorage requires file config');
      return new FileStorage(config.file);
    case 'logOnly':
      return new LogOnlyStorage();
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown storage kind: ${_exhaustive}`);
    }
  }
}
