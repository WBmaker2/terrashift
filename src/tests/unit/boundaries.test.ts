import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  boundaryPlatesLabelKo,
  buildBoundaries,
  classifyBoundary,
  classifyVelocity,
  findBoundaryMatch,
  findNearestBoundary,
  subtypeFor,
  type BoundarySubtype,
  type BoundaryType
} from '../../geo/boundaries';
import { PLATE_RASTER } from '../../geo/raster';

const normal = new Vector3(0, 0, 1);
const tangent = new Vector3(0, 1, 0);

describe('boundary classification', () => {
  it('classifies divergent, convergent, transform, and inactive motion', () => {
    expect(classifyVelocity(new Vector3(0, 0, -2), normal, tangent)).toBe('divergent');
    expect(classifyVelocity(new Vector3(0, 0, 2), normal, tangent)).toBe('convergent');
    expect(classifyVelocity(new Vector3(0, 5, 0.2), normal, tangent)).toBe('transform');
    expect(classifyVelocity(new Vector3(0, 0.05, 0), normal, tangent)).toBe('inactive');
  });

  it('is invariant when plate A and plate B swap and the normal flips', () => {
    const cases: Array<[Vector3, Vector3]> = [
      [new Vector3(0, 0, -2), new Vector3(0, 0, 0)],
      [new Vector3(0, 0, 2), new Vector3(0, 0, 0)],
      [new Vector3(0, 5, 0.2), new Vector3(0, 0, 0)],
      [new Vector3(1, 1, 1), new Vector3(-1, -1, -1)]
    ];
    for (const [a, b] of cases) {
      const direct = classifyBoundary(a, b, normal, tangent);
      const swapped = classifyBoundary(b, a, normal.clone().negate(), tangent);
      expect(swapped).toBe(direct);
    }
  });

  it('covers every subtype rule', () => {
    const subtypes: BoundarySubtype[] = [
      subtypeFor('divergent', 'oceanic', 'oceanic', true),
      subtypeFor('divergent', 'continental', 'oceanic', false),
      subtypeFor('convergent', 'oceanic', 'continental', false),
      subtypeFor('convergent', 'oceanic', 'oceanic', true),
      subtypeFor('convergent', 'continental', 'continental', false),
      subtypeFor('transform', 'oceanic', 'continental', true),
      subtypeFor('inactive', 'continental', 'continental', false)
    ];
    expect(subtypes).toEqual([
      'ridge',
      'rift',
      'oceanic-continental',
      'oceanic-oceanic',
      'continental-continental',
      'transform',
      'inactive'
    ]);
  });
});

describe('real plate boundary mosaic', () => {
  const clusters = buildBoundaries(PLATE_RASTER);

  it('contains all three active boundary types and each convergence subtype', () => {
    const types = new Set<BoundaryType>(clusters.map((cluster) => cluster.type));
    expect(types.has('divergent')).toBe(true);
    expect(types.has('convergent')).toBe(true);
    expect(types.has('transform')).toBe(true);
    const subtypes = new Set<BoundarySubtype>(clusters.map((cluster) => cluster.subtype));
    expect(subtypes.has('ridge')).toBe(true);
    expect(subtypes.has('rift')).toBe(true);
    expect(subtypes.has('oceanic-continental')).toBe(true);
    expect(subtypes.has('oceanic-oceanic')).toBe(true);
    expect(subtypes.has('continental-continental')).toBe(true);
    expect(subtypes.has('transform')).toBe(true);
  });

  it('produces valid segments and connected cluster points', () => {
    for (const cluster of clusters) {
      expect(cluster.segments.length).toBeGreaterThan(0);
      expect(cluster.points.length).toBeGreaterThanOrEqual(2);
      expect(cluster.lengthKm).toBeGreaterThan(0);
      for (const segment of cluster.segments) {
        expect(segment.plateA).not.toBe(segment.plateB);
        expect(segment.lengthKm).toBeGreaterThan(0);
        expect(segment.relativeVelocityCmYr).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('finds the six mission boundaries', () => {
    const matches = [
      findBoundaryMatch(clusters, {
        plates: ['nazca', 'south-america'],
        type: 'convergent',
        subtype: 'oceanic-continental'
      }),
      findBoundaryMatch(clusters, {
        plates: ['eurasia', 'indo-australia'],
        type: 'convergent',
        subtype: 'continental-continental'
      }),
      findBoundaryMatch(clusters, {
        plates: ['north-america', 'pacific'],
        type: 'transform'
      }),
      findBoundaryMatch(clusters, {
        plates: ['nubia', 'somalia'],
        type: 'divergent',
        subtype: 'rift'
      }),
      findBoundaryMatch(clusters, {
        plates: ['pacific'],
        type: 'convergent'
      })
    ];
    for (const match of matches) expect(match).not.toBeNull();
  });

  it('labels plate pairs from west to east or south to north', () => {
    const transform = findBoundaryMatch(clusters, {
      plates: ['north-america', 'pacific'],
      type: 'transform'
    });
    expect(transform).not.toBeNull();
    if (transform) expect(boundaryPlatesLabelKo(transform)).toBe('태평양판 · 북아메리카판');
    const andes = findBoundaryMatch(clusters, {
      plates: ['nazca', 'south-america'],
      type: 'convergent',
      subtype: 'oceanic-continental'
    });
    expect(andes).not.toBeNull();
    if (andes) expect(boundaryPlatesLabelKo(andes)).toBe('나스카판 · 남아메리카판');
  });

  it('finds a nearby boundary from a representative point', () => {
    const cluster = clusters.find((candidate) => candidate.lengthKm > 1000);
    expect(cluster).toBeDefined();
    if (!cluster) return;
    const nearest = findNearestBoundary(
      clusters,
      cluster.representative.lat,
      cluster.representative.lon,
      2
    );
    expect(nearest).not.toBeNull();
    expect(nearest?.cluster.id).toBe(cluster.id);
  });
});
