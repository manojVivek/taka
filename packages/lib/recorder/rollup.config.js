import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/browser.ts',
  output: {
    file: 'dist/browser.js',
    format: 'iife',
    name: 'TakaRecorder',
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
    }),
  ],
};