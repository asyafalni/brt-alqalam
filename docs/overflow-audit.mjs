// Does any screen scroll sideways on the narrowest phone we care about?
//
// 360px is a Galaxy A-series in portrait — what the marbot actually hold. A horizontal scroll
// there is not cosmetic: the action buttons are on the right-hand end of a header row, so the
// half of the page that goes off-screen is the half you tap. Reported from a real phone
// (§ item page, four labelled buttons in one flex row), which is why this exists as a check
// rather than as a look.
//
// Wide CONTENT is allowed to scroll inside its own box — tables, the histori log, a QR strip.
// What is not allowed is the document itself. So this measures `documentElement` and then names
// whichever elements actually stick out past the viewport, since "something overflows" without
// a culprit is a bug report nobody can act on.
import { chromium } from 'playwright';

const ROUTES = ['/', '/opname', '/racks', '/board', '/aset', '/pengajuan', '/histori', '/laporan', '/label'];
const WIDTH = 360;

const CHECK = `(() => {
  const doc = document.documentElement;
  const over = doc.scrollWidth - doc.clientWidth;
  const guilty = [];
  if (over > 0) {
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.position === 'fixed') return;
      if (r.right <= doc.clientWidth + 1) return;
      // The innermost offender only: a parent is wide because its child is.
      if ([...el.children].some((c) => c.getBoundingClientRect().right > doc.clientWidth + 1)) return;
      // Something inside a scroller of its own is doing what it was told to.
      for (let n = el.parentElement; n; n = n.parentElement) {
        const o = getComputedStyle(n).overflowX;
        if (o === 'auto' || o === 'scroll') return;
      }
      guilty.push(Math.round(r.right - doc.clientWidth) + 'px <' + el.tagName.toLowerCase()
        + ' class="' + String(el.className).slice(0, 60) + '"> "'
        + (el.textContent || '').trim().slice(0, 24) + '"');
    });
  }
  return { over, guilty: [...new Set(guilty)] };
})()`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: WIDTH, height: 780 }, isMobile: true });

async function ready() {
  await p.waitForFunction(
    () => {
      const t = document.body.textContent || '';
      if (t.includes('Tidak bisa memuat register')) throw new Error('gateway menolak');
      return !t.includes('Memuat register');
    },
    null,
    { timeout: 90000 },
  ).catch(() => { throw new Error('register tidak pernah termuat — audit dibatalkan'); });
  await p.waitForTimeout(500);
}

await p.goto('http://localhost:4360/#/');
await p.waitForTimeout(1200);
const demo = p.getByRole('button', { name: /Muat contoh data/ });
if (await demo.count()) { await demo.click(); await p.waitForTimeout(1200); }
await ready();

let total = 0;
for (const route of ROUTES) {
  await p.goto('http://localhost:4360/#' + route);
  await p.waitForTimeout(1200);
  await ready();
  const r = await p.evaluate(CHECK);
  total += r.over > 0 ? 1 : 0;
  console.log(route.padEnd(11) + (r.over > 0 ? 'melebar ' + r.over + 'px' : 'pas'));
  r.guilty.slice(0, 5).forEach((g) => console.log('   ' + g));
}
/*
 * The item page has no address of its own without an id, and it is the page the overflow was
 * actually REPORTED on — four labelled action buttons in one header row. So it is reached the
 * way a person reaches it: from the stock list, by tapping a row.
 */
await p.goto('http://localhost:4360/#/board');
await p.waitForTimeout(1200);
await ready();
/* The stock rows are `<tr role="link">` — a table row cannot hold an anchor, so the row itself
   carries the role and the label. Matching on that rather than on a class keeps this working
   through a restyle. */
/* The stock rows are `<tr role="link">` — a table row cannot hold an anchor, so the row itself
   carries the role and the label. `visible=true` matters at this width: the table is still in
   the DOM behind a `hidden sm:table`, and clicking the invisible copy times out. */
const row = p.locator('[role="link"][aria-label^="Buka "]').locator('visible=true').first();
if (await row.count()) {
  await row.click();
  await p.waitForTimeout(1200);
  await ready();
  const r = await p.evaluate(CHECK);
  total += r.over > 0 ? 1 : 0;
  console.log('/barang'.padEnd(11) + (r.over > 0 ? 'melebar ' + r.over + 'px' : 'pas'));
  r.guilty.slice(0, 5).forEach((g) => console.log('   ' + g));
} else {
  console.log('/barang    TIDAK DIUJI — tidak ada baris barang untuk dibuka');
}

console.log('\nhalaman melebar: ' + total + '/' + (ROUTES.length + 1) + ' @ ' + WIDTH + 'px');
await b.close();
