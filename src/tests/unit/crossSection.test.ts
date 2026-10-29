import { describe, expect, it } from 'vitest';
import { buildBoundaries, findBoundaryMatch } from '../../geo/boundaries';
import { describeCrossSection } from '../../geo/crossSection';
import { PLATE_RASTER } from '../../geo/raster';

const clusters = buildBoundaries(PLATE_RASTER);

describe('cross-section descriptions', () => {
  it('describes ocean-continent convergence with a slab, trench, mountain, and volcano', () => {
    const cluster = findBoundaryMatch(clusters, {
      plates: ['nazca', 'south-america'],
      type: 'convergent',
      subtype: 'oceanic-continental'
    });
    expect(cluster).not.toBeNull();
    if (!cluster) return;
    const early = describeCrossSection(cluster, 0);
    const late = describeCrossSection(cluster, 200);
    expect(early.kind).toBe('oceanic-continental');
    expect(early.hasVolcano).toBe(true);
    expect(late.features.slabDepthKm).toBeGreaterThan(early.features.slabDepthKm);
    expect(late.features.trenchDepthKm).toBeGreaterThan(early.features.trenchDepthKm);
    expect(late.features.mountainHeightKm).toBeGreaterThan(early.features.mountainHeightKm);
    expect(early.notesKo.join(' ')).toContain('해구');
    expect(early.captionKo).toContain('개념 단면도');
  });

  it('describes continental collision without a volcano', () => {
    const cluster = findBoundaryMatch(clusters, {
      plates: ['eurasia', 'indo-australia'],
      type: 'convergent',
      subtype: 'continental-continental'
    });
    expect(cluster).not.toBeNull();
    if (!cluster) return;
    const model = describeCrossSection(cluster, 200);
    expect(model.kind).toBe('continental-continental');
    expect(model.hasVolcano).toBe(false);
    expect(model.features.crustThicknessKm).toBeGreaterThan(50);
  });

  it('describes transform faults without volcanoes and with growing offset', () => {
    const cluster = findBoundaryMatch(clusters, {
      plates: ['north-america', 'pacific'],
      type: 'transform'
    });
    expect(cluster).not.toBeNull();
    if (!cluster) return;
    const early = describeCrossSection(cluster, 0);
    const late = describeCrossSection(cluster, 200);
    expect(early.kind).toBe('transform');
    expect(early.hasVolcano).toBe(false);
    expect(late.features.offsetKm).toBeGreaterThan(early.features.offsetKm);
    expect(early.notesKo.join(' ')).toContain('화산');
  });

  it('widens a continental rift over time', () => {
    const cluster = findBoundaryMatch(clusters, {
      plates: ['nubia', 'somalia'],
      type: 'divergent',
      subtype: 'rift'
    });
    expect(cluster).not.toBeNull();
    if (!cluster) return;
    const early = describeCrossSection(cluster, 0);
    const late = describeCrossSection(cluster, 200);
    expect(early.kind).toBe('rift');
    expect(late.features.riftWidthKm).toBeGreaterThan(early.features.riftWidthKm);
    expect(late.features.riftDepthKm).toBeGreaterThan(early.features.riftDepthKm);
  });

  it('handles an empty selection without throwing', () => {
    const model = describeCrossSection(null, 0);
    expect(model.kind).toBe('inactive');
    expect(model.titleKo).toContain('경계');
  });
});
