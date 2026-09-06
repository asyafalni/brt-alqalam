# gateway/ — Apps Script gateway (SPEC, not yet implemented)

Google-hosted, zero-infra. The one component that holds secrets (Clerk secret key, PIN hash map).
All writes + privacy-sensitive reads go through it. Full detail: docs/BRT-Inventory-Build-Spec.md §2.

## Endpoints
- `POST verifyPinAndAppend` — **the transactional submit** (Model C). Verify PIN (rate-limited per
  device) → resolve actor → check clientTxnId not seen → compute stok-awal/akhir → append immutable
  row(s) with server ts → return. A kit expands to N rows in one call.
- `GET state` — PII-free derived snapshot (board + public dashboard). No names.
- `GET stateDetailed` — Clerk-gated; adds holder/recipient + actor identities.
- `GET history` — Clerk-gated; the Transactions log (Histori Data).
- `POST admin/*` — Clerk session (role=admin): createItem, editItem, retireItem, setMinStock,
  adjustStock, addAsset, retireAsset, createUserPin (enforces unique PIN → writes Clerk
  privateMetadata.pinHash), disableUser. Each APPENDS to a log — never edits history.

## Security rules (non-negotiable)
- PIN verified **server-side only**; hash lives in Clerk `privateMetadata` (or gateway
  PropertiesService). Never client-side, never publicMetadata/unsafeMetadata.
- **Per-device lockout** after N failed PIN attempts (Model C identifies by PIN, so throttle by device).
- Admin endpoints verify a Clerk session JWT via JWKS.
- Authoritative timestamp = gateway/Google server time (not device clock) — the 24-jam rule depends on it.
