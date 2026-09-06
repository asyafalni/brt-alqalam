import { useState } from 'octane';
import { useDraft } from './state/useDraft';
import { StockTake } from './features/stocktake/StockTake';
import { LabelSheet } from './features/labels/LabelSheet';

type Screen = 'opname' | 'label';

export function App() {
  // One draft, shared. Two screens each loading from storage would be two sources of truth,
  // and the label sheet would quietly print a stale count.
  const draft = useDraft();
  const [screen, setScreen] = useState<Screen>('opname');

  return (
    <>
      <nav class="no-print sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div class="mx-auto flex max-w-5xl gap-2 p-2">
          <Tab active={screen === 'opname'} onPick={() => setScreen('opname')}>
            Opname Gudang
          </Tab>
          <Tab active={screen === 'label'} onPick={() => setScreen('label')}>
            Cetak Label
            {draft.items.length > 0 && (
              <span class="ml-2 rounded-full bg-muted px-2 py-0.5 text-sm tabular-nums">
                {draft.items.length}
              </span>
            )}
          </Tab>
        </div>
      </nav>

      {screen === 'opname'
        ? <StockTake draft={draft} />
        : <LabelSheet items={draft.items} categories={draft.categories} />}
    </>
  );
}

function Tab(
  { active, onPick, children }: { active: boolean; onPick: () => void; children?: unknown },
) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      class={
        'min-h-touch rounded-xl px-5 font-semibold ' +
        (active ? 'bg-primary text-primary-foreground' : 'border-2 border-border')
      }
      onClick={onPick}
    >
      {children}
    </button>
  );
}
