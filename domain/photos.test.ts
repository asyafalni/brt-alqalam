import { describe, it, expect } from 'vitest';
import {
  MAX_PHOTOS_PER_ITEM, canAddPhoto, orderPhotos, photoBudget, primaryPhoto,
} from './photos';
import type { ItemPhoto } from './photos';

const photo = (p: Partial<ItemPhoto> & { photoId: string; takenTs: number }): ItemPhoto => ({
  itemId: 'ITM-1', width: 1200, height: 900, bytes: 180_000, ...p,
});

describe('orderPhotos', () => {
  it('keeps the identifying shot first when a damage photo is added later', () => {
    const identifying = photo({ photoId: 'p1', takenTs: 1_000 });
    const damage = photo({ photoId: 'p2', takenTs: 9_000 });
    expect(orderPhotos([damage, identifying]).map((p) => p.photoId)).toEqual(['p1', 'p2']);
  });

  it('orders the rest chronologically', () => {
    const order = orderPhotos([
      photo({ photoId: 'c', takenTs: 300 }),
      photo({ photoId: 'a', takenTs: 100 }),
      photo({ photoId: 'b', takenTs: 200 }),
    ]);
    expect(order.map((p) => p.photoId)).toEqual(['a', 'b', 'c']);
  });

  it('breaks a shared timestamp by photoId, so one visit sorts the same way every time', () => {
    // Phone clocks report whole seconds; two shots in one visit really do collide.
    const same = [
      photo({ photoId: 'p3', takenTs: 5_000 }),
      photo({ photoId: 'p1', takenTs: 5_000 }),
      photo({ photoId: 'p2', takenTs: 5_000 }),
    ];
    expect(orderPhotos(same).map((p) => p.photoId)).toEqual(['p1', 'p2', 'p3']);
    expect(orderPhotos([...same].reverse()).map((p) => p.photoId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('does not mutate the caller array', () => {
    const input = [photo({ photoId: 'z', takenTs: 900 }), photo({ photoId: 'a', takenTs: 100 })];
    orderPhotos(input);
    expect(input.map((p) => p.photoId)).toEqual(['z', 'a']);
  });

  it('handles an item with no photos', () => {
    expect(orderPhotos([])).toEqual([]);
    expect(primaryPhoto([])).toBeUndefined();
  });
});

describe('primaryPhoto', () => {
  it('is the identifying shot, not the most recent one', () => {
    const photos = [photo({ photoId: 'late', takenTs: 9_000 }), photo({ photoId: 'first', takenTs: 1 })];
    expect(primaryPhoto(photos)?.photoId).toBe('first');
  });
});

describe('canAddPhoto', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => photo({ photoId: `p${i}`, takenTs: i }));

  it('allows photos up to the limit and refuses the one past it', () => {
    expect(canAddPhoto([])).toBe(true);
    expect(canAddPhoto(many(MAX_PHOTOS_PER_ITEM - 1))).toBe(true);
    expect(canAddPhoto(many(MAX_PHOTOS_PER_ITEM))).toBe(false);
  });

  it('still refuses if the store somehow holds more than the limit', () => {
    expect(canAddPhoto(many(MAX_PHOTOS_PER_ITEM + 3))).toBe(false);
  });

  it('takes an explicit limit', () => {
    expect(canAddPhoto(many(2), 2)).toBe(false);
    expect(canAddPhoto(many(2), 3)).toBe(true);
  });
});

describe('photoBudget', () => {
  it('sums the stored bytes', () => {
    expect(photoBudget([
      photo({ photoId: 'a', takenTs: 1, bytes: 200_000 }),
      photo({ photoId: 'b', takenTs: 2, bytes: 350_000 }),
    ])).toBe(550_000);
  });

  it('is zero for an item nobody has photographed', () => {
    expect(photoBudget([])).toBe(0);
  });
});
