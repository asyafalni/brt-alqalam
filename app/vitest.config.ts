import { defineConfig } from 'vitest/config';
import { octane } from 'octane/compiler/vite';

// Component tests must run through the Octane Vite plugin, not a bare Node transform —
// hooks are keyed by compiler-assigned call-site slots (OCTANE-FINDINGS.md §13).
export default defineConfig({
  plugins: [octane()],
  test: { environment: 'happy-dom', include: ['src/**/*.test.{ts,tsx}'] },
});
