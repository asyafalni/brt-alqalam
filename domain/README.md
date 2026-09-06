# domain/ — pure domain layer

The heart of the system: data types + the `deriveState` reducer. **No I/O, no framework.**
Identical on client and gateway. Everything else is plumbing around this.

## Run
```bash
npm install
npm test         # 14 Vitest tests (verified passing)
npm run typecheck   # tsc --strict, no emit
```

## Files
- `types.ts` — the data model (Item, AssetInstance, Txn, Derived*).
- `deriveState.ts` — `activeTxns()` (dedupe/reversal/sort) + `deriveState()` (fold → current state).
- `deriveState.test.ts` & `notifications.test.ts` — fixtures covering stock, the 24-jam rule, equipment lifecycle,
  rusak/hilang, reversals, and idempotency.

## Rule of engagement
If the model changes, **change the tests first**, then the reducer. This layer must stay
provable in isolation — it's what protects you from the pre-1.0 UI stack (Octane / TanStack
bindings) and keeps a future storage swap (Sheets → Zig) cheap.
