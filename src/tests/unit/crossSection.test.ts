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

  it('orders plates from west to east or south to north for the cross-section', () => {
    const andes = findBoundaryMatch(clusters, {
      plates: ['nazca', 'south-america'],
      type: 'convergent',
      subtype: 'oceanic-continental'
    });
    expect(andes).not.toBeNull();
    if (andes) {
      const model = describeCrossSection(andes, 60);
      expect(model.leftPlateKo).toBe('나스카판');
      expect(model.rightPlateKo).toBe('남아메리카판');
      expect(model.oceanSide).toBe('left');
    }

    const pacific = findBoundaryMatch(clusters, {
      plates: ['north-america', 'pacific'],
      type: 'transform'
    });
    expect(pacific).not.toBeNull();
    if (pacific) {
      const model = describeCrossSection(pacific, 60);
      expect(model.leftPlateKo).toBe('태평양판');
      expect(model.rightPlateKo).toBe('북아메리카판');
      expect(model.oceanSide).toBe('left');
    }

    const collision = findBoundaryMatch(clusters, {
      plates: ['eurasia', 'indo-australia'],
      type: 'convergent',
      subtype: 'continental-continental'
    });
    expect(collision).not.toBeNull();
    if (collision) {
      const model = describeCrossSection(collision, 60);
      expect(model.leftPlateKo).toBe('인도-오스트레일리아판');
      expect(model.rightPlateKo).toBe('유라시아판');
    }
  });

  it('handles an empty selection without throwing', () => {
    const model = describeCrossSection(null, 0);
    expect(model.kind).toBe('inactive');
    expect(model.titleKo).toContain('경계');
  });
});
