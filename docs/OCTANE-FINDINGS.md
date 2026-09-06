# Octane (octanejs) — factual findings

**Researched:** 2026-09-06 · **Purpose:** establish how Octane actually works so we can build the BRT
Al-Qalam inventory SPA on it. This document is descriptive, not a recommendation — the project has
already committed to Octane.

**Anti-hallucination note:** every claim below carries a source, listed in [Sources](#sources).
Anything not verifiable from a primary source is written as `UNKNOWN — …` rather than guessed.

---

## 0. Executive summary — what would block our app

| Concern | Status |
| --- | --- |
| Static SPA build for Vercel/Cloudflare Pages | **Works.** No SSR required; plain `vite build` output. [S4] |
| Component API familiarity | **Very close to React.** Standard `.tsx` compiles as-is, hooks included. [S8] |
| `OctaneCompat` (Octane inside React) | **Exists**, but it ships in `octane/react`, **not** `@octanejs/compat`. [S10][S5] |
| TanStack Query / Store | **Both green.** query = complete 58/58 exports; store = stable surface. [S11] |
| Motion / Lucide / Sonner | **All present**, with listed divergences (native events, ref-as-prop). [S11] |
| Dexie (offline queue) | **Ported**, `useLiveQuery` etc. [S11] |
| Testing (Vitest) | **Works** via `@octanejs/testing-library`; no official docs page. [S13][S14] |
| **Clerk** | **No binding exists.** Use vanilla `@clerk/clerk-js` (zero peer deps). [S17][S18][S22] |
| **QR scanning** | **No binding exists.** `@zxing/browser` / `html5-qrcode` are framework-agnostic. [S22] |
| **PWA / service worker** | No Octane-specific docs. `vite-plugin-pwa@1.3.0` supports Vite 8. [S22] |
| Toolchain pins | **Node ≥ 22.22.2, TypeScript ^5.9.3, Vite ^8.0.16** — all hard. [S3][S21] |

**The three real friction points for this project**, in order:

1. **Clerk has no Octane binding** and the React SDK cannot be used directly. The supported path is
   the vanilla `@clerk/clerk-js` SDK driven imperatively from an effect. See §8.
2. **Vite 8 is a peer requirement** of `octane@0.2.3` [S21]. Any Vite plugin we add must support
   Vite 8. `vite-plugin-pwa@1.3.0` does; other plugins must be checked individually.
3. **TypeScript is pinned to ^5.9.3** and `.tsrx` files can only be typechecked by `tsrx-tsc`, not
   plain `tsc` [S12][S21]. The CLI comment states explicitly that installing the newest TypeScript
   major breaks `tsrx-tsc` [S12].

Note also: **there is no `@octanejs/tanstack-charts`.** The full 107-package binding list [S11]
contains no TanStack Charts port. The available charting bindings are `@octanejs/visx` and
`@octanejs/recharts` [S11]. This contradicts the plan in CLAUDE.md §8 and needs a decision.

---

## 1. Getting started, scaffolding, and the build toolchain

### Scaffold

```bash
npm create octane my-app
cd my-app
npm run dev
```

`pnpm create octane`, `yarn create octane`, and `npx create-octane` reach the same place. Templates
are selectable up front [S3]:

```bash
npm create octane my-app -- --template spa        # client-only app
npm create octane my-app -- --template fullstack  # routing, SSR, and a server route
```

- `spa` = "the compiler plugin, an `index.html`, and an entry that mounts one component."
- `fullstack` = adds `octane.config.ts`, streaming SSR, hydration, a `GET /api/health` server route.
- `--no-install` skips install and prints the dependency list. [S3]

**This project wants `spa`.**

For an existing project, `pnpm dlx @octanejs/cli init` writes the same files, "including the
TypeScript settings `.tsrx` needs" [S3].

### There is a compiler step — Octane is not runtime-only

Octane "compiles React-like components into direct DOM code, eliminating the virtual DOM layer"
[S1]. The compiler is exposed at `octane/compiler` with bundler adapters [S1]. Supported bundlers:
**Vite, Rspack, Rsbuild** [S3] (plus `rspeedy` in the CLI's integration map [S12]), and Octane
"also supports Astro, Docusaurus, and TanStack Start" [S1].

### Vite wiring

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';

export default defineConfig({
	plugins: [octane()],
});
```

"Without an `octane.config.ts`, the plugin compiles a normal client-only SPA and leaves Vite's HTML
handling alone. Add an Octane config with routes to turn on routing, streaming SSR, hydration, and
client/server production builds." [S3]

**Important nuance for a client-only SPA:** the CLI's own integration map shows that for `spa` mode
on Vite, the plugin specifier is **`octane/compiler/vite`** and the extra package list is **empty** —
`@octanejs/vite-plugin` is only added for `fullstack` mode [S12]:

```js
vite: {
    spa:       { specifier: 'octane/compiler/vite',  packages: [] },
    fullstack: { specifier: '@octanejs/vite-plugin', packages: ['@octanejs/vite-plugin'] },
},
```

So a pure SPA needs only the `octane` package itself. The docs' `@octanejs/vite-plugin` example also
works (it is the superset). The mixed React/Octane example in the docs likewise imports from
`octane/compiler/vite` [S5].

### Mounting

```ts
// main.ts
import { createRoot } from 'octane';
import { App } from './App.tsrx';

const root = createRoot(document.getElementById('root')!);
root.render(App, { title: 'Hello world!' });
```

"`root.render(<App />)` works too. The first `render()` mounts synchronously." [S3]

### Exact package names and versions (npm, checked 2026-09-06)

| Package | Latest | Published |
| --- | --- | --- |
| `octane` | **0.2.3** | 2026-09-04 |
| `create-octane` | 0.0.9 | 2026-08-28 |
| `@octanejs/cli` | 0.0.9 | 2026-08-28 |
| `@octanejs/vite-plugin` | 0.1.52 | 2026-09-02 |
| `@octanejs/app-core` | 0.0.48 | 2026-09-02 |
| `@octanejs/tanstack-query` | 0.1.52 | 2026-09-04 |
| `@octanejs/tanstack-store` | **0.0.47** | 2026-09-04 |
| `@octanejs/tanstack-router` | 0.1.52 | 2026-09-04 |
| `@octanejs/motion` | 0.1.52 | 2026-09-04 |
| `@octanejs/lucide` | 0.1.47 | 2026-09-02 |
| `@octanejs/sonner` | 0.1.47 | 2026-09-02 |
| `@octanejs/testing-library` | 0.1.50 | 2026-09-04 |
| `@octanejs/dexie` | 0.1.46 | 2026-09-04 |
| `@octanejs/shadcn` | 0.0.37 | 2026-09-02 |
| `@octanejs/better-auth` | 0.0.4 | 2026-09-02 |

Source: npm registry `dist-tags.latest` + `time` [S21].

### Hard toolchain constraints

`octane@0.2.3` `engines`: **`node >= 22.22.2`**. `peerDependencies`: `react ^19.0.0`,
`react-dom ^19.0.0`, `typescript ^5.9.3`, `vite ^8.0.16` [S21]. The docs restate the Node floor:
"Octane's published packages require Node.js 22.22.2 or newer" [S3].

---

## 2. The component API — how close to React really?

### Standard `.tsx` works unchanged

> "Octane compiles standard `.tsx`/`.jsx` out of the box, so a component pasted from the React docs
> works, hooks and all. `.tsrx` is the dialect that unlocks the rest of the compiler: template
> control flow, keyed collections, and a shorthand that lets setup sit next to the output. You can
> mix both in one app and import freely across the boundary." [S8]

This is the single most important fact for our migration from the SmartInv React template: **we can
start in plain `.tsx` and adopt `.tsrx` only where we want template directives.**

Octane "implements React's programming model — the same hooks, `memo`, context, portals, Suspense,
transitions, actions, and SSR/streaming APIs" [S9]. `useState` exists and is imported from `octane`.

### The `@{ … }` shorthand (TSRX only)

```jsx
import { useState } from 'octane';

export function Counter() @{
	const [count, setCount] = useState(0);

	<button onClick={() => setCount(count + 1)}>
		{'Count: ' + count}
	</button>
}
```

> "`@{ … }` is shorthand for returning JSX. `function f() @{ … }` desugars to
> `function f() { … return <jsx> }` … The `@{ … }` scope ends with exactly one output node, a JSX
> element or a fragment. Both forms compile identically, and any function can use either." [S8]

The explicit-`return` form is identical:

```jsx
export function Counter() {
	const [count, setCount] = useState(0);
	return <button onClick={() => setCount(count + 1)}>{'Count: ' + count}</button>;
}
```

### Hooks: no rules of hooks

> "Hooks may sit behind a condition or after an early return … This is valid in Octane because the
> compiler assigns each hook call site a stable slot; hooks are not identified by call order." [S9]

```tsx
function Editor({ editable, initialValue }) {
  if (!editable) return <ReadOnly />;
  const [draft, setDraft] = useState(initialValue);   // legal in Octane
  return <input value={draft} onInput={(e) => setDraft(e.currentTarget.value)} />;
}
```

**The one exception is a plain JS loop** — it is a compile error, because every iteration would
share one slot [S9]:

```tsx
for (const item of items) {
  useState(false); // Compile error
}

@for (const item of items; key item.id) {
  const [open, setOpen] = useState(false); // Separate state for each key.
  <Row item={item} open={open} onToggle={() => setOpen(!open)} />
}
```

`use()` and `useContext` are exempt from the loop restriction [S9].

### Dependency arrays are optional

> "Dependency arrays are optional for `useEffect`, `useLayoutEffect`, `useInsertionEffect`,
> `useMemo`, `useCallback`, and `useImperativeHandle`" [S9]

```tsx
useEffect(() => save(order.id));            // Inferred: [order.id]
useEffect(() => save(order.id), [order]);   // Exactly [order]
useEffect(() => save(order.id), []);        // Exactly []; never rewritten
useEffect(() => save(order.id), null);      // Run after every render
useEffect(makeEffect());                    // Compile error: pass an array or null
```

"An explicit array is authoritative and keeps React's exact behavior; `null` opts out of tracking."
[S9]

### Refs are props — no `forwardRef`

```tsx
function Search({ ref }) @{
  <input ref={ref} />
}

<Search ref={[inputRef, measure]} />
```

> "Components receive refs as ordinary props; there is no `forwardRef` wrapper. … A ref may be a
> callback, a `{ current }` object, or an array of refs." [S9]

`forwardRef` and `createRef` are **not implemented** [S9]. `<Fragment ref={…}>` gives a typed
`FragmentInstance` without a wrapper element; the `<>…</>` shorthand cannot take a ref [S9].

### Events are native — **this is the biggest day-to-day gotcha**

> "Handlers receive the browser's real `Event` object, not a React `SyntheticEvent` wrapper. There
> is no event pooling, and `event.currentTarget` is the handler's element." [S9]

```tsx
<button onClick={(event) => {
    console.log(event instanceof MouseEvent); // true
}} />
```

Concrete consequences [S9]:

- **"There are no synthetic `onChange`/`onBeforeInput`/`onSelect` polyfills — use the native events
  (`onInput` etc.)."** In Octane `onChange` means the *platform* `change` event, which fires on
  commit/blur.
- `onFocus`/`onBlur` use bubbling `focusin`/`focusout`.
- `mouseenter`/`pointerenter` are the real native events, not synthesized from `over`/`out`.
- Root listeners are non-passive, so `preventDefault()` in `onWheel`/`onTouchMove` can cancel scroll.

Octane emits a diagnostic `OCTANE_NATIVE_TEXT_ONCHANGE` when a text input appears to use React's
per-edit `onChange` convention; the warning never rewrites the event [S8]. Intentional
commit-on-blur can be marked with `suppressNativeChangeWarning` [S8]:

```tsx
<input defaultValue={savedDraft} onChange={(e) => save(e.currentTarget.value)} suppressNativeChangeWarning />
```

**Controlled inputs otherwise match React exactly**: "Controlled `value`/`checked` on
`<input>`/`<textarea>`/`<select>` match React (2026-07-08): the prop drives the DOM property and
reasserts on every commit and after discrete events … IME composition is respected, radio groups
restore as a group … `defaultValue`/`defaultChecked` are the uncontrolled escape hatch." [S9]

`<textarea>` with children AND a `value`/`defaultValue` prop is a compile error [S9].

### Conditional rendering and lists (TSRX directives)

> "Rendered control flow uses directive-prefixed blocks: `@if`, `@for`, `@switch`, and `@try`. Plain
> JavaScript control flow stays in setup code." [S8]

```jsx
export function Feed(props) @{
	<ul>
		@for (const item of props.items; key item.id) {
			<li>{item.title as string}</li>
		} @empty {
			<li>Nothing to show</li>
		}
	</ul>
}
```

```jsx
export function Greeting(props) @{
	@if (props.name) {
		<p>{'Hello, ' + props.name}</p>
	} @else {
		<p>Hello, stranger</p>
	}
}
```

Gotcha: "A bare expression statement such as `console.log(value);` or `value;` is setup and does not
render; to render a computed value, make the output explicit with a fragment: `<>{value}</>`." [S8]

Errors: "Errors have two forms: the `<ErrorBoundary>` component, or `@try` / `@pending` / `@catch`
in TSRX." [S8] Class error boundaries do not exist [S9].

### Other conveniences

- **`class`/`className` compose clsx-style** from strings, numbers, arrays, objects and any nesting;
  falsy parts drop out [S8]. No `clsx` dependency needed.
- **Context is a callable provider object, no `Consumer`** [S9].
- Scoped `<style>`, `$class`, and `apply` are built into TSRX [S8].

### React idioms that do NOT carry over

Octane explicitly does not implement [S9]:

- class components, or legacy `ReactDOM.render` roots
- **Server Components / RSC**, `cache()`, `cacheSignal()`
- `StrictMode` double-invoke (`StrictMode` is a pass-through wrapper that does not replay)
- `Profiler`, `SuspenseList`, **`forwardRef`**, **`createRef`**
- `captureOwnerStack` / development owner-stack collection
- partial pre-rendering (`resume`/`resumeAndPrerender`)
- gesture View Transitions (`useSwipeTransition`, `unstable_startGestureTransition`)

`useDebugValue` is a no-op; `useFormState` is a deprecated alias for `useActionState`;
`unstable_batchedUpdates` just invokes its callback because updates are already microtask-batched
[S9]. Type aliases `ReactNode`/`ReactElement` exist as migration aliases but "do not make Octane
elements renderable by a React root" [S9].

---

## 3. `OctaneCompat` / React interop — verified

**The CLAUDE.md claim is substantially correct but the package name is wrong.**

- ✅ `OctaneCompat` **exists** and "supports the opposite direction: compiled Octane components
  inside React 19." [S5]
- ❌ It is **not** in `@octanejs/compat` (which does not exist). It is exported from **`octane/react`**,
  the same entry as `ReactCompat`; the server implementation is `octane/react/server`. [S5][S10]

Both directions exist:

| Direction | Component | Entry |
| --- | --- | --- |
| React component inside Octane | `ReactCompat` | `octane/react` [S5] |
| Octane component inside React 19 | `OctaneCompat` | `octane/react` [S5][S10] |

### `OctaneCompat` API

```tsx
<OctaneCompat>
  <Counter start={3} />
</OctaneCompat>
```

or the typed component/props form [S10]:

```tsx
<OctaneCompat component={Counter} props={{ start: 3 }} />
```

"React transports the component and props; it never directly invokes the Octane component." Props
are type-checked at the call site. "Octane element values are still not ordinary React renderables
outside this component transport." [S10]

### `OctaneCompat` limitations [S10]

- Introduces a **`div[data-octane-compat]` wrapper** — cannot be placed in restricted content models
  (table rows, `<select>`, SVG trees).
- **Cannot hoist `title`, `meta`, or `link` during React SSR.**
- Nested React → `OctaneCompat` → `ReactCompat` **server** rendering is unsupported (client nesting
  works in both directions) [S5][S10].
- "Prefer a boundary around a useful subtree over one per tiny widget" — each island adds a separate
  root with its own scheduling and lifecycle overhead [S10][S5].

### `ReactCompat` (React inside Octane) — likely more relevant to us

Requires **React and React DOM 19.2 or newer**, matching versions [S5].

```tsx
// App.tsrx
import { ReactCompat } from 'octane/react';
import { Counter } from './Counter.react';

export function App() @{
	<ReactCompat>
		<Counter start={3} />
	</ReactCompat>
}
```

Key constraints [S5]:

- Each island is one `div[data-react-compat]` host. "Octane never reconciles its interior." Place it
  where a div is valid.
- Accepts a **single** function, class, `memo`, `lazy`, or `forwardRef` component. "fragments, DOM
  elements, arrays, and multiple island roots are rejected."
- Changing props updates the existing React root and preserves state/DOM identity. Changing the
  child key or type replaces the React component.
- "The React root starts or updates after the Octane host commits. `root.render()` and Octane
  `flushSync()` do not synchronously flush React work." An Octane transition is **not** a shared
  transaction across the two renderers.
- Context must be bridged explicitly with `bridgeReactContext(OctaneCtx, ReactCtx)` passed as
  `contexts` to the boundary. (The reverse direction is easier: an Octane component inside
  `OctaneCompat` "can already read a real React context directly with Octane's `use` or
  `useContext`.") [S5]
- Cost: "Only importing `octane/react` adds the React integration. Native-only client bundles do not
  include React." [S5]

### Mixed-app compiler ownership

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	plugins: [octane({ requireDirective: true }), react()],
});
```

"`.tsrx` files always belong to Octane. Mark Octane-owned `.tsx` files … with
`/** @jsxImportSource octane */`; mark React-owned JSX with `/** @jsxImportSource react */`. **Do
not alias React or React DOM to Octane.**" [S5]

---

## 4. `docs/bindings-status.md` — the per-package status file

**It exists**, at `docs/bindings-status.md` in the octanejs/octane repo [S11]. It is a **generated**
file (`pnpm bindings:status`), sourced from each `packages/<name>/status.json`, and
`pnpm bindings:status:check` runs in CI "so a scope change that isn't reflected here fails the
build" [S11].

It covers **107** `@octanejs/*` bindings (more than the ~40 previously counted) with columns:
`Package · Ports · Supported surface · Known divergences · SSR / hydration · Last checked` [S11].

The file's own caveat: "The bindings deliberately sit at different maturity levels… 'Last checked'
records when the stated scope and its supporting evidence were most recently reviewed. It does
**not** certify full semantic parity outside the supported surface." [S11]

### The packages we plan to use

**`@octanejs/tanstack-query`** — ports `@tanstack/react-query@5.101.3`. Last checked 2026-08-02. [S11]
> Supported surface: "**Complete: 58/58 runtime exports** plus the full TypeScript surface; the
> export surface is byte-identical to upstream in both directions (locked by test), and
> `@tanstack/query-core` is re-exported verbatim."
> Known divergences: "Suspense integrates via octane's `use(thenable)` rather than throwing a
> promise (observable behavior matches)."
> SSR: "`HydrationBoundary` is fully ported… dedicated streaming server entries remain open."

**Verdict: the strongest binding in our stack. No practical blockers for a client-only SPA.**

**`@octanejs/tanstack-store`** — ports `@tanstack/react-store@0.11.0`. Last checked 2026-08-09. [S11]
> "Re-exports `@tanstack/store@0.11.0` unchanged and implements the stable React binding surface
> (`useSelector`, `useAtom`, `useCreateAtom`, `useCreateStore`, `createStoreContext`, and deprecated
> `useStore`) on Octane hooks."
> Known divergence: "The upstream experimental `_useStore` hook is intentionally omitted; use
> `useSelector` with `store.actions` or `store.setState` instead."
> SSR: supported.

**Verdict: fine. Just avoid `_useStore`.** Note its npm version is `0.0.47` — the lowest of our set.

**`@octanejs/motion`** — ports `motion@12.42.2`. Last checked 2026-08-02. [S11]
> Supported: `motion.<tag>` (animate, gestures, variants with propagation/stagger, drag, layout
> basics), `AnimatePresence`, `MotionConfig`, live `useReducedMotion`, `LayoutGroup`, `LazyMotion`
> with `domAnimation`/`domMax`, the `m` proxy, and the motion-value hooks (`useMotionValue`,
> `useScroll`, `useTransform`, `useSpring`, `useAnimate`, `useMotionValueEvent`).
> **Known divergences:** "Exit animations run via cleanup-before-detach instead of React's deferred-
> deletion machinery; **`layout`/`layoutId` use single-element FLIP, not the full projection tree**;
> An `initial` target without an `animate` target does not materialize inline initial styles; set
> the starting style explicitly or provide an animation target."
> SSR: "No SSR-specific surface; no dedicated SSR tests."

**Verdict: fine for micro-interactions (what the template uses). Do not rely on shared-layout
`layoutId` transitions.**

**`@octanejs/lucide`** — ports `lucide-react@1.24.0`. Last checked 2026-08-02. [S11]
> "**Complete** against the published `lucide-react@1.24.0` runtime surface: every canonical icon and
> alias, the `icons` namespace, `Icon`, `createLucideIcon`, `LucideProvider`, `useLucideContext`,
> `DynamicIcon`, `iconNames`, `dynamicIconImports`, and per-icon subpath imports."
> Divergences: refs are normal props, not `forwardRef`; native DOM events.
> SSR: supported and tested.

**Verdict: drop-in.**

**`@octanejs/sonner`** — ports `sonner@2.0.7`. Last checked 2026-08-02. [S11]
> "**Complete** against the published `sonner@2.0.7` public surface: `Toaster`, the callable `toast`
> API and all methods, `useSonner`, promise lifecycle, multiple toaster targeting, stacked layout,
> themes, styling, focus management, timers, and swipe dismissal."
> Divergences: native `MouseEvent`s in action callbacks; `Toaster` takes ref as a normal prop.
> SSR: supported and tested.

**Verdict: drop-in.**

**`@octanejs/dexie`** — ports `dexie-react-hooks@4.4.0`. Last checked 2026-08-02. [S11]
Relevant because CLAUDE.md §4.3 wants an IndexedDB-backed pending-write buffer.
> "Port of the public dexie-react-hooks surface: `useObservable`, `useLiveQuery`,
> `useSuspendingObservable`, `useSuspendingLiveQuery`, `usePermissions`, and `useDocument`, with
> Dexie's framework-neutral API re-exported from the package root."
> Divergences: suspending hooks use Octane's `use()`; `useDocument` requires y-dexie + yjs.
> SSR: "SSR returns the configured default without opening IndexedDB."

**Verdict: usable for the offline queue.**

**`@octanejs/testing-library`** — see §5. **`@octanejs/tanstack-router`** — see §6.
**`@octanejs/shadcn`** and **`@octanejs/radix`** — see §7 (these carry the real caveats).

### Companion file: `docs/binding-parity-gaps.md`

A second generated file audits executable `it.fails(…)` pins across all 107 bindings [S15]. Headline:

> "**29 active pin(s) across 107 binding package(s).**"

**All 29 are in `@octanejs/floating-ui`.** Every other binding — including tanstack-query,
tanstack-store, tanstack-router, motion, lucide, sonner, dexie, shadcn, radix, testing-library — is
at **0 pins** [S15].

The failing floating-ui cases are concentrated in `FloatingFocusManager`, `useListNavigation`, and
`useTypeahead`: focus return after hover-open, closing on escape, nested-menu keyboard navigation,
grid navigation with changing/disabled items, and typeahead in menus [S15]. **This matters to us
indirectly: Radix/shadcn overlays (dropdown, popover, select, menus) sit on floating-ui**, so
keyboard navigation and focus-return edge cases in those components are the least-proven area of the
UI stack.

The file's own caveat: "Zero pins does **not** imply complete upstream parity." [S15]

The equivalent core-framework file, `docs/parity-gaps.md`, reports **0 active pins**, and repository
policy requires it to stay at zero [S16].

---

## 5. TypeScript support and testing

### TypeScript

TypeScript is first-class; `octane` declares `typescript: ^5.9.3` as a peer dependency [S21]. The
`tsconfig.json` the CLI writes is [S12]:

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["esnext", "dom", "dom.iterable"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "jsxImportSource": "octane",
    "plugins": [{ "name": "@tsrx/typescript-plugin" }]
  },
  "include": ["src/**/*", "vite.config.ts", "octane.config.ts"]
}
```

Dev dependencies added by `init`: `@tsrx/typescript-plugin`, `@tsrx/prettier-plugin`, `prettier`
(plus `vite` when init creates the bundler config) [S12].

**The typecheck script is not `tsc`:**

```json
{ "typecheck": "tsrx-tsc --noEmit -p tsconfig.json" }
```

with the comment: "`tsrx-tsc` is the only typechecker that reads `.tsrx`, regardless of how the
project builds." [S12]

⚠️ **TypeScript version pin.** The CLI source comments that TypeScript "is absent from this list on
purpose, but it does get installed: naming it here would take the newest major, which `tsrx-tsc`
cannot start under, so it is installed afterwards at the range `@tsrx/typescript-plugin` declares as
its peer." [S12] That peer range is currently `typescript: ^5.9.3` [S21]. **Do not upgrade
TypeScript past what `@tsrx/typescript-plugin` allows.**

Octane exports React-equivalent types from `octane`: `HTMLAttributes`, `CSSProperties`, `Ref`, `FC`,
`ComponentProps`, and the event families (`MouseEvent<T>`, `MouseEventHandler<T>`, `InputEvent<T>`)
— but these "describe native DOM events with a typed `currentTarget`; they have no `nativeEvent`,
`persist`, or synthetic propagation methods." Prefer `OctaneNode` and `ElementDescriptor` over the
`ReactNode`/`ReactElement` migration aliases in new code. [S9]

### Testing

⚠️ **There is no testing page on the docs site.** `https://octanejs.dev/docs/testing` returns
"Document not found. No document named 'testing'." [S14] The authoritative source is the package
README [S13].

**Vitest works.** The README references Vitest directly [S13]:

> "importing the package root auto-registers `afterEach(cleanup)` … but only when your runner
> exposes **global** test hooks (vitest `globals: true`, jest). With `globals: false`, register it
> yourself:"

```ts
import { cleanup } from '@octanejs/testing-library';
import { afterEach } from 'vitest';
afterEach(cleanup);
```

**Architecture:** "`@testing-library/dom` is framework-agnostic and reused verbatim — every query,
`screen`, `within`, `waitFor`/`waitForElementToBeRemoved`, `findBy*`, `prettyDOM`, `configure` —
while only react-testing-library's thin React layer is ported to octane: `render`, `cleanup`,
`renderHook`, the `act` re-export, and the focus/blur event helpers." [S13]

```ts
import { render, screen, fireEvent, cleanup } from '@octanejs/testing-library';
import { Counter } from './Counter.tsrx';

afterEach(cleanup);

test('increments', () => {
	render(Counter, { props: { step: 2 } });
	fireEvent.click(screen.getByRole('button'));
	expect(screen.getByRole('button').textContent).toBe('Count: 2');
});
```

API: `render(ui, options?)`, `cleanup()`, `renderHook(cb, opts?)`, `act` (always async — always
`await` it), plus re-exported `screen`/`waitFor`/`within` and `fireEvent` [S13].

Octane-specific `render` forms (there is no JSX in a plain `.ts` test) [S13]:

```ts
render(Counter, { props: { step: 2 }, wrapper: Providers });
render(createElement(Counter, { step: 2 }), { wrapper: Providers });
rerender(Counter, { props: { step: 3 } });
rerender({ props: { step: 3 } }); // shorthand
```

**Test-porting gotchas** [S13]:

- **`fireEvent.change` fires a native `change`, not React's per-edit convention.** "RTL tests
  habitually drive text inputs with `fireEvent.change`. In octane `onChange` means the platform
  `change` event (fires on commit/blur), and `onInput` fires per keystroke — **port such tests to
  `fireEvent.input`**."
- Checkables need `await user.click(checkbox)` for the full native `click → input → change`
  sequence; `fireEvent.change` alone does not model activation.
- `fireEvent.focus` dispatches `focus` then `focusin`; `fireEvent.blur` dispatches `blur` then
  `focusout`.
- `fireEvent.mouseEnter` dispatches a real `mouseenter` and does **not** also dispatch `mouseover`.
- "Every dispatch commits before returning" — `eventWrapper` runs each dispatch in `flushSync` and
  drains effects.
- **Not ported by design:** the `ReactStrictMode` wrapper, `legacyRoot`, and the
  `onCaughtError`/`onRecoverableError` options [S11].

**`@testing-library/user-event` works as-is** — "no octane adapter needed. `user-event` is
framework-agnostic and dispatches **real native events**, which is exactly octane's event model (a
better fit than React…)." [S13]

**`renderHook` caveat:** hooks are keyed by compiler-assigned call-site slots. "the vite plugin's
surgical pass slots base-hook calls in plain `.ts`, and `.tsrx`/`.tsx` hooks are fully compiled."
A hand-written callback calling **two or more base hooks directly without compilation** needs
explicit slot symbols: `useState(0, Symbol.for('a'))` [S13]. **Practical implication: run Vitest
through the Octane Vite plugin**, not a bare Node transform.

`UNKNOWN — could not find` an explicit statement of the required DOM environment (jsdom vs
happy-dom) for Vitest, or a documented example `vitest.config.ts`. Not stated in [S13] or [S14].

---

## 6. Routing

**No router is designated as official or recommended.** The bindings page "lists six routing
bindings equally": `@octanejs/inertia`, `@octanejs/nuqs`, `@octanejs/remix-router`,
`@octanejs/tanstack-router`, `@octanejs/tanstack-router-ssr-query`, `@octanejs/wouter` [S6].

There is also a **first-party metaframework router** in `@octanejs/app-core` — described in the repo
package table as "metaframework core" [S19], and reached via `octane.config.ts` routes, which "turn
on routing, streaming SSR, hydration, and client/server production builds" [S3]. The `fullstack`
template scaffolds it [S3]. Note however that the bindings docs page makes no mention of it [S6],
and it is coupled to the SSR/fullstack path — **not** the client-only SPA path we want.

