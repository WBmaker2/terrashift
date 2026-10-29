import { Vector3 } from 'three';
import {
  CONVERGENCE_THRESHOLD,
  EARTH_RADIUS_KM,
  MIN_RELATIVE_SPEED,
  RASTER_LAT_STEPS,
  RASTER_LON_STEPS,
  TRANSFORM_RATIO
} from './constants';
import { PLATES, PLATE_BY_ID, type Plate, type PlateType } from './plates';
import type { PlateRaster } from './raster';
import {
  angularDistanceRad,
  boundaryNormal,
  clamp,
  latLonToVector,
  motionVectorAt,
  normalizeLon,
  projectToTangent,
  type LatLon
} from './sphere';

export type BoundaryType = 'divergent' | 'convergent' | 'transform' | 'inactive';
export type BoundarySubtype =
  | 'oceanic-oceanic'
  | 'oceanic-continental'
  | 'continental-continental'
  | 'ridge'
  | 'rift'
  | 'transform'
  | 'inactive';

export interface BoundarySegment {
  id: string;
  plateA: string;
  plateB: string;
  type: BoundaryType;
  subtype: BoundarySubtype;
  start: LatLon;
  end: LatLon;
  mid: LatLon;
  normal: Vector3;
  tangent: Vector3;
  relativeVelocity: Vector3;
  relativeVelocityCmYr: number;
  normalComponent: number;
  tangentialComponent: number;
  lengthKm: number;
  oceanBoundary: boolean;
}

export interface BoundaryCluster {
  id: string;
  plateA: string;
  plateB: string;
  type: BoundaryType;
  subtype: BoundarySubtype;
  points: LatLon[];
  segments: BoundarySegment[];
  relativeVelocityCmYr: number;
  normalComponent: number;
  tangentialComponent: number;
  representative: LatLon;
  normal: Vector3;
  tangent: Vector3;
  lengthKm: number;
  oceanBoundary: boolean;
}

export interface BoundaryMatch {
  plates?: string[];
  type?: BoundaryType;
  subtype?: BoundarySubtype;
}

export function classifyVelocity(
  relativeVelocity: Vector3,
  normal: Vector3,
  tangent: Vector3
): BoundaryType {
  const relativeSpeed = relativeVelocity.length();
  if (relativeSpeed < MIN_RELATIVE_SPEED) return 'inactive';
  const normalSpeed = relativeVelocity.dot(normal);
  const tangentSpeed = relativeVelocity.dot(tangent);
  if (
    Math.abs(normalSpeed) < CONVERGENCE_THRESHOLD &&
    Math.abs(tangentSpeed) > TRANSFORM_RATIO * Math.abs(normalSpeed)
  ) {
    return 'transform';
  }
  return normalSpeed > 0 ? 'convergent' : 'divergent';
}

export function classifyBoundary(
  velocityA: Vector3,
  velocityB: Vector3,
  normal: Vector3,
  tangent: Vector3
): BoundaryType {
  return classifyVelocity(velocityA.clone().sub(velocityB), normal, tangent);
}

export function subtypeFor(
  type: BoundaryType,
  plateAType: PlateType,
  plateBType: PlateType,
  oceanBoundary: boolean
): BoundarySubtype {
  if (type === 'divergent') return oceanBoundary ? 'ridge' : 'rift';
  if (type === 'convergent') {
    if (plateAType === 'oceanic' && plateBType === 'oceanic') return 'oceanic-oceanic';
    if (plateAType === 'continental' && plateBType === 'continental') {
      return oceanBoundary ? 'oceanic-oceanic' : 'continental-continental';
    }
    return 'oceanic-continental';
  }
  if (type === 'transform') return 'transform';
  return 'inactive';
}

function endpointKey(point: LatLon): string {
  return `${point.lat.toFixed(4)},${normalizeLon(point.lon).toFixed(4)}`;
}

function pointFromLatLon(point: LatLon): LatLon {
  return { lat: point.lat, lon: normalizeLon(point.lon) };
}

