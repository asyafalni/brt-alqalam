import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [octane(), tailwindcss(), ...(process.env.ANALYZE ? [visualizer({ template: 'raw-data', filename: 'dist/stats.json' })] : [])],
  build: { target: 'esnext' },
  // domain/ and data/ live above this package — they are the pure core we build on.
  server: { fs: { allow: ['..'] } },
});
