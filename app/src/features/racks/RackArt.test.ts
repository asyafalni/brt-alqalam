import { describe, it, expect } from 'vitest';
import { isRackArtId, RACK_ART_IDS, rackArtFor } from './RackArt';

const rack = (p: Partial<{ code: string; name: string; zone: string; artId?: string }> = {}) => ({
  code: 'A1', name: '', zone: 'Gudang Utama', ...p,
});

describe('rackArtFor', () => {
  it('reads the kind of storage out of the name people actually write', () => {
    expect(rackArtFor(rack({ name: 'Lemari arsip' }))).toBe('lemari');
    expect(rackArtFor(rack({ name: 'Laci alat kecil' }))).toBe('laci');
    expect(rackArtFor(rack({ name: 'Gantungan sapu' }))).toBe('gantungan');
    expect(rackArtFor(rack({ name: 'Palet karung' }))).toBe('palet');
  });

  it('falls back to an open shelf, which is what "rak" means to everybody', () => {
    expect(rackArtFor(rack({ name: 'Sabun & pembersih' }))).toBe('rak');
  });

  it('lets an explicit choice beat the name', () => {
    // A rack is named once and lives for years, so an override here is cheap and worth having
    // — unlike an item, which is named fifty times in an afternoon.
    expect(rackArtFor(rack({ name: 'Lemari arsip', artId: 'palet' }))).toBe('palet');
  });

  it('ignores a choice it does not recognise rather than breaking the row', () => {
    // An old sheet may name a drawing we have since renamed.
    expect(rackArtFor(rack({ name: 'Lemari arsip', artId: 'sesuatu' }))).toBe('lemari');
  });

  it('reads the zone too — some places are named by where, not by what', () => {
    expect(rackArtFor(rack({ zone: 'Pojok lantai' }))).toBe('lantai');
  });

  it('every id in the picker is a real drawing', () => {
    expect(RACK_ART_IDS.every(isRackArtId)).toBe(true);
    expect(RACK_ART_IDS.length).toBeGreaterThan(5);
  });
});