function buildRunPoints(segments: BoundarySegment[], run: number[]): LatLon[] {
  const points: LatLon[] = [];
  for (const index of run) {
    const segment = segments[index];
    if (points.length === 0) {
      points.push(pointFromLatLon(segment.start), pointFromLatLon(segment.end));
      continue;
    }
    const lastKey = endpointKey(points[points.length - 1]);
    if (endpointKey(segment.start) === lastKey) {
      points.push(pointFromLatLon(segment.end));
    } else if (endpointKey(segment.end) === lastKey) {
      points.push(pointFromLatLon(segment.start));
    } else {
      points.push(pointFromLatLon(segment.start), pointFromLatLon(segment.end));
    }
  }
  return points;
}

interface PairComponent {
  pairKey: string;
  indices: number[];
}

function representativeTypeHint(
  type: BoundaryType,
  subtype: BoundarySubtype
): 'land' | 'ocean' | 'any' {
  if (type === 'divergent') return subtype === 'rift' ? 'land' : 'ocean';
  if (subtype === 'continental-continental') return 'land';
  if (subtype === 'oceanic-oceanic') return 'ocean';
  if (type === 'transform') return 'land';
  return 'any';
}

export function buildBoundaries(raster: PlateRaster, plates: Plate[] = PLATES): BoundaryCluster[] {
  const rawSegments: BoundarySegment[] = [];
  let counter = 0;

  const addSegment = (latIndexA: number, lonIndexA: number, direction: 'east' | 'south') => {
    const plateActualA = plates[raster.cellId(latIndexA, lonIndexA)];
    const bLat = direction === 'east' ? latIndexA : latIndexA - 1;
    const bLon = direction === 'east' ? lonIndexA + 1 : lonIndexA;
    const plateActualB = plates[raster.cellId(bLat, bLon)];
    if (!plateActualA || !plateActualB || plateActualA.id === plateActualB.id) return;

    const centerA = raster.cellCenter(latIndexA, lonIndexA);
    const centerB =
      direction === 'east'
        ? raster.cellCenter(latIndexA, lonIndexA + 1)
        : raster.cellCenter(latIndexA - 1, lonIndexA);

    let start: LatLon;
    let end: LatLon;
    if (direction === 'east') {
      start = { lat: centerA.lat - 0.5, lon: normalizeLon(centerA.lon + 0.5) };
      end = { lat: centerA.lat + 0.5, lon: normalizeLon(centerA.lon + 0.5) };
    } else {
      start = { lat: centerA.lat - 0.5, lon: normalizeLon(centerA.lon - 0.5) };
      end = { lat: centerA.lat - 0.5, lon: normalizeLon(centerA.lon + 0.5) };
    }
    const mid: LatLon = {
      lat: (centerA.lat + centerB.lat) / 2,
      lon: normalizeLon((centerA.lon + centerB.lon) / 2)
    };
    const up = latLonToVector(mid.lat, mid.lon);
    const startVector = latLonToVector(start.lat, start.lon);
    const endVector = latLonToVector(end.lat, end.lon);
    const tangent = endVector.clone().sub(startVector);
    projectToTangent(tangent, up);
    if (tangent.lengthSq() < 1e-12) return;
    tangent.normalize();
    const towardB = projectToTangent(
      latLonToVector(centerB.lat, centerB.lon).sub(latLonToVector(centerA.lat, centerA.lon)),
      up
    );
    let normal = boundaryNormal(up, tangent, towardB);

    const velocityA = motionVectorAt(plateActualA.motion, mid.lat, mid.lon);
    const velocityB = motionVectorAt(plateActualB.motion, mid.lat, mid.lon);
    let relative = velocityA.clone().sub(velocityB);
    let plateA = plateActualA;
    let plateB = plateActualB;

    if (plateActualA.id > plateActualB.id) {
      plateA = plateActualB;
      plateB = plateActualA;
      normal = normal.clone().negate();
      relative = relative.clone().negate();
    }

    const oceanBoundary = !raster.cellLand(latIndexA, lonIndexA) && !raster.cellLand(bLat, bLon);
    rawSegments.push({
      id: `seg-${counter}`,
      plateA: plateA.id,
      plateB: plateB.id,
      type: 'inactive',
      subtype: 'inactive',
      start: pointFromLatLon(start),
      end: pointFromLatLon(end),
      mid,
      normal,
      tangent,
      relativeVelocity: relative,
      relativeVelocityCmYr: relative.length(),
      normalComponent: relative.dot(normal),
      tangentialComponent: relative.dot(tangent),
      lengthKm: angularDistanceRad(startVector, endVector) * EARTH_RADIUS_KM,
      oceanBoundary
    });
    counter += 1;
  };

  for (let latIndex = 0; latIndex < RASTER_LAT_STEPS; latIndex += 1) {
    for (let lonIndex = 0; lonIndex < RASTER_LON_STEPS; lonIndex += 1) {
      addSegment(latIndex, lonIndex, 'east');
      if (latIndex > 0) addSegment(latIndex, lonIndex, 'south');
    }
  }

  const pairGroups = new Map<string, number[]>();
  rawSegments.forEach((segment, index) => {
    const pairKey = `${segment.plateA}|${segment.plateB}`;
    const bucket = pairGroups.get(pairKey);
    if (bucket) bucket.push(index);
    else pairGroups.set(pairKey, [index]);
  });

  const components: PairComponent[] = [];
  for (const [pairKey, indices] of pairGroups) {
    const endpointMap = new Map<string, number[]>();
    for (const index of indices) {
      const segment = rawSegments[index];
      for (const point of [segment.start, segment.end]) {
        const pointKey = endpointKey(point);
        const list = endpointMap.get(pointKey);
        if (list) list.push(index);
        else endpointMap.set(pointKey, [index]);
      }
    }
    const visited = new Set<number>();
    for (const startIndex of indices) {
      if (visited.has(startIndex)) continue;
      const component: number[] = [];
      const queue = [startIndex];
      visited.add(startIndex);
      while (queue.length > 0) {
        const index = queue.pop() as number;
        component.push(index);
        const segment = rawSegments[index];
        for (const point of [segment.start, segment.end]) {
          const neighbors = endpointMap.get(endpointKey(point)) ?? [];
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }
      components.push({ pairKey, indices: component });
    }
  }

  const clusters: BoundaryCluster[] = [];
  let clusterCounter = 0;
  const smoothingWindow = 4;

  for (const component of components) {
    const indices = component.indices;
    const componentSet = new Set(indices);
    const localEndpointMap = new Map<string, number[]>();
    for (const index of indices) {
      const segment = rawSegments[index];
      for (const point of [segment.start, segment.end]) {
        const pointKey = endpointKey(point);
        const list = localEndpointMap.get(pointKey);
        if (list) list.push(index);
        else localEndpointMap.set(pointKey, [index]);
      }
    }

    let startKey: string | null = null;
    for (const [pointKey, segmentIndices] of localEndpointMap) {
      if (segmentIndices.length === 1) {
        startKey = pointKey;
        break;
      }
    }
    if (!startKey) startKey = endpointKey(rawSegments[indices[0]].start);

    const ordered: number[] = [];
    const usedSegments = new Set<number>();
    let currentKey = startKey;
    while (true) {
      const candidates = (localEndpointMap.get(currentKey) ?? []).filter(
        (index) => componentSet.has(index) && !usedSegments.has(index)
      );
      if (candidates.length === 0) break;
      const segmentIndex = candidates[0];
      usedSegments.add(segmentIndex);
      ordered.push(segmentIndex);
      const segment = rawSegments[segmentIndex];
      const otherKey =
        endpointKey(segment.start) === currentKey
          ? endpointKey(segment.end)
          : endpointKey(segment.start);
      currentKey = otherKey;
    }
    for (const index of indices) {
      if (!usedSegments.has(index)) ordered.push(index);
    }

    const smoothed = new Map<number, { normal: Vector3; tangent: Vector3 }>();
    for (let position = 0; position < ordered.length; position += 1) {
      const index = ordered[position];
      const segment = rawSegments[index];
      const up = latLonToVector(segment.mid.lat, segment.mid.lon);
      const sum = new Vector3();
      for (let offset = -smoothingWindow; offset <= smoothingWindow; offset += 1) {
        const neighbor = ordered[position + offset];
        if (neighbor === undefined) continue;
        sum.add(rawSegments[neighbor].normal);
      }
      let normal = projectToTangent(sum, up);
      if (normal.lengthSq() < 1e-9) normal = segment.normal.clone();
      normal.normalize();
      if (normal.dot(segment.normal) < 0) normal.negate();
      let tangent = new Vector3().crossVectors(normal, up);
      if (tangent.lengthSq() < 1e-9) tangent = segment.tangent.clone();
      tangent.normalize();
      smoothed.set(index, { normal, tangent });
    }

    for (const index of ordered) {
      const segment = rawSegments[index];
      const basis = smoothed.get(index);
      if (!basis) continue;
      const normalSpeed = segment.relativeVelocity.dot(basis.normal);
      const tangentSpeed = segment.relativeVelocity.dot(basis.tangent);
      const type = classifyVelocity(segment.relativeVelocity, basis.normal, basis.tangent);
      const plateA = PLATE_BY_ID.get(segment.plateA);
      const plateB = PLATE_BY_ID.get(segment.plateB);
      const subtype =
        plateA && plateB
          ? subtypeFor(type, plateA.type, plateB.type, segment.oceanBoundary)
          : 'inactive';
      segment.normal = basis.normal;
      segment.tangent = basis.tangent;
      segment.normalComponent = normalSpeed;
      segment.tangentialComponent = tangentSpeed;
      segment.type = type;
      segment.subtype = subtype;
    }

    const orderedClassifications = ordered.map((index) => {
      const segment = rawSegments[index];
      return `${segment.type}|${segment.subtype}`;
    });

    let runStart = 0;
    for (let position = 1; position <= ordered.length; position += 1) {
      if (
        position === ordered.length ||
        orderedClassifications[position] !== orderedClassifications[runStart]
      ) {
        const run = ordered.slice(runStart, position);
        const runSegments = run.map((index) => rawSegments[index]);
        if (runSegments.length > 0) {
          const centroid = new Vector3();
          for (const segment of runSegments) {
            centroid.add(latLonToVector(segment.mid.lat, segment.mid.lon));
          }
          centroid.normalize();
          const preferred = runSegments.filter((segment) => {
            if (representativeTypeHint(segment.type, segment.subtype) === 'land') {
              return !segment.oceanBoundary;
            }
            if (representativeTypeHint(segment.type, segment.subtype) === 'ocean') {
              return segment.oceanBoundary;
            }
            return true;
          });
          const candidates = preferred.length > 0 ? preferred : runSegments;
          let representative = candidates[0];
          let bestDot = -Infinity;
          for (const segment of candidates) {
            const dot = latLonToVector(segment.mid.lat, segment.mid.lon).dot(centroid);
            if (dot > bestDot) {
              bestDot = dot;
              representative = segment;
            }
          }
          let lengthKm = 0;
          let relativeVelocityCmYr = 0;
          let normalComponent = 0;
          let tangentialComponent = 0;
          let oceanCount = 0;
          for (const segment of runSegments) {
            lengthKm += segment.lengthKm;
            relativeVelocityCmYr += segment.relativeVelocityCmYr;
            normalComponent += segment.normalComponent;
            tangentialComponent += segment.tangentialComponent;
            if (segment.oceanBoundary) oceanCount += 1;
          }
          const size = runSegments.length;
          clusters.push({
            id: `${component.pairKey.replace(/\|/g, '-')}-${representative.type}-${representative.subtype}-${clusterCounter}`,
            plateA: representative.plateA,
            plateB: representative.plateB,
            type: representative.type,
            subtype: representative.subtype,
            points: buildRunPoints(rawSegments, run),
            segments: runSegments,
            relativeVelocityCmYr: relativeVelocityCmYr / size,
            normalComponent: normalComponent / size,
            tangentialComponent: tangentialComponent / size,
            representative: representative.mid,
            normal: representative.normal,
            tangent: representative.tangent,
            lengthKm,
            oceanBoundary: oceanCount > size / 2
          });
          clusterCounter += 1;
        }
        runStart = position;
      }
    }
  }

  clusters.sort((a, b) => b.lengthKm - a.lengthKm);
  return clusters;
}

export function findNearestBoundary(
  clusters: BoundaryCluster[],
  lat: number,
  lon: number,
  maxDistanceDeg = 7
): { cluster: BoundaryCluster; distanceDeg: number } | null {
  const point = latLonToVector(lat, lon);
  let best: BoundaryCluster | null = null;
  let bestAngle = Infinity;
  for (const cluster of clusters) {
    for (const segment of cluster.segments) {
      const segmentPoint = latLonToVector(segment.mid.lat, segment.mid.lon);
      const angle = Math.acos(clamp(point.dot(segmentPoint), -1, 1));
      if (angle < bestAngle) {
        bestAngle = angle;
        best = cluster;
      }
    }
  }
  if (!best || (bestAngle * 180) / Math.PI > maxDistanceDeg) return null;
  return { cluster: best, distanceDeg: (bestAngle * 180) / Math.PI };
}

export function clusterHasPlates(cluster: BoundaryCluster, plates: string[]): boolean {
  const set = new Set([cluster.plateA, cluster.plateB]);
  if (plates.length === 1) return set.has(plates[0]);
  return plates.every((plate) => set.has(plate));
}

export function matchesBoundary(cluster: BoundaryCluster, match: BoundaryMatch): boolean {
  if (match.plates && !clusterHasPlates(cluster, match.plates)) return false;
  if (match.type && cluster.type !== match.type) return false;
  if (match.subtype && cluster.subtype !== match.subtype) return false;
  return true;
}

export function findBoundaryMatch(
  clusters: BoundaryCluster[],
  match: BoundaryMatch
): BoundaryCluster | null {
  const candidates = clusters.filter((cluster) => matchesBoundary(cluster, match));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) =>
    candidate.lengthKm > best.lengthKm ? candidate : best
  );
}

