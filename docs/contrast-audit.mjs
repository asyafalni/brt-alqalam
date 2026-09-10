// Contrast audit that lets the BROWSER resolve colours.
//
// Three earlier versions produced findings that were about the tool. The last one only parsed
// `rgb()/rgba()`, and Tailwind 4 emits `oklab(0 0 0 / 0.95)` for an opacity modifier — so the
// sidebar's near-black panel was skipped entirely and every label on it was measured against the
// beige page behind. Painting each colour onto a canvas and reading the pixel back resolves
// oklab, color-mix and anything else the browser supports, exactly as it renders it.
import { chromium } from 'playwright';
const ROUTES = ['/', '/opname', '/racks', '/board', '/aset', '/pengajuan', '/histori', '/laporan', '/label'];

const CHECK = `(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  const resolve = (s) => {
    if (cache.has(s)) return cache.get(s);
    ctx.clearRect(0,0,1,1); ctx.fillStyle = '#000'; ctx.fillStyle = s;
    ctx.clearRect(0,0,1,1); ctx.fillRect(0,0,1,1);
    const d = ctx.getImageData(0,0,1,1).data;
    const v = { c: [d[0], d[1], d[2]], a: d[3] / 255 };
    cache.set(s, v); return v;
  };
  const lum = (c) => { const [r,g,b] = c.map(v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }); return 0.2126*r+0.7152*g+0.0722*b; };
  const over = (fg, fa, bg) => fg.map((v,i) => v*fa + bg[i]*(1-fa));
  const ratio = (a,b) => { const [x,y] = [lum(a)+0.05, lum(b)+0.05]; return x>y ? x/y : y/x; };
  const bgOf = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const p = resolve(getComputedStyle(n).backgroundColor);
      if (p.a > 0) { stack.push(p); if (p.a === 1) break; }
    }
    let base = [255,255,255];
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i].c, stack[i].a, base);
    return base;
  };
  const text = [], edges = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') return;
    const bg = bgOf(el);
    if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) {
      const fg = resolve(cs.color);
      const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
      const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
      const got = ratio(over(fg.c, fg.a, bg), bg);
      if (got < need - 0.05) text.push(got.toFixed(2)+'/'+need+' <'+el.tagName.toLowerCase()+' class="'+String(el.className).slice(0,58)+'"> "'+el.textContent.trim().slice(0,20)+'"');
    }
    if (el.matches('input,select,textarea,button,[role=button]') && parseFloat(cs.borderTopWidth) > 0) {
      const bc = resolve(cs.borderTopColor);
      const outer = bgOf(el.parentElement || el);
      const got = ratio(over(bc.c, bc.a, outer), outer);
      if (bc.a > 0 && got < 2.95) edges.push(got.toFixed(2)+' <'+el.tagName.toLowerCase()+' class="'+String(el.className).slice(0,58)+'">');
    }
  });
  return { text: [...new Set(text)], edges: [...new Set(edges)] };
})()`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });

/**
 * Wait for a screen with something ON it.
 *
 * Without this the audit measures whatever is up at 1500ms, and on a build that carries a
 * gateway URL that is "Memuat register…" — a spinner and two lines of text, which has almost
 * no colours to get wrong. It reports "bersih" and means nothing, which is the fourth way this
 * tool has found to be confidently wrong (§77 records the first three). A run that cannot see
 * the page has to say so rather than pass it.
 */
async function ready() {
  await p.waitForFunction(
    () => !document.body.textContent.includes('Memuat register'),
    null,
    { timeout: 20000 },
  ).catch(() => { throw new Error('register tidak pernah termuat — audit dibatalkan'); });
  await p.waitForTimeout(600);
}

await p.goto('http://localhost:4360/#/');
await p.waitForTimeout(1200);
const demo = p.getByRole('button', { name: /Muat contoh data/ });
if (await demo.count()) { await demo.click(); await p.waitForTimeout(1500); }
await ready();
let total = 0;
for (const route of ROUTES) {
  await p.goto('http://localhost:4360/#' + route);
  await p.waitForTimeout(1500);
  await ready();
  const r = await p.evaluate(CHECK);
  total += r.text.length + r.edges.length;
  console.log(route.padEnd(11) + (r.text.length + r.edges.length ? '' : 'bersih'));
  r.text.slice(0,4).forEach((t) => console.log('   teks  ' + t));
  r.edges.slice(0,3).forEach((t) => console.log('   batas ' + t));
}
console.log('\ntotal: ' + total);
await b.close();
