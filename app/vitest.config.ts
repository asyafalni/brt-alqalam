import { defineConfig } from 'vitest/config';
import { octane } from 'octane/compiler/vite';

// Component tests must run through the Octane Vite plugin, not a bare Node transform —
// hooks are keyed by compiler-assigned call-site slots (OCTANE-FINDINGS.md §13).
export default defineConfig({
  plugins: [octane()],
  // domain/ and data/ live above this package; without this, importing the real parser from
  // a test fails with a bare "Cannot find module" that looks like a typo rather than config.
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    // The Octane compiler transform dominates the run; caching it across runs makes the
    // feedback loop short enough to actually stay in.
    fsModuleCache: true,
  },
});
