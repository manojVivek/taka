// Browser-specific entry point for the recorder
import { TakaRecorder } from './recorder';

// Make TakaRecorder available globally
declare global {
  interface Window {
    TakaRecorder: typeof TakaRecorder;
  }
}

if (typeof window !== 'undefined') {
  window.TakaRecorder = TakaRecorder;
}

export { TakaRecorder };
export default TakaRecorder;