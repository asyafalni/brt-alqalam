// Primitives ported from SmartInv. Every class string below is read from a real file in
// the cloned template — see docs/SMARTINV-REUSE-MAP.md §4 for the line references.
//
// Ported rather than imported: the template is React and these are ~10 lines each. What
// carries across is the class conventions, which is what the reuse map found is actually
// the template's value (it has no token layer at all).

// --- Card — SmartInv components/Card.tsx:17-19 -----------------------------------------
export const CARD = 'rounded-lg p-5 bg-white shadow-sm border border-slate-200';
/** Card with its own padding removed, for tables — Inventory.tsx:100. */
export const CARD_FLUSH = 'rounded-lg bg-white shadow-sm border border-slate-200 p-0 overflow-hidden';

export function Card({ children, class: cls = '' }: { children?: unknown; class?: string }) {
  return <div class={`${CARD} ${cls}`}>{children}</div>;
}

// --- Page header — Dashboard.tsx:108-113, and the same shape on every other page --------
export function PageHeader(
  { title, subtitle, action }: { title: string; subtitle?: string; action?: unknown },
) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p class="text-sm text-slate-500 sm:text-base">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// --- Button — SmartInv components/Button.tsx:22-37 --------------------------------------
// Sizes gain a `touch` variant: the template's `lg` is py-3 (~44px), and a gudang tablet
// handled with wet hands needs 56px (design doc Part XVI). Everything else is verbatim.
const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 ' +
  'rounded-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none';

// DOSS's restraint applied where it costs nothing: the primary action is black on beige,
// the highest-contrast pairing available, leaving colour free to mean *status*.
const VARIANT = {
  primary: 'bg-slate-900 text-slate-50 hover:bg-slate-800 shadow-sm',
  secondary: 'bg-white text-slate-900 border border-slate-400 hover:bg-slate-100',
  danger: 'bg-red-500 text-white hover:bg-red-600',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-600',
  success: 'bg-[#22C55E] text-white',
  warning: 'bg-[#F59E0B] text-white',
  outline: 'bg-white border border-slate-400 text-slate-700 hover:bg-slate-50',
} as const;

const SIZE = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
  touch: 'px-6 min-h-touch text-base font-semibold', // field-ops extension
} as const;

export function Button(props: {
  children?: unknown;
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  class?: string;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
  onClick?: () => void;
}) {
  const { variant = 'primary', size = 'md', class: cls = '', children, ...rest } = props;
  return (
    <button type="button" class={`${BUTTON_BASE} ${VARIANT[variant]} ${SIZE[size]} ${cls}`} {...rest}>
      {children}
    </button>
  );
}

// --- Input — SmartInv components/Input.tsx:12-25 ----------------------------------------
export const LABEL = 'block text-sm font-medium text-slate-700 mb-1.5';
export const FIELD =
  'w-full px-4 rounded-lg border border-slate-400 bg-white text-slate-900 transition-all ' +
  'duration-200 focus:ring-2 focus:ring-slate-900/40 focus:border-slate-900 ' +
  'placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500 min-h-touch';
export const FIELD_ERROR = 'border-red-500 bg-red-50/20';
export const ERROR_TEXT = 'mt-1.5 text-xs text-red-500 font-medium';

// --- Stat tile — Dashboard.tsx:140-152 --------------------------------------------------
export function Stat(
  { value, label, tint = 'bg-slate-900 text-slate-50' }: { value: unknown; label: string; tint?: string },
) {
  // SmartInv's tile is a desktop row (well + label side by side). Stacked full-width on a
  // phone, three of them consumed a whole screen before any content appeared — so on mobile
  // they become a compact centred three-across row, widening into the template's layout at
  // `sm`. The extension is size, not structure.
  return (
    <div class="flex flex-col items-center gap-1.5 rounded-lg border border-slate-100 bg-white p-3 text-center shadow-sm sm:flex-row sm:gap-4 sm:p-5 sm:text-left">
      <div class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold sm:h-12 sm:w-12 sm:text-xl ${tint}`}>
        {value}
      </div>
      <p class="text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
        {label}
      </p>
    </div>
  );
}

// --- Table conventions — Inventory.tsx:134-186 ------------------------------------------
export const TH = 'px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500';
export const TD = 'px-6 py-4';
export const CODE = 'text-[10px] font-mono uppercase tracking-tighter text-slate-400';
