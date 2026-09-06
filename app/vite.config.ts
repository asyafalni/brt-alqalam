import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    octane(),
    tailwindcss(),
    // `npm run dev:https` only. The camera needs a secure context, so the scanner cannot be
    // tested over plain http on the LAN — but the certificate is self-signed, so every device
    // shows a warning once. Plain http stays the default for everything else.
    ...(process.env.HTTPS ? [basicSsl()] : []), ...(process.env.ANALYZE ? [visualizer({ template: 'raw-data', filename: 'dist/stats.json' })] : [])],
  build: { target: 'esnext' },
  // domain/ and data/ live above this package — they are the pure core we build on.
  server: { fs: { allow: ['..'] } },
});
