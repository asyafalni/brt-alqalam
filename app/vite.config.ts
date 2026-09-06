import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [octane(), tailwindcss()],
  build: { target: 'esnext' },
  // domain/ and data/ live above this package — they are the pure core we build on.
  server: { fs: { allow: ['..'] } },
});
