import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

// Bundles the tsc-compiled IIFE entry (dist/iife.js) plus its workspace and
// third-party deps (@taka/utils, uuid, …) into a single self-contained script
// that exposes window.TakaRecorder. Run after `tsc` (see the build script).
export default {
  input: 'dist/iife.js',
  output: {
    file: 'dist/browser.global.js',
    format: 'iife',
  },
  plugins: [nodeResolve({ browser: true }), commonjs()],
};