export function boundariesForPlate(
  clusters: BoundaryCluster[],
  plateId: string
): BoundaryCluster[] {
  return clusters.filter((cluster) => cluster.plateA === plateId || cluster.plateB === plateId);
}

export function boundaryTypeLabelKo(type: BoundaryType): string {
  switch (type) {
    case 'divergent':
      return '발산 경계';
    case 'convergent':
      return '수렴 경계';
    case 'transform':
      return '변환 경계';
    default:
      return '활동이 약한 경계';
  }
}

export function boundaryTypeShortKo(type: BoundaryType): string {
  switch (type) {
    case 'divergent':
      return '발산';
    case 'convergent':
      return '수렴';
    case 'transform':
      return '변환';
    default:
      return '약함';
  }
}

export function boundarySubtypeLabelKo(subtype: BoundarySubtype): string {
  switch (subtype) {
    case 'ridge':
      return '해령';
    case 'rift':
      return '대륙 열곡';
    case 'oceanic-continental':
      return '해양-대륙 수렴';
    case 'oceanic-oceanic':
      return '해양-해양 수렴';
    case 'continental-continental':
      return '대륙-대륙 충돌';
    case 'transform':
      return '변환 단층';
    default:
      return '비활성';
  }
}

export function boundaryLandformLabelKo(subtype: BoundarySubtype): string {
  switch (subtype) {
    case 'ridge':
      return '해령 · 새로운 해양 지각';
    case 'rift':
      return '열곡 · 갈라지는 대륙';
    case 'oceanic-continental':
      return '해구 · 산맥 · 화산호';
    case 'oceanic-oceanic':
      return '해구 · 섬호';
    case 'continental-continental':
      return '습곡 산맥 · 고원';
    case 'transform':
      return '단층 · 얕은 지진';
    default:
      return '뚜렷한 지형 변화가 적음';
  }
}

export function boundaryTypeColor(type: BoundaryType): string {
  switch (type) {
    case 'divergent':
      return '#f1a43c';
    case 'convergent':
      return '#e7644b';
    case 'transform':
      return '#b08be8';
    default:
      return '#8a9aa0';
  }
}

export function boundaryPlatesLabelKo(cluster: BoundaryCluster): string {
  const a = PLATE_BY_ID.get(cluster.plateA)?.nameKo ?? cluster.plateA;
  const b = PLATE_BY_ID.get(cluster.plateB)?.nameKo ?? cluster.plateB;
  return `${a} · ${b}`;
}

export function boundaryRelativeMotionLabel(cluster: BoundaryCluster): string {
  return `${cluster.relativeVelocityCmYr.toFixed(1)} cm/yr`;
}

export function boundaryOceanSide(cluster: BoundaryCluster): 'A' | 'B' | 'both' {
  const plateA = PLATE_BY_ID.get(cluster.plateA);
  const plateB = PLATE_BY_ID.get(cluster.plateB);
  if (!plateA || !plateB) return 'both';
  if (plateA.type === 'oceanic' && plateB.type === 'continental') return 'A';
  if (plateA.type === 'continental' && plateB.type === 'oceanic') return 'B';
  return 'both';
}
