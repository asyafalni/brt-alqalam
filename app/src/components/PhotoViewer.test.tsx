import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useRef } from 'octane';
import { render, fireEvent, cleanup } from '@octanejs/testing-library';
import { useDialog } from './useDialog';
import { PhotoViewer } from './PhotoViewer';
import type { ItemPhoto } from '../../../domain/photos';
import type { PhotoStore } from '../../../data/photoStore';

const photo = (n: number): ItemPhoto => ({
  photoId: `P${n}`, itemId: 'ITM-1', takenTs: n, width: 800, height: 600, bytes: 1000,
});

const store: PhotoStore = {
  list: async () => [],
  put: async () => photo(1),
  url: async (id) => `blob:${id}`,
  revoke: () => {},
  remove: async () => {},
};

const closed = vi.fn();
const view = (photos: ItemPhoto[], startAt = 0) => render(() => (
  <PhotoViewer photos={photos} startAt={startAt} name="Sabun" store={store} onClose={closed} />
));

beforeEach(() => { closed.mockClear(); });
afterEach(cleanup);

describe('walking through the photos', () => {
  // Until this existed, clicking a thumbnail opened THAT photo and offered no way to the next,
  // so three pictures could only be seen three separate times.
  it('says where you are when there is more than one', () => {
    expect(view([photo(1), photo(2), photo(3)]).getByText('1 / 3')).toBeTruthy();
  });

  it('goes forwards and back', () => {
    const r = view([photo(1), photo(2), photo(3)]);
    fireEvent.click(r.getByLabelText('Foto berikutnya'));
    expect(r.getByText('2 / 3')).toBeTruthy();
    fireEvent.click(r.getByLabelText('Foto sebelumnya'));
    expect(r.getByText('1 / 3')).toBeTruthy();
  });

  it('opens on the photo that was clicked, not always the first', () => {
    expect(view([photo(1), photo(2), photo(3)], 2).getByText('3 / 3')).toBeTruthy();
  });

  it('keeps the arrows at the ends, disabled', () => {
    // A control that vanishes shifts the image sideways every time you reach an edge.
    const r = view([photo(1), photo(2)]);
    expect((r.getByLabelText('Foto sebelumnya') as HTMLButtonElement).disabled).toBe(true);
    expect((r.getByLabelText('Foto berikutnya') as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers no paging for a single photo, and no counter either', () => {
    const r = view([photo(1)]);
    expect(r.queryByLabelText('Foto berikutnya')).toBeNull();
    expect(r.queryByText('1 / 1')).toBeNull();
  });

  it('pages with the arrow keys, which is the reflex on a desktop', () => {
    const r = view([photo(1), photo(2)]);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(r.getByText('2 / 2')).toBeTruthy();
  });

  it('closes on Escape', () => {
    view([photo(1)]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toHaveBeenCalled();
  });

  it('renders nothing when there is nothing to show', () => {
    // Deleting the last photo while it is open must not leave a black overlay with no image.
    expect(view([]).queryByRole('dialog')).toBeNull();
  });
});

describe('nested inside another dialog', () => {
  // The viewer opens INSIDE the request form's sheet, and both listen for Escape on the
  // window. Before the dialog stack, one press closed the viewer and the form under it,
  // because the outer listener was registered first and therefore ran first.
  it('takes the Escape itself, leaving the dialog beneath alone', () => {
    const outer = vi.fn();
    const Both = () => {
      const panel = useRef<HTMLDivElement | null>(null);
      useDialog(true, outer, panel);
      return (
        <div ref={panel}>
          <PhotoViewer photos={[photo(1)]} startAt={0} name="Sabun" store={store} onClose={closed} />
        </div>
      );
    };
    render(Both);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});
