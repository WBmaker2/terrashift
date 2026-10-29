import { describe, expect, it } from 'vitest';
import { buildBoundaries } from '../../geo/boundaries';
import {
  buildEventCatalog,
  countEventsInWindow,
  earthquakesInWindow,
  eruptionIntensity
} from '../../geo/events';
import { PLATE_RASTER } from '../../geo/raster';

const clusters = buildBoundaries(PLATE_RASTER);
const catalog = buildEventCatalog(clusters);
const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));

describe('event catalog', () => {
  it('is deterministic for a fixed seed', () => {
    const second = buildEventCatalog(clusters);
    expect(second.earthquakes.length).toBe(catalog.earthquakes.length);
    expect(second.volcanoes.length).toBe(catalog.volcanoes.length);
    expect(second.earthquakes[0]).toEqual(catalog.earthquakes[0]);
    expect(second.volcanoes[0]).toEqual(catalog.volcanoes[0]);
  });

  it('sorts earthquakes by time and keeps physical ranges', () => {
    let sorted = true;
    let valid = true;
    for (let index = 0; index < catalog.earthquakes.length; index += 1) {
      const event = catalog.earthquakes[index];
      if (index > 0 && event.timeMyr < catalog.earthquakes[index - 1].timeMyr) sorted = false;
      if (
        event.timeMyr < 0 ||
        event.timeMyr > 200 ||
        event.magnitude < 4 ||
        event.magnitude > 8.5 ||
        event.depthKm < 0 ||
        event.depthKm > 700 ||
        !Number.isFinite(event.lat) ||
        !Number.isFinite(event.lon) ||
        !clusterById.has(event.boundaryId)
      ) {
        valid = false;
      }
    }
    expect(sorted).toBe(true);
    expect(valid).toBe(true);
  });

  it('distributes earthquakes across all active boundary types', () => {
    const counts = countEventsInWindow(catalog, 100, 200);
    expect(counts.divergent).toBeGreaterThan(0);
    expect(counts.convergent).toBeGreaterThan(0);
    expect(counts.transform).toBeGreaterThan(0);
    expect(counts.total).toBe(
      counts.divergent + counts.convergent + counts.transform + counts.inactive
    );
  });

  it('caps visible earthquakes and filters by time window', () => {
    const visible = earthquakesInWindow(catalog, 100);
    expect(visible.length).toBeLessThanOrEqual(300);
    for (const event of visible) expect(Math.abs(event.timeMyr - 100)).toBeLessThanOrEqual(2);
    const counts = countEventsInWindow(catalog, 100);
    const manuallyFiltered = catalog.earthquakes.filter(
      (event) => Math.abs(event.timeMyr - 100) <= 2
    );
    expect(counts.total).toBe(manuallyFiltered.length);
  });

  it('never places volcanoes on transform boundaries and keeps them on uplift boundaries', () => {
    expect(catalog.volcanoes.length).toBeGreaterThan(0);
    for (const volcano of catalog.volcanoes) {
      if (volcano.boundaryId === null || (volcano as any).type === 'hotspot') {
        continue;
      }
      const cluster = clusterById.get(volcano.boundaryId);
      expect(cluster).toBeDefined();
      expect(cluster?.type).not.toBe('transform');
      expect(['convergent', 'divergent']).toContain(cluster?.type);
      if (cluster?.subtype === 'continental-continental') {
        throw new Error('continental collision should not host volcanoes in this model');
      }
    }
    expect(catalog.volcanoes.length).toBeGreaterThan(20);
  });

  it('assigns depth ranges by boundary type', () => {
    const byType = new Map<string, number[]>();
    for (const event of catalog.earthquakes) {
      const list = byType.get(event.boundaryType) ?? [];
      list.push(event.depthKm);
      byType.set(event.boundaryType, list);
    }
    const transformMax = Math.max(...(byType.get('transform') ?? [0]));
    const divergentMax = Math.max(...(byType.get('divergent') ?? [0]));
    const convergentMax = Math.max(...(byType.get('convergent') ?? [0]));
    expect(transformMax).toBeLessThanOrEqual(30.001);
    expect(divergentMax).toBeLessThanOrEqual(15.001);
    expect(convergentMax).toBeGreaterThan(300);
  });

  it('returns bounded eruption pulses', () => {
    const volcano = catalog.volcanoes[0];
    expect(eruptionIntensity(volcano, 100)).toBeGreaterThanOrEqual(0);
    expect(eruptionIntensity(volcano, 100)).toBeLessThanOrEqual(1);
  });
});
