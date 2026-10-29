import { Vector3 } from 'three';
import {
  EVENT_SEED,
  EVENT_WINDOW_MYR,
  MAX_VISIBLE_EARTHQUAKES,
  MAX_VISIBLE_VOLCANOES
} from './constants';
import { PLATE_BY_ID } from './plates';
import type { BoundaryCluster, BoundarySubtype, BoundaryType } from './boundaries';
import { clamp, latLonToVector, normalizeLon, vectorToLatLon, type LatLon } from './sphere';

export interface EarthquakeEvent {
  id: string;
  timeMyr: number;
  lat: number;
  lon: number;
  magnitude: number;
  depthKm: number;
  boundaryId: string;
  boundaryType: BoundaryType;
  boundarySubtype: BoundarySubtype;
}

export interface Volcano {
  id: string;
  lat: number;
  lon: number;
  boundaryId: string;
  boundaryType: BoundaryType;
  boundarySubtype: BoundarySubtype;
  eruptionTimesMyr: number[];
  phase: number;
}

export interface EventCatalog {
  earthquakes: EarthquakeEvent[];
  volcanoes: Volcano[];
}

export interface EventCounts {
  divergent: number;
  convergent: number;
  transform: number;
  inactive: number;
  total: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomMagnitude(random: () => number): number {
  const u = clamp(random(), 1e-9, 1 - 1e-9);
  const value = 4 + -Math.log(1 - u) / 0.95;
  return Math.min(8.5, value);
}

function depthFor(type: BoundaryType, subtype: BoundarySubtype, random: () => number): number {
  const u = random();
  if (type === 'transform') return 2 + u * 28;
  if (type === 'divergent') return 1 + u * 14;
  if (type === 'convergent') {
    if (subtype === 'continental-continental') return 5 + u * 60;
    return 10 + 690 * Math.pow(u, 1.8);
  }
  return 5 + u * 20;
}

function overridingSign(cluster: BoundaryCluster): number {
  const plateA = PLATE_BY_ID.get(cluster.plateA);
  const plateB = PLATE_BY_ID.get(cluster.plateB);
  if (!plateA || !plateB) return 1;
  if (plateA.type === 'oceanic' && plateB.type === 'continental') return 1;
  if (plateA.type === 'continental' && plateB.type === 'oceanic') return -1;
  return 1;
}

function offsetAlongNormal(point: LatLon, normal: Vector3, angleRad: number): LatLon {
  const up = latLonToVector(point.lat, point.lon);
  const moved = up
    .clone()
    .multiplyScalar(Math.cos(angleRad))
    .addScaledVector(normal, Math.sin(angleRad))
    .normalize();
  return vectorToLatLon(moved);
}

function segmentPoint(cluster: BoundaryCluster, random: () => number): LatLon {
  const segment = cluster.segments[Math.floor(random() * cluster.segments.length)];
  const t = random();
  return {
    lat: segment.mid.lat + (random() - 0.5) * 0.5,
    lon: normalizeLon(segment.mid.lon + (random() - 0.5) * 0.5 * t)
  };
}

function clusterRate(cluster: BoundaryCluster): number {
  const lengthFactor = clamp(cluster.lengthKm / 1500, 0.35, 8);
  return clamp(0.45 + cluster.relativeVelocityCmYr * 0.4, 0.45, 5.5) * lengthFactor;
}

export function buildEventCatalog(boundaries: BoundaryCluster[], seed = EVENT_SEED): EventCatalog {
  const random = mulberry32(seed);
  const earthquakes: EarthquakeEvent[] = [];
  let eventId = 0;

  for (const cluster of boundaries) {
    if (cluster.type === 'inactive' || cluster.segments.length === 0) continue;
    const rate = clusterRate(cluster);
    let time = -Math.log(1 - random()) / rate;
    while (time < 200) {
      if (time >= 0) {
        const point = segmentPoint(cluster, random);
        const magnitude = randomMagnitude(random);
        const depthKm = depthFor(cluster.type, cluster.subtype, random);
        let eventPoint: LatLon = point;
        if (
          cluster.type === 'convergent' &&
          (cluster.subtype === 'oceanic-continental' || cluster.subtype === 'oceanic-oceanic')
        ) {
          const inlandDeg = Math.min(8.5, (depthKm / 700) * 8.5);
          eventPoint = offsetAlongNormal(
            point,
            cluster.normal,
            inlandDeg * (Math.PI / 180) * overridingSign(cluster)
          );
        }
        earthquakes.push({
          id: `eq-${eventId}`,
          timeMyr: time,
          lat: clamp(eventPoint.lat, -89, 89),
          lon: normalizeLon(eventPoint.lon),
          magnitude,
          depthKm,
          boundaryId: cluster.id,
          boundaryType: cluster.type,
          boundarySubtype: cluster.subtype
        });
        eventId += 1;
      }
      time += -Math.log(1 - random()) / rate;
    }
  }

  earthquakes.sort((a, b) => a.timeMyr - b.timeMyr);

  const volcanoes: Volcano[] = [];
  let volcanoId = 0;
  for (const cluster of boundaries) {
    if (cluster.segments.length === 0) continue;
    const canVolcano =
      (cluster.type === 'convergent' &&
        (cluster.subtype === 'oceanic-continental' || cluster.subtype === 'oceanic-oceanic')) ||
      cluster.type === 'divergent';
    if (!canVolcano) continue;
    const stride = cluster.type === 'divergent' ? (cluster.subtype === 'rift' ? 18 : 14) : 4;
    const offsetDeg =
      cluster.type === 'convergent'
        ? cluster.subtype === 'oceanic-oceanic'
          ? 4.2
          : 5.2
        : cluster.subtype === 'rift'
          ? 1.8
          : 0.4;
    const sign = cluster.type === 'convergent' ? overridingSign(cluster) : 1;
    for (let index = 0; index < cluster.segments.length; index += stride) {
      const segment = cluster.segments[index];
      const jitter = (random() - 0.5) * 0.6;
      const point = offsetAlongNormal(
        segment.mid,
        cluster.normal,
        (((offsetDeg + jitter) * Math.PI) / 180) * sign
      );
      const eruptionTimesMyr: number[] = [];
      const rate = 0.02 + random() * 0.06;
      let time = -Math.log(1 - random()) / rate;
      while (time < 200) {
        if (time >= 0) eruptionTimesMyr.push(time);
        time += -Math.log(1 - random()) / rate;
      }
      volcanoes.push({
        id: `vol-${volcanoId}`,
        lat: clamp(point.lat, -88, 88),
        lon: normalizeLon(point.lon),
        boundaryId: cluster.id,
        boundaryType: cluster.type,
        boundarySubtype: cluster.subtype,
        eruptionTimesMyr,
        phase: random() * Math.PI * 2
      });
      volcanoId += 1;
    }
  }

  return { earthquakes, volcanoes };
}

function lowerBound(events: EarthquakeEvent[], time: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (events[mid].timeMyr < time) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperBound(events: EarthquakeEvent[], time: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (events[mid].timeMyr <= time) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function earthquakesInWindow(
  catalog: EventCatalog,
  myr: number,
  window = EVENT_WINDOW_MYR,
  max = MAX_VISIBLE_EARTHQUAKES
): EarthquakeEvent[] {
  const time = clamp(myr, 0, 200);
  const start = lowerBound(catalog.earthquakes, time - window);
  const end = upperBound(catalog.earthquakes, time + window);
  const filtered = catalog.earthquakes.slice(start, end);
  if (filtered.length <= max) return filtered;
  return filtered.sort((a, b) => b.magnitude - a.magnitude).slice(0, max);
}

export function countEventsInWindow(
  catalog: EventCatalog,
  myr: number,
  window = EVENT_WINDOW_MYR
): EventCounts {
  const counts: EventCounts = {
    divergent: 0,
    convergent: 0,
    transform: 0,
    inactive: 0,
    total: 0
  };
  const time = clamp(myr, 0, 200);
  const start = lowerBound(catalog.earthquakes, time - window);
  const end = upperBound(catalog.earthquakes, time + window);
  for (let index = start; index < end; index += 1) {
    const event = catalog.earthquakes[index];
    counts[event.boundaryType] += 1;
    counts.total += 1;
  }
  return counts;
}

export function visibleVolcanoes(catalog: EventCatalog, max = MAX_VISIBLE_VOLCANOES): Volcano[] {
  if (catalog.volcanoes.length <= max) return catalog.volcanoes;
  const stride = catalog.volcanoes.length / max;
  const result: Volcano[] = [];
  for (let index = 0; index < max; index += 1) {
    result.push(catalog.volcanoes[Math.floor(index * stride)]);
  }
  return result;
}

export function eruptionIntensity(volcano: Volcano, myr: number, window = 0.8): number {
  let best = 0;
  for (const time of volcano.eruptionTimesMyr) {
    const distance = Math.abs(time - myr);
    if (distance <= window) best = Math.max(best, 1 - distance / window);
  }
  return best;
}

export function depthCategory(depthKm: number): 'shallow' | 'intermediate' | 'deep' {
  if (depthKm < 30) return 'shallow';
  if (depthKm < 150) return 'intermediate';
  return 'deep';
}

export function depthColor(depthKm: number): string {
  const category = depthCategory(depthKm);
  if (category === 'shallow') return '#ff7043';
  if (category === 'intermediate') return '#ffc857';
  return '#9a86ff';
}

export function magnitudeRadius(magnitude: number): number {
  return 0.5 + clamp((magnitude - 4) / 4.5, 0, 1) * 1.45;
}
