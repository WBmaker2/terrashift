import { describe, expect, it } from 'vitest';
import { buildBoundaries, findBoundaryMatch } from '../../geo/boundaries';
import { PLATE_RASTER } from '../../geo/raster';
import { buildTerrainModel } from '../../geo/terrain';

const clusters = buildBoundaries(PLATE_RASTER);
const model = buildTerrainModel(PLATE_RASTER, clusters);

describe('terrain model', () => {
  it('keeps every keyframe inside the documented elevation bounds', () => {
    for (const keyframe of model.keyframes) {
      let min = Infinity;
      let max = -Infinity;
      let finite = true;
      for (let index = 0; index < keyframe.heights.length; index += 1) {
        const height = keyframe.heights[index];
        if (!Number.isFinite(height)) finite = false;
        if (height < min) min = height;
        if (height > max) max = height;
      }
      expect(finite).toBe(true);
      expect(min).toBeGreaterThanOrEqual(-11.0001);
      expect(max).toBeLessThanOrEqual(9.5001);
    }
  });

  it('is deterministic for a fixed seed', () => {
    const second = buildTerrainModel(PLATE_RASTER, clusters);
    const points = [
      { lat: 0, lon: 0 },
      { lat: 30, lon: 85 },
      { lat: -20, lon: -72 },
      { lat: -9, lon: 34 },
      { lat: 40, lon: -120 },
      { lat: 70, lon: 20 }
    ];
    for (const point of points) {
      expect(second.heightAt(point.lat, point.lon, 100)).toBeCloseTo(
        model.heightAt(point.lat, point.lon, 100),
        5
      );
    }
  });

  it('interpolates linearly between five-million-year keyframes', () => {
    const point = { lat: -20, lon: -72 };
    const h0 = model.heightAt(point.lat, point.lon, 0);
    const h5 = model.heightAt(point.lat, point.lon, 5);
    const h25 = model.heightAt(point.lat, point.lon, 2.5);
    expect(h25).toBeCloseTo((h0 + h5) / 2, 4);
  });

  it('raises ocean ridges above the surrounding ocean floor', () => {
    const ridge = findBoundaryMatch(clusters, {
      plates: ['nazca', 'pacific'],
      type: 'divergent',
      subtype: 'ridge'
    });
    expect(ridge).not.toBeNull();
    expect(Math.max(...model.features.ridgeUplift)).toBeGreaterThan(1);
    expect(Math.max(...model.features.ridgeTrough)).toBeGreaterThan(1);
    expect(model.crustAge.some((age, index) => model.ocean[index] === 1 && age < 10)).toBe(true);
  });

  it('creates a continental rift that drops below sea level over time', () => {
    const rift = findBoundaryMatch(clusters, {
      plates: ['nubia', 'somalia'],
      type: 'divergent',
      subtype: 'rift'
    });
    expect(rift).not.toBeNull();
    if (!rift) return;
    const point = rift.representative;
    const early = model.heightAt(point.lat, point.lon, 0);
    const late = model.heightAt(point.lat, point.lon, 200);
    expect(early).toBeGreaterThan(-0.5);
    expect(late).toBeLessThan(-1);
    expect(late).toBeLessThan(early);
    expect(Math.max(...model.features.riftValley)).toBeGreaterThan(3);
    expect(Math.max(...model.features.riftShoulder)).toBeGreaterThan(0.7);
  });

  it('builds a trench, mountain belt, and volcanic arc at ocean-continent convergence', () => {
    expect(Math.max(...model.features.trench)).toBeGreaterThan(4);
    expect(Math.max(...model.features.mountain)).toBeGreaterThan(3);
    expect(Math.max(...model.features.arc)).toBeGreaterThan(3);
  });

  it('thickens continental collision belts with mountains and a plateau', () => {
    expect(Math.max(...model.features.mountain)).toBeGreaterThan(4);
    expect(Math.max(...model.features.plateau)).toBeGreaterThan(1.2);
  });

  it('keeps transform relief small', () => {
    expect(Math.max(...model.features.transformTrough)).toBeLessThan(0.6);
    expect(Math.max(...model.features.transformUplift)).toBeLessThan(0.4);
  });

  it('produces usable normals and colors', () => {
    const normals = model.normalsFor(0);
    expect(normals.length).toBe(model.vertexCount * 3);
    for (let index = 0; index < 100; index += 1) {
      const x = normals[index * 3];
      const y = normals[index * 3 + 1];
      const z = normals[index * 3 + 2];
      expect(Number.isFinite(x + y + z)).toBe(true);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 4);
    }
    const colors = model.computeColors(model.keyframes[0].heights, {
      crustAge: false,
      plateColors: true
    });
    for (let index = 0; index < colors.length; index += 1) {
      expect(colors[index]).toBeGreaterThanOrEqual(0);
      expect(colors[index]).toBeLessThanOrEqual(1);
    }
    const ageColors = model.computeColors(model.keyframes[0].heights, {
      crustAge: true,
      plateColors: false
    });
    expect(ageColors.some((value, index) => value !== colors[index])).toBe(true);
  });
});
