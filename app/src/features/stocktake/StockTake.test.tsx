import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { StockTake } from './StockTake';
import { useState } from 'octane';
import { useDraft } from '../../state/useDraft';
import { toItemsCsv, toInstancesCsv, toStockCsv } from './draft';
import { parseItems, parseInstances, parseStock } from '../../../../data/parse';
import { SEED_CATEGORIES } from '../../data/seedCategories';

// The draft is owned above the screen (App), so tests supply it the same way. The filter is
// NOT: it lives on this screen and is driven through its own field, like a person would.
function Harness() {
  return <StockTake draft={useDraft()} onOpenRack={() => {}} />;
}

// Octane uses NATIVE events — `change` fires on blur, so typing is `input`.
const type = (el: HTMLElement, value: string) => fireEvent.input(el, { target: { value } });

type R = ReturnType<typeof render>;

// The list renders twice on purpose — a real <table> on a desk and stacked cards below `sm`
// (components/DataTable.tsx), so the Aksi column can no longer fall off the right edge of a
// phone. Row queries therefore name the shape they mean; `phone` is the one a marbot sees.
const desk = (r: R) => within(r.container.querySelector('table')!);
// Not just any <ul>: the form's kind toggle and the phone list are both lists, so the class
// that only the phone list carries is what picks it out.
const phone = (r: R) => within(r.container.querySelector('ul[class~="sm:hidden"]')!);

/**
 * Opens the add/edit panel, if it is not already open.
 *
 * The form is a side Sheet now, not a slab under the list — so a test has to walk in the same
 * door a person does. It STAYS open after an add (sticky context: walking one shelf means many
 * items in a row), which is why this is a no-op the second time.
 */
function openForm(r: R) {
  const opener = r.queryAllByText('Tambah barang')[0];
  if (opener) fireEvent.click(opener);
}

function addItem(r: R, name: string, qty: string) {
  openForm(r);
  type(r.getByLabelText('Nama barang'), name);
  type(r.getByLabelText('Jumlah dihitung'), qty);
  fireEvent.click(r.getByText('Tambah ke daftar'));
}

