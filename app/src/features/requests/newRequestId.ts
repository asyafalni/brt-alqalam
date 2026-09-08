// The id a request will have, minted before its form opens.
//
// Photos are attached inside the form and have to be filed under something, so the id cannot
// wait until the request is sent — and it is the id the GATEWAY stores too, which is why it
// travels with the submission rather than being replaced server-side. A server-minted id would
// orphan every photo on the device that took them.

export const newRequestId = (): string =>
  `REQ-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