### `@octanejs/tanstack-router` (0.1.52)

Ports `@tanstack/react-router@1.170.18`. Last checked 2026-08-02. **0 parity pins** [S11][S15].

> Supported: "typed route factories and hooks, the full Match pipeline and lifecycle, file routes
> with TSRX-aware generator integration, full Link navigation/preloading/masking behavior, blocking,
> Await/deferred hydration, scroll restoration, lazy routes, not-found handling, document/head
> assets, and client/server SSR entries."
> **Known divergences:** "Refs are props — `createLink`'s `forwardRef` becomes a `ref` prop; Link
> callbacks receive native DOM events rather than React synthetic events; **Router devtools are
> distributed separately**."
> Coverage note: "covered by Octane-only framework-contract tests in ordinary shards (**not a React
> SSR oracle**)." [S11]

**Verdict: the most complete router binding, and the safe pick given we already use TanStack Query
and Store.**

### `@octanejs/wouter` (alternative, lighter)

Ports `wouter@3.10.0`. Last checked 2026-08-20. 0 pins. [S11][S15]
> Divergence worth knowing: "**Switch inspects explicit element descriptors, while nested TSRX
> children are opaque and must be supplied as descriptor arrays or `createElement` results**."

That last point is a real authoring constraint — `<Switch>` children cannot be written as ordinary
TSRX blocks.

---

## 7. Known gaps and caveats stated by the maintainers

### Overall stability

- The site states plainly: **"Octane and its bindings are beta software."** [S6]
- The repo README: **"Octane remains in beta."** with "3,900+ distinct behavioral tests" [S1].
- The generated parity report gives the real breakdown: **3,584 normal core cases** (2,075
  conformance, 137 differential, 135 hydration, 1,237 other), 3,598 distinct including profiling,
  9,955 total workspace executions. It warns these "are different units and must not be added
  together or described interchangeably as 'ported React tests.'" [S20]

### The vetting checklist the maintainers publish

Before adopting a binding, check [S6]:
1. "Is the hook or component you need included?"
2. "Does a known difference affect your code?"
3. "If you render on the server, is SSR and hydration covered?"

### Things that would bite a small CRUD/PWA app

1. **Native events, not synthetic** — the single highest-frequency porting bug. Every text input in
   a form ported from React must move `onChange` → `onInput` [S8][S9][S13]. Octane emits
   `OCTANE_NATIVE_TEXT_ONCHANGE` to catch it, but only for statically-known JSX and dev-time
   resolved props [S8].
2. **`forwardRef` does not exist** — any template component using it must be rewritten to ref-as-prop
   [S9].
3. **`@octanejs/floating-ui` holds all 29 known failing cases**, concentrated in focus management,
   list/grid keyboard navigation, and typeahead [S15]. This is the substrate for Radix/shadcn
   overlays. For a kiosk/touch app the keyboard-nav gaps are lower risk, but focus-return-on-close
   behavior is worth testing manually.
4. **`@octanejs/radix` is "recorded-unverified"**: "Sixteen repo-authored differential cases compare
   representative primitives … but the complete 38-file canonical upstream suite is preserved but
   not adapted, so the binding remains recorded-unverified." Also "SSR/hydration coverage for the
   overlay/portal components is still open." [S11]
5. **`@octanejs/shadcn` `asChild` semantics differ**: "`asChild` composes element descriptors
   (`createElement`) rather than opaque compiled `.tsrx` children." Portal wrappers
   (`DialogPortal`, `DropdownMenuPortal`, …) have the same constraint — "direct Portal children must
   be descriptors." Also, "Portal-backed overlays/menus/Select are excluded [from SSR coverage] until
   the radix binding supports overlay SSR." And at the current pin, "SidebarProvider does not mount a
   TooltipProvider, so consumers using SidebarMenuButton's tooltip prop must provide one." [S11]
   The shadcn base is also mid-migration between styling flavors and its Base UI base is explicitly
   **PARTIAL (21 of 44 families)** with some class strings "NOT yet verified against upstream" [S11].
6. **No RSC, no `StrictMode` double-invoke, no class error boundaries** [S9] — none of which we need.
7. **Hot module updates remount the edited component** (§ heading in [S9]) — a DX detail, not a
   correctness issue.
8. **Version churn.** Every package in our stack published within the last week, and most have
   40–50 published versions in a package under 6 months old [S21]. **Pin exact versions.**

### Scheduler / reconciler notes

The reconciler uses "LIS moves, identical results" and the scheduler is "synchronous, two
priorities" (section headings in [S9]) — different internals from React, same observable results per
the parity contract.

---

## 8. Clerk — the real options

**Established: `@octanejs/clerk` does not exist.** Confirmed against the full 107-package binding
list, which contains no Clerk entry [S11].

### Option A (recommended path) — vanilla `@clerk/clerk-js`

**Clerk publishes a genuine framework-agnostic JavaScript SDK.** Clerk's docs describe ClerkJS as
"our foundational JavaScript library for building user management and authentication" that "enables
you to register, sign in, verify, and manage users for your application using highly customizable
flows" [S17]. The npm package is **`@clerk/clerk-js`** [S18].

Decisive fact: **`@clerk/clerk-js@6.31.0` (published 2026-09-02) declares zero peer dependencies**
[S22] — it does not require React. This is the clean integration point.

Install and initialize [S18]:

```bash
npm install @clerk/clerk-js
```

```js
import { Clerk } from '@clerk/clerk-js'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!publishableKey) {
  throw new Error('Add your VITE_CLERK_PUBLISHABLE_KEY to the .env file')
}

const clerkDomain = atob(publishableKey.split('_')[2]).slice(0, -1)

await new Promise((resolve, reject) => {
  const script = document.createElement('script')
  script.src = `https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`
  script.async = true
  script.crossOrigin = 'anonymous'
  script.onload = resolve
  script.onerror = () => reject(new Error('Failed to load @clerk/ui bundle'))
  document.head.appendChild(script)
})

const clerk = new Clerk(publishableKey)
await clerk.load({
  ui: { ClerkUI: window.__internal_ClerkUICtor },
})
```

