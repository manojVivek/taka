// IIFE entry point — bundled by rollup into dist/browser.global.js for use
// via a plain <script src> tag. Side-effect only (no exports) so rollup's iife
// output sets the global correctly via the assignment below rather than
// wrapping the module's exports object.
import { TakaRecorder } from './recorder';

declare global {
  interface Window {
    TakaRecorder: typeof TakaRecorder;
  }
}

if (typeof window !== 'undefined') {
  window.TakaRecorder = TakaRecorder;
}
