// Every script in this directory actually reaches Apps Script.
//
// `.claspignore` is a WHITELIST, so adding a file is not enough — it has to be named there too,
// and nothing complains if it is not. That failure is invisible from the outside: the code is
// written, tested, committed and deployed, `clasp push` reports success, and the gateway answers
// `server_error` at runtime because the function it calls does not exist up there. It happened
// to roster.gs. This is the check that would have caught it in the same minute.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../', import.meta.url);

describe('.claspignore', () => {
  const rules = readFileSync(new URL('.claspignore', dir), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l.startsWith('!')).map((l) => l.slice(1));

  it('un-ignores every .gs file in the project', () => {
    const scripts = readdirSync(dir).filter((f) => f.endsWith('.gs'));
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((f) => !rules.includes(f))).toEqual([]);
  });

  it('un-ignores the manifest, without which the deployment settings are not ours', () => {
    expect(rules).toContain('appsscript.json');
  });

  it('names nothing that does not exist, so the list cannot rot quietly', () => {
    const present = new Set(readdirSync(dir));
    expect(rules.filter((r) => !present.has(r))).toEqual([]);
  });
});