UI is mounted imperatively into DOM nodes: **`clerk.mountSignIn(element)`** and
**`clerk.mountUserButton(element)`**; auth state is read via **`clerk.isSignedIn`** [S18].

**How this maps onto Octane:** the imperative `mountX(element)` API pairs naturally with a `ref` prop
plus a `useEffect` — an Octane ref is an ordinary prop and may be a callback or `{ current }` object
[S9]. Session/user state would live in TanStack Store, updated from Clerk's listener.

Note the quickstart loads `@clerk/ui` from Clerk's CDN at runtime rather than bundling it — relevant
to our offline/PWA goal (see §9) and to any CSP we set.

`UNKNOWN — could not find` the exact `clerk.addListener` / session-change subscription API signature;
the quickstart shows only `isSignedIn`. Clerk's "key Clerk objects reference" is cited by the docs
[S17] but was not retrieved.

### Option B — React Clerk SDK inside `ReactCompat`

Technically available: `ReactCompat` hosts a real React component and requires React/ReactDOM ≥ 19.2
[S5]. Costs: pulls React + React DOM into the bundle ("Only importing `octane/react` adds the React
integration" [S5]), adds a React root per island, needs explicit context bridging via
`bridgeReactContext` for any Octane state the React subtree must read [S5], and constrains where the
boundary can sit (a `div`, not a table row or SVG) [S5]. For an auth wrapper that must sit at the app
root, this is heavier than Option A.

### Option C — `@octanejs/better-auth` (different vendor, noted for completeness)

A first-party Octane auth binding does exist, but for **Better Auth**, not Clerk. Ports
`better-auth@1.6.29`, last checked 2026-08-17, 0 parity pins [S11][S15]:
> "The public framework-agnostic Better Auth client is reused unchanged. `createAuthClient` converts
> the built-in session atom and plugin-provided atoms into Octane hooks while preserving endpoint
> actions, `$fetch`, `$store`, `$ERROR_CODES`, `$Infer`, and plugin inference."

This is only relevant if the Clerk decision were ever reopened; CLAUDE.md has Clerk as a
non-negotiable constraint.

### QR / barcode scanning — same situation

No `@octanejs/zxing`, `@octanejs/html5-qrcode`, or any QR/barcode binding exists in the 107-package
list [S11]. This is fine: both candidate libraries are framework-agnostic DOM libraries with no React
peer dependency — `@zxing/browser@0.2.1` peers only on `@zxing/library`, and `html5-qrcode@2.3.8`
declares no peers at all [S22]. They are driven imperatively against a `<video>`/container element,
which works the same in Octane as in React (ref + effect) [S9].

---

## 9. PWA and static build

### Static build: confirmed working

For a client-only SPA, `vite build` produces standard static browser assets deployable to any static
host including Vercel and Cloudflare Pages [S4]. From the build-tools docs: "Without
`octane.config.ts`, the plugin compiles Octane source and leaves Vite's normal client-only SPA
behavior intact." [S4]

**SSR is opt-in, not required** — it activates only when routes are added to `octane.config.ts`
[S3][S4]. Deployment adapters (e.g. a Cloudflare adapter) exist for **SSR** applications; "Static
SPAs require no adapters — standard host deployment suffices." [S4]

HMR works through Vite's standard mechanism, "including its `import.meta.hot` HMR dialect" [S4].

**This satisfies CLAUDE.md's constraint #3 (SPA deployable as a static site with no server we
operate).**