const stored = () => JSON.parse(localStorage.getItem('brt.stocktake.draft.v6')!);

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('StockTake — walking the gudang', () => {
  it('starts empty, and says where to begin', () => {
    const r = render(Harness);
    expect(r.getByText(/Belum ada barang/)).toBeTruthy();
  });

  it('adds an item and shows it in the list', () => {
    const r = render(Harness);
    addItem(r, 'Sabun cuci tangan', '12');
    expect(desk(r).getByText('Sabun cuci tangan')).toBeTruthy();
    expect(desk(r).getByText('ALQ-ITM-0001')).toBeTruthy();   // the code cell — unique to the row
    expect(desk(r).getByText('bisa habis')).toBeTruthy();
    // …and the same row reaches the phone, which is where the walk actually happens.
    expect(phone(r).getByText('Sabun cuci tangan')).toBeTruthy();
    expect(r.queryByText(/Belum ada barang/)).toBeNull();
  });

  it('keeps category, unit and kind but clears the name — the sticky-context win', () => {
    const r = render(Harness);
    openForm(r);
    // Satuan is a picker now, not a text box — a `<datalist>` only opens once somebody starts
    // typing, which is the moment they have stopped needing suggestions.
    fireEvent.change(r.getByLabelText('Satuan'), { target: { value: 'galon' } });
    fireEvent.click(r.getByText('Barang tetap'));
    addItem(r, 'Pisau', '4');

    expect((r.getByLabelText('Nama barang') as HTMLInputElement).value).toBe('');
    expect((r.getByLabelText('Satuan') as HTMLSelectElement).value).toBe('galon');
    expect(r.getByText('Barang tetap').closest('button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('refuses to add a nameless item, and says why', () => {
    const r = render(Harness);
    openForm(r);
    fireEvent.click(r.getByText('Tambah ke daftar'));
    expect(r.getByText('Nama barang belum diisi')).toBeTruthy();
    expect(r.getByText(/Belum ada barang/)).toBeTruthy();
  });

  it('steppers adjust the count and never go below zero', () => {
    const r = render(Harness);
    openForm(r);
    const qty = r.getByLabelText('Jumlah dihitung') as HTMLInputElement;
    fireEvent.click(r.getByLabelText('Tambah'));
    fireEvent.click(r.getByLabelText('Tambah'));
    expect(qty.value).toBe('2');
    for (let i = 0; i < 5; i += 1) fireEvent.click(r.getByLabelText('Kurangi'));
    expect(qty.value).toBe('0');
  });

  it('minimum starts as "(-)" — no alarm — until the operator sets one', () => {
    const r = render(Harness);
    openForm(r);
    expect(r.getByText(/Tidak ada minimum/)).toBeTruthy();
    fireEvent.click(r.getByText('Atur'));
    expect(r.getByLabelText('Minimum (alarm stok)')).toBeTruthy();
  });

  it('survives closing the app — the draft is restored from storage', () => {
    const first = render(Harness);
    addItem(first, 'Terpal', '3');
    cleanup();
    expect(desk(render(Harness)).getByText('Terpal')).toBeTruthy();
  });
});

describe('durables must be asked how they are tracked', () => {
  it('the question only appears for Barang tetap', () => {
    const r = render(Harness);
    openForm(r);
    expect(r.queryByText('Label satu-satu')).toBeNull();
    fireEvent.click(r.getByText('Barang tetap'));
    expect(r.getByText('Label satu-satu')).toBeTruthy();
    fireEvent.click(r.getByText('Bisa habis'));
    expect(r.queryByText('Label satu-satu')).toBeNull();
  });

  it('choosing "Hitung jumlahnya" produces no per-unit labels', () => {
    const r = render(Harness);
    openForm(r);
    fireEvent.click(r.getByText('Barang tetap'));
    fireEvent.click(r.getByText('Hitung jumlahnya'));
    addItem(r, 'Terpal', '10');
    expect(toInstancesCsv(stored().items, 0, stored().stock).trim())
      .toBe('assetId,itemId,label,acquiredTs,active');
  });

  it('labelling one-by-one yields one QR-able unit per count', () => {
    const r = render(Harness);
    openForm(r);
    fireEvent.click(r.getByText('Barang tetap'));
    addItem(r, 'Pisau', '3');
    const parsed = parseInstances(
      toInstancesCsv(stored().items, Date.parse('2026-09-06T00:00:00Z'), stored().stock),
    );
    expect(parsed.quarantined).toEqual([]);
    expect(parsed.ok.map((a) => a.label)).toEqual(['Pisau #1', 'Pisau #2', 'Pisau #3']);
  });
});

describe('editing a row mid-walk', () => {
  it('loads the row back into the form and saves in place', () => {
    const r = render(Harness);
    addItem(r, 'Sabun', '5');
    fireEvent.click(desk(r).getByLabelText('Ubah Sabun'));

    expect((r.getByLabelText('Nama barang') as HTMLInputElement).value).toBe('Sabun');
    type(r.getByLabelText('Nama barang'), 'Sabun cair');
    fireEvent.click(r.getByText('Simpan perubahan'));

    expect(desk(r).getByText('Sabun cair')).toBeTruthy();
    expect(stored().items).toHaveLength(1);
    expect(stored().items[0].itemId).toBe('ITM-0001'); // id survives — it may be on a label
  });

  it('does not warn that the row being edited duplicates itself', () => {
    const r = render(Harness);
    addItem(r, 'Sapu', '2');
    fireEvent.click(desk(r).getByLabelText('Ubah Sapu'));
    fireEvent.click(r.getByText('Simpan perubahan'));
    expect(r.queryByText(/tetap tambah/)).toBeNull();
  });

  it('can be cancelled without changing anything', () => {
    const r = render(Harness);
    addItem(r, 'Sapu', '2');
    fireEvent.click(desk(r).getByLabelText('Ubah Sapu'));
    type(r.getByLabelText('Nama barang'), 'Bukan sapu');
    /* The panel's own close IS the cancel now. The form used to carry a second one in a
       "Mengubah barang / Batal" banner, which said what the panel's title says and offered
       what its close button offers. */
    fireEvent.click(r.getByLabelText('Tutup'));
    expect(desk(r).getByText('Sapu')).toBeTruthy();
    expect(r.queryByText('Bukan sapu')).toBeNull();
  });

  it('deleting takes two taps — a mis-tap must not lose a counted row', () => {
    const r = render(Harness);
    addItem(r, 'Kanebo', '5');

    fireEvent.click(desk(r).getByLabelText('Hapus Kanebo'));
    expect(desk(r).getByText('Kanebo')).toBeTruthy();          // still there after one tap
    fireEvent.click(desk(r).getByText('Batal'));
    expect(desk(r).getByText('Kanebo')).toBeTruthy();          // and after backing out

    fireEvent.click(desk(r).getByLabelText('Hapus Kanebo'));
    fireEvent.click(desk(r).getByLabelText('Ya, hapus Kanebo'));
    expect(r.queryByText('Kanebo')).toBeNull();
  });

  it('the same two taps work from the phone card, where the column used to be cut off', () => {
    const r = render(Harness);
    addItem(r, 'Kanebo', '5');

    fireEvent.click(phone(r).getByLabelText('Hapus Kanebo'));
    expect(phone(r).getByText('Kanebo')).toBeTruthy();         // one tap deletes nothing
    fireEvent.click(phone(r).getByText('Batal'));
    expect(phone(r).getByText('Kanebo')).toBeTruthy();

    fireEvent.click(phone(r).getByLabelText('Hapus Kanebo'));
    fireEvent.click(phone(r).getByLabelText('Ya, hapus Kanebo'));
    expect(r.queryByText('Kanebo')).toBeNull();
  });

  it('Ubah is reachable from the phone card too', () => {
    const r = render(Harness);
    addItem(r, 'Sapu ijuk', '2');
    fireEvent.click(phone(r).getByLabelText('Ubah Sapu ijuk'));
    expect((r.getByLabelText('Nama barang') as HTMLInputElement).value).toBe('Sapu ijuk');
  });

  it('emptying the whole list also takes two taps', () => {
    const r = render(Harness);
    addItem(r, 'Sapu', '1');
    fireEvent.click(r.getByText('Kosongkan'));
    expect(r.getByText(/Hapus semua 1 barang\?/)).toBeTruthy();
    fireEvent.click(r.getByText('Ya, hapus'));
    expect(r.getByText(/Belum ada barang/)).toBeTruthy();
  });
});

describe('categories are free-form', () => {
  it('a new category can be added mid-walk and is selected immediately', () => {
    const r = render(Harness);
    openForm(r);
    // Adding one is an option IN the list now, the same as satuan and rak — one idea, one shape.
    fireEvent.change(r.getByLabelText('Kategori'), { target: { value: '\u0000new' } });
    type(r.getByLabelText('Nama kategori baru'), 'Alat Masak');
    fireEvent.click(r.getByText('Simpan'));
    addItem(r, 'Panci besar', '2');

    // Appears twice on purpose: as the selected <option> and in the row it was filed under.
    expect(r.getAllByText('Alat Masak').length).toBeGreaterThan(1);
    expect(stored().items[0].categoryId).toBe('CAT-ALAT-MASAK');
    expect(stored().categories.at(-1)).toMatchObject({ categoryId: 'CAT-ALAT-MASAK', name: 'Alat Masak' });
  });

  it('backing out of the new-category field adds nothing', () => {
    const r = render(Harness);
    openForm(r);
    // Adding one is an option IN the list now, the same as satuan and rak — one idea, one shape.
    fireEvent.change(r.getByLabelText('Kategori'), { target: { value: '\u0000new' } });
    type(r.getByLabelText('Nama kategori baru'), 'Tidak jadi');
    fireEvent.click(r.getByText('Batal'));
    addItem(r, 'Sabun', '1');

    expect(stored().categories).toHaveLength(8);
    expect(r.queryByLabelText('Nama kategori baru')).toBeNull();
  });

  it('uses a native dialog for nothing — the kiosk never calls prompt or confirm', () => {
    // happy-dom provides neither, so any surviving call would throw rather than pass silently.
    const r = render(Harness);
    addItem(r, 'Sabun', '1');
    // Adding one is an option IN the list now, the same as satuan and rak — one idea, one shape.
    fireEvent.change(r.getByLabelText('Kategori'), { target: { value: '\u0000new' } });
    fireEvent.click(desk(r).getByLabelText('Hapus Sabun'));
    fireEvent.click(r.getByText('Kosongkan'));
    expect(r.getByText(/Hapus semua/)).toBeTruthy();
  });
});

describe('export', () => {
  it('offers one file per sheet tab, and only lists instances when there are any', () => {
    const r = render(Harness);
    addItem(r, 'Sabun', '5');
    // Export is an occasional errand, so it lives in a panel rather than at the foot of the
    // page somebody scrolls past on every visit.
    /* Opening the export panel CLOSES the item panel: two side sheets stacked on one screen
       is one overlay too many, and the second one's backdrop dims the first. */
    fireEvent.click(r.getByText('Ekspor'));
    expect(r.getByText('Items')).toBeTruthy();
    expect(r.getByText('Categories')).toBeTruthy();
    expect(r.queryByText('AssetInstances')).toBeNull();

    fireEvent.click(r.getByLabelText('Tutup'));
    openForm(r);
    fireEvent.click(r.getByText('Barang tetap'));
    addItem(r, 'Pisau', '2');
    fireEvent.click(r.getByText('Ekspor'));
    expect(r.getByText('AssetInstances')).toBeTruthy();
    expect(r.getByText(/2 baris · unit yang dilabeli/)).toBeTruthy();
  });

  it('what it exports is what the Items sheet accepts', () => {
    const r = render(Harness);
    addItem(r, 'Sabun', '12');
    const parsed = parseItems(toItemsCsv(stored().items));
    expect(parsed.quarantined).toEqual([]);
    expect(parsed.ok[0]).toMatchObject({ name: 'Sabun', kind: 'consumable' });
    // Quantity travels on the Stock tab now, one row per rack.
    const lines = parseStock(toStockCsv(stored().stock));
    expect(lines.quarantined).toEqual([]);
    expect(lines.ok[0]).toMatchObject({ itemId: parsed.ok[0].itemId, initialStock: 12 });
  });
});

// --- The item drawing -----------------------------------------------------------------------
//
// It is chosen automatically, from the name, unit and category. The picker exists only for the
// times the guess is wrong — adding a required "pick an icon" step to every item would fail the
// design doc's own test (§0.0: does this remove work from people, or add it?).

describe('gambar barang', () => {
  it('is guessed as you type, with no field to fill in', () => {
    const r = render(Harness);
    openForm(r);
    type(r.getByLabelText('Nama barang'), 'Pisau potong');
    expect(r.getByLabelText(/Gambar barang: pisau/)).toBeTruthy();
  });

  it('can be overridden when the guess is wrong, and the choice sticks', () => {
    const r = render(Harness);
    openForm(r);
    type(r.getByLabelText('Nama barang'), 'Sabun cuci tangan');

    fireEvent.click(r.getByLabelText(/Gambar barang/));
    fireEvent.click(r.getByLabelText('kantong'));
    expect(r.getByLabelText(/Gambar barang: kantong/)).toBeTruthy();

    type(r.getByLabelText('Jumlah dihitung'), '3');
    fireEvent.click(r.getByText('Tambah ke daftar'));
    expect(stored().items[0].artId).toBe('kantong');
  });

  it('an item left on automatic stores nothing, so the guess can improve later', () => {
    const r = render(Harness);
    addItem(r, 'Sabun cuci tangan', '3');
    expect(stored().items[0].artId).toBeUndefined();
  });

  it('can be handed back to the guess', () => {
    const r = render(Harness);
    openForm(r);
    type(r.getByLabelText('Nama barang'), 'Pisau potong');
    fireEvent.click(r.getByLabelText(/Gambar barang/));
    fireEvent.click(r.getByLabelText('lampu'));
    expect(r.getByLabelText(/Gambar barang: lampu/)).toBeTruthy();

    fireEvent.click(r.getByLabelText(/Gambar barang/));
    fireEvent.click(r.getByText('Kembali ke otomatis'));
    expect(r.getByLabelText(/Gambar barang: pisau/)).toBeTruthy();
  });
});

describe('picking a satuan', () => {
  it('offers the common ones without anybody typing first', () => {
    const r = render(Harness);
    openForm(r);
    const options = [...(r.getByLabelText('Satuan') as HTMLSelectElement).options].map((o) => o.value);
    expect(options).toContain('galon');
    expect(options).toContain('roll');
    expect(options).toContain('kg');
  });

  it('puts what this masjid already counts in at the top, newest first', () => {
    // The satuan used a moment ago is likelier to be the next one than one used at the start
    // of the walk.
    const r = render(Harness);
    openForm(r);
    fireEvent.change(r.getByLabelText('Satuan'), { target: { value: 'roll' } });
    addItem(r, 'Karpet', '2');
    fireEvent.change(r.getByLabelText('Satuan'), { target: { value: 'kg' } });
    addItem(r, 'Beras', '5');

    const options = [...(r.getByLabelText('Satuan') as HTMLSelectElement).options].map((o) => o.value);
    expect(options.slice(0, 2)).toEqual(['kg', 'roll']);
  });

  it('lets a satuan nobody listed be typed, and gives a way back', () => {
    // A closed list would send somebody off to rename the thing instead.
    const r = render(Harness);
    openForm(r);
    fireEvent.change(r.getByLabelText('Satuan'), { target: { value: '\u0000new' } });
    type(r.getByLabelText('Satuan'), 'jerigen');
    expect((r.getByLabelText('Satuan') as HTMLInputElement).value).toBe('jerigen');

    fireEvent.click(r.getByText('Pilih'));
    expect((r.getByLabelText('Satuan') as HTMLSelectElement).tagName).toBe('SELECT');
  });
});

describe('one shape for "add a new one"', () => {
  // Kategori used a `+` button beside the control while satuan and rak offered it inside the
  // list. Three fields in a row solving one problem three ways is three things to learn, and
  // the button also cost 56px of a row that has to hold a control as well.
  const ADD_NEW = '\u0000new';

  it('offers it in the list on every picker', () => {
    const r = render(Harness);
    openForm(r);
    for (const field of ['Kategori', 'Satuan', 'Rak / tempat']) {
      const values = [...(r.getByLabelText(field) as HTMLSelectElement).options].map((o) => o.value);
      expect(values, field).toContain(ADD_NEW);
    }
  });

  it('leaves no stray + buttons behind', () => {
    const r = render(Harness);
    openForm(r);
    expect(r.queryByLabelText('Tambah kategori baru')).toBeNull();
    expect(r.queryByLabelText('Tambah rak baru')).toBeNull();
  });

  it('adds a rack from inside the list and selects it', () => {
    const r = render(Harness);
    openForm(r);
    fireEvent.change(r.getByLabelText('Rak / tempat'), { target: { value: ADD_NEW } });
    type(r.getByLabelText('Kode rak'), 'C9');
    fireEvent.click(r.getByText('Simpan'));

    const shown = [...(r.getByLabelText('Rak / tempat') as HTMLSelectElement).options]
      .map((o) => o.textContent);
    expect(shown.some((v) => v?.startsWith('C9'))).toBe(true);
  });
});

describe('the form is a panel, not a slab under the list', () => {
  /*
   * Inline it took most of a screen and never went away, so the thing this page is named for —
   * the list of what has been found — began below the fold and every added row pushed it
   * further down. Same move as "Rak baru" on Peta Rak (§91): the list is the context you add
   * against, so it is the list that stays on screen.
   */
  it('is closed until asked for', () => {
    const r = render(Harness);
    expect(r.queryByLabelText('Nama barang')).toBeNull();
  });

  it('STAYS open after adding, because a shelf is many items in a row', () => {
    // The sticky context (category, unit, kind, rack all carry over) is the difference between
    // 6 taps and 2. Closing the panel on every save would put those taps straight back.
    const r = render(Harness);
    addItem(r, 'Sabun', '3');
    expect(r.getByLabelText('Nama barang')).toBeTruthy();
    expect((r.getByLabelText('Nama barang') as HTMLInputElement).value).toBe('');
  });

  it('says what it just added, since the list may be behind it on a phone', () => {
    const r = render(Harness);
    addItem(r, 'Sabun', '3');
    // Scoped to the note: the name is also in the table and on the phone card behind it.
    const note = r.getByText(/masuk daftar/);
    expect(note.textContent).toContain('Sabun');
  });

  it('drops that note once the row it names is gone', () => {
    // A confirmation that outlives the fact it states is worse than none.
    const r = render(Harness);
    addItem(r, 'Kanebo', '5');
    fireEvent.click(desk(r).getByLabelText('Hapus Kanebo'));
    fireEvent.click(desk(r).getByLabelText('Ya, hapus Kanebo'));
    expect(r.queryByText(/masuk daftar/)).toBeNull();
  });

  it('CLOSES after an edit, which is finished when it is saved', () => {
    const r = render(Harness);
    addItem(r, 'Sapu', '2');
    fireEvent.click(desk(r).getByLabelText('Ubah Sapu'));
    fireEvent.click(r.getByText('Simpan perubahan'));
    expect(r.queryByLabelText('Nama barang')).toBeNull();
  });

  it('opens from the empty state too, where it is the only thing to do', () => {
    const r = render(Harness);
    fireEvent.click(r.queryAllByText('Tambah barang')[1]);
    expect(r.getByLabelText('Nama barang')).toBeTruthy();
  });
});

describe('the form sizes itself to the panel, not to the window', () => {
  /*
   * Tailwind's breakpoints measure the VIEWPORT. This form used to fill one; it now lives in a
   * 448px side panel, so on any desktop `sm:grid-cols-2` split ~400px into two ~190px columns —
   * and the minimum row needs three 56px buttons before its number field gets a pixel, which
   * pushed the "( - )" button off the right edge.
   *
   * Container queries are the tool that does express it, and Kategori/Satuan uses one: it
   * pairs two short fields side by side when the PANEL is wide enough and stacks them when it
   * is not. The minimum row stays one column at every width — three 56px buttons and a number
   * field do not fit in half of 400px however the question is asked.
   *
   * Asserting on classes is normally a poor test, but jsdom has no layout engine: there is no
   * geometry to measure, and the invariant — this form must not take its column count from the
   * window — is exactly a class-level fact.
   */
  it('takes no column count from a viewport breakpoint', () => {
    const r = render(Harness);
    openForm(r);
    const panel = r.container.querySelector('[role="dialog"]') ?? r.container;
    const offenders = [...panel.querySelectorAll('*')]
      .map((el) => el.getAttribute('class') ?? '')
      /* `@sm:` is allowed and `sm:` is not — the whole distinction this test exists for. The
         lookbehind is what keeps `@sm:grid-cols-2` from matching as a bare `sm:`. */
      .filter((c) => /(?<![@\w])(sm|md|lg|xl):grid-cols-/.test(c));
    expect(offenders).toEqual([]);
  });

  it('still offers every control on the minimum row once it is set', () => {
    const r = render(Harness);
    openForm(r);
    fireEvent.click(r.getByText('Atur'));
    expect(r.getByLabelText('Minimum (alarm stok)')).toBeTruthy();
    expect(r.getByTitle('Tanpa minimum')).toBeTruthy();
  });
});

describe('the walk has an end', () => {
  /*
   * Opname measured itself in "Barang dicatat", "Kategori", "Unit dihitung" — three numbers
   * that only ever go up, past no target, toward nothing. So the one job in this app that
   * genuinely finishes was the one that read as never finishing, which fails §0.0 on its own
   * terms: a permanent chore is admin burden however good the feature is.
   *
   * Racks are what is finite. There is a fixed number, each is walked or not, and the number
   * left goes DOWN.
   */
  const rackDraft = (racks: { code: string; walked?: boolean }[]) => {
    localStorage.setItem('brt.stocktake.draft.v6', JSON.stringify({
      items: [], categories: SEED_CATEGORIES, stock: [], txns: [], requests: [],
      locations: racks.map((r, i) => ({
        locationId: `LOC-${r.code}`, code: r.code, name: '', zone: 'Gudang',
        order: i + 1, active: true, ...(r.walked ? { lastCountedTs: 1 } : {}),
      })),
    }));
  };

  it('counts down the racks left, not up the items entered', () => {
    rackDraft([{ code: 'A1', walked: true }, { code: 'A2' }, { code: 'A3' }]);
    const r = render(Harness);
    expect(r.getByText('1')).toBeTruthy();
    expect(r.getByText(/dari 3 rak/)).toBeTruthy();
    expect(r.getByLabelText('33 persen rak sudah didata')).toBeTruthy();
  });

  it('marks a rack walked, and the number left drops', () => {
    rackDraft([{ code: 'A1' }, { code: 'A2' }]);
    const r = render(Harness);
    expect(r.getByLabelText('0 persen rak sudah didata')).toBeTruthy();

    fireEvent.click(r.getAllByText('Selesai didata')[0]);
    expect(r.getByLabelText('50 persen rak sudah didata')).toBeTruthy();
  });

  it('says the job is finished, and what keeps the register true from here', () => {
    // "Done" invites exactly that question, and the honest answer is that this screen steps
    // back — not that the work is over.
    rackDraft([{ code: 'A1', walked: true }]);
    const r = render(Harness);
    expect(r.getByText(/Semua 1 rak sudah didata/)).toBeTruthy();
    expect(r.getByText(/Cek rak/)).toBeTruthy();
    expect(r.getByText(/Pengajuan/)).toBeTruthy();
  });

  it('claims nothing at all when there are no racks yet', () => {
    // 0 of 0 would announce a target that does not exist — the racks come from the walk itself.
    rackDraft([]);
    const r = render(Harness);
    expect(r.queryByText(/rak sudah didata/)).toBeNull();
  });
});
