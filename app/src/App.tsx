import { useMemo } from 'octane';
import { useDraft } from './state/useDraft';
import { useInventory } from './state/useInventory';
import { useRoute } from './state/useRoute';
import { StockTake } from './features/stocktake/StockTake';
import { LabelSheet } from './features/labels/LabelSheet';
import { Board } from './features/board/Board';
import { ScanResult } from './features/scan/ScanResult';
import { CARD } from './features/stocktake/ItemForm';

export function App() {
  // One draft, shared. Two screens each loading from storage would be two sources of truth,
  // and the label sheet would quietly print a stale count.
  const draft = useDraft();
  const [route, go] = useRoute();

  // Pinned per mount rather than read on every render: `deriveState` is a pure function of
  // `now`, so a moving clock would recompute the whole fold on every keystroke.
  const now = useMemo(() => Date.now(), []);
  const inventory = useInventory(draft, now);

  const scanning = route.name === 'scan' || route.name === 'scan-empty';

  return (
    <>
      {!scanning && (
        <nav class="no-print sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
          <div class="mx-auto flex max-w-5xl gap-2 overflow-x-auto p-2">
            <Tab active={route.name === 'opname'} onPick={() => go({ name: 'opname' })}>
              Opname
            </Tab>
            <Tab active={route.name === 'board'} onPick={() => go({ name: 'board' })}>
              Stok
              {inventory.notifications.length > 0 && (
                <span class="ml-2 rounded-full bg-menipis px-2 py-0.5 text-sm tabular-nums text-background">
                  {inventory.notifications.length}
                </span>
              )}
            </Tab>
            <Tab active={route.name === 'label'} onPick={() => go({ name: 'label' })}>
              Cetak Label
              {draft.items.length > 0 && (
                <span class="ml-2 rounded-full bg-muted px-2 py-0.5 text-sm tabular-nums">
                  {draft.items.length}
                </span>
              )}
            </Tab>
          </div>
        </nav>
      )}

      {route.name === 'opname' && <StockTake draft={draft} />}
      {route.name === 'board' && (
        <Board items={draft.items} categories={draft.categories} inventory={inventory} />
      )}
      {route.name === 'label' && (
        <LabelSheet items={draft.items} categories={draft.categories} />
      )}
      {route.name === 'scan' && (
        <ScanResult
          target={route.target}
          id={route.id}
          items={draft.items}
          categories={draft.categories}
          inventory={inventory}
          now={now}
          onBack={() => go({ name: 'opname' })}
        />
      )}
      {route.name === 'scan-empty' && (
        <main class="mx-auto max-w-2xl p-4">
          <div class={`${CARD} border-2 border-destructive p-6 text-center`} role="alert">
            <h1 class="mb-2 text-2xl font-bold">Label tidak terbaca</h1>
            <p class="mb-5 text-muted-foreground">
              QR ini tidak menyebut barang apa pun. Mungkin rusak atau tercetak sebagian.
            </p>
            <button
              type="button"
              class="min-h-touch rounded-xl bg-primary px-6 font-semibold text-primary-foreground"
              onClick={() => go({ name: 'opname' })}
            >
              Buka Opname Gudang
            </button>
          </div>
        </main>
      )}
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
        'min-h-touch shrink-0 rounded-xl px-5 font-semibold ' +
        (active ? 'bg-primary text-primary-foreground' : 'border-2 border-border')
      }
      onClick={onPick}
    >
      {children}
    </button>
  );
}