### PWA / service worker

`UNKNOWN — could not find any Octane-specific PWA, service-worker, manifest, or offline
documentation` in the docs site navigation [S2] or the repo `docs/` directory listing [S19].

What *is* verifiable: PWA support at the Vite plugin layer is framework-agnostic, and the version
constraint lines up. **`vite-plugin-pwa@1.3.0` (published 2026-05-05) declares
`vite: "^3.1.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0"`** [S22] — which includes the
Vite 8 that `octane@0.2.3` requires as a peer [S21]. `workbox-window@7.4.1` has no peers [S22].

⚠️ Not verified by anyone: **no source states that `vite-plugin-pwa` and the Octane compiler plugin
have been tested together.** The version ranges are compatible; actual interoperation is unproven and
should be a Phase-0 spike item.

One offline-relevant interaction to flag: the Clerk quickstart fetches `@clerk/ui` from Clerk's CDN at
runtime [S18], which is a network dependency at sign-in time regardless of service-worker caching.

---

## 10. Open items for the Phase-0 spike

Derived from the `UNKNOWN`s above. Each is cheap to answer by building, and expensive to assume.

1. `vite-plugin-pwa` + Octane Vite plugin in one config — does the service worker precache the
   compiled output correctly?
2. Vitest DOM environment (jsdom vs happy-dom) and a working `vitest.config.ts` that routes tests
   through the Octane Vite plugin (required for `renderHook` slotting [S13]).
3. `@clerk/clerk-js` mounted via an Octane ref + effect — including the session-change listener API,
   which is not documented in the quickstart.
4. `@zxing/browser` camera scanning on iOS Safari inside an Octane component.
5. **Charting decision**: `@tanstack/charts` has no Octane binding [S11]. Choose `@octanejs/visx` or
   `@octanejs/recharts`, noting `@octanejs/recharts` marks `Brush` and `Treemap` unsupported and its
   SSR is "Untested" [S11].
6. Radix/shadcn overlay focus behavior, given the 29 floating-ui pins [S15].

---

## Sources

| Ref | URL |
| --- | --- |
| S1 | https://github.com/octanejs/octane — repo README |
| S2 | https://octanejs.dev — docs site navigation |
| S3 | https://github.com/octanejs/octane/blob/main/docs/getting-started.md |
| S4 | https://octanejs.dev/docs/build-tools |
| S5 | https://github.com/octanejs/octane/blob/main/docs/react-compat.md |
| S6 | https://octanejs.dev/docs/bindings |
| S7 | https://octanejs.dev/docs/quick-start (hosted version of S3) |
| S8 | https://github.com/octanejs/octane/blob/main/docs/tsrx-basics.md |
| S9 | https://github.com/octanejs/octane/blob/main/docs/differences-from-react.md |
| S10 | https://octanejs.dev/docs/react-compat |
| S11 | https://github.com/octanejs/octane/blob/main/docs/bindings-status.md |
| S12 | https://github.com/octanejs/octane/blob/main/packages/cli/src/commands/init/templates.js |
| S13 | https://unpkg.com/@octanejs/testing-library/README.md |
| S14 | https://octanejs.dev/docs/testing — returns "Document not found" |
| S15 | https://github.com/octanejs/octane/blob/main/docs/binding-parity-gaps.md |
| S16 | https://github.com/octanejs/octane/blob/main/docs/parity-gaps.md |
| S17 | https://clerk.com/docs/references/javascript/overview |
| S18 | https://clerk.com/docs/js-frontend/getting-started/quickstart.md |
| S19 | https://github.com/octanejs/octane/blob/main/docs/packages.md and https://api.github.com/repos/octanejs/octane/contents/docs |
| S20 | https://github.com/octanejs/octane/blob/main/docs/react-parity-coverage.md |
| S21 | https://registry.npmjs.org/octane and https://registry.npmjs.org/@tsrx%2ftypescript-plugin |
| S22 | npm registry metadata: https://registry.npmjs.org/@clerk%2fclerk-js · https://registry.npmjs.org/@zxing%2fbrowser · https://registry.npmjs.org/html5-qrcode · https://registry.npmjs.org/vite-plugin-pwa · https://registry.npmjs.org/workbox-window |

Additional non-cited references seen on the docs site: `/docs/tsrx-vs-tsx`, `/docs/lynx`,
`/benchmarks`, `/playground`, `/llms.txt`, Discord https://discord.gg/8puY9fFqd9 [S2].

All npm version and metadata figures checked **2026-09-06**.
