import { Vector3 } from 'three';
import {
  EARTH_RADIUS_KM,
  KEYFRAME_COUNT,
  KEYFRAME_INTERVAL_MYR,
  MAX_TIME_MYR,
  TERRAIN_COLS,
  TERRAIN_LAT_SEGMENTS,
  TERRAIN_LON_SEGMENTS,
  TERRAIN_ROWS,
  VISUAL_HEIGHT_EXAGGERATION
} from './constants';
import { PLATE_BY_ID, PLATES } from './plates';
import type { PlateRaster } from './raster';
import { clamp, latLonToVector, normalizeLon } from './sphere';
import type { BoundaryCluster, BoundarySegment } from './boundaries';

export interface TerrainLayerState {
  crustAge: boolean;
  plateColors: boolean;
}

export interface TerrainFeatures {
  ridgeUplift: Float32Array;
  ridgeTrough: Float32Array;
  riftValley: Float32Array;
  riftWide: Float32Array;
  riftShoulder: Float32Array;
  trench: Float32Array;
  mountain: Float32Array;
  plateau: Float32Array;
  arc: Float32Array;
  transformTrough: Float32Array;
  transformUplift: Float32Array;
}

export interface TerrainKeyframe {
  heights: Float32Array;
  normals: Float32Array | null;
}

export interface TerrainModel {
  rows: number;
  cols: number;
  vertexCount: number;
  latitudes: Float32Array;
  longitudes: Float32Array;
  directions: Float32Array;
  ocean: Uint8Array;
  plateIds: Uint8Array;
  plateColors: Float32Array;
  baseHeights: Float32Array;
  crustAge: Float32Array;
  features: TerrainFeatures;
  keyframes: TerrainKeyframe[];
  keyframeIndex: (myr: number) => number;
  frameAt: (myr: number) => {
    a: number;
    b: number;
    mix: number;
    heightsA: Float32Array;
    heightsB: Float32Array;
  };
  normalsFor: (index: number) => Float32Array;
  heightAt: (lat: number, lon: number, myr: number) => number;
  surfacePoint: (lat: number, lon: number, myr: number, offset?: number) => Vector3;
  computeColors: (
    heights: Float32Array,
    layers: TerrainLayerState,
    out?: Float32Array
  ) => Float32Array;
}

const DEG = Math.PI / 180;
const D_LAT = 180 / TERRAIN_LAT_SEGMENTS;
const D_LON = 360 / TERRAIN_LON_SEGMENTS;

function hash3(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x, 374761393) +
    Math.imul(y, 668265263) +
    Math.imul(z, 2147483647) +
    Math.imul(seed, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  h = Math.imul(h ^ (h >>> 7), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smootherstep(x - xi);
  const yf = smootherstep(y - yi);
  const zf = smootherstep(z - zi);
  const c000 = hash3(xi, yi, zi, seed);
  const c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed);
  const c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed);
  const c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed);
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 * (1 - xf) + c100 * xf;
  const x10 = c010 * (1 - xf) + c110 * xf;
  const x01 = c001 * (1 - xf) + c101 * xf;
  const x11 = c011 * (1 - xf) + c111 * xf;
  const y0 = x00 * (1 - yf) + x10 * yf;
  const y1 = x01 * (1 - yf) + x11 * yf;
  return y0 * (1 - zf) + y1 * zf;
}

function fractalNoise(x: number, y: number, z: number, seed: number): number {
  let value = 0;
  let amplitude = 0.58;
  let frequency = 2.4;
  for (let octave = 0; octave < 4; octave += 1) {
    value +=
      (valueNoise3(x * frequency + seed * 0.001, y * frequency, z * frequency, seed + octave * 97) -
        0.5) *
      amplitude;
    amplitude *= 0.5;
    frequency *= 2.05;
  }
  return value;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255
  ];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function makeFeatureFields(vertexCount: number): TerrainFeatures {
  return {
    ridgeUplift: new Float32Array(vertexCount),
    ridgeTrough: new Float32Array(vertexCount),
    riftValley: new Float32Array(vertexCount),
    riftWide: new Float32Array(vertexCount),
    riftShoulder: new Float32Array(vertexCount),
    trench: new Float32Array(vertexCount),
    mountain: new Float32Array(vertexCount),
    plateau: new Float32Array(vertexCount),
    arc: new Float32Array(vertexCount),
    transformTrough: new Float32Array(vertexCount),
    transformUplift: new Float32Array(vertexCount)
  };
}

function timeFactors(myr: number): Record<string, number> {
  const t = clamp(myr, 0, MAX_TIME_MYR) / MAX_TIME_MYR;
  return {
    ridge: 0.85 + 0.15 * Math.min(1, t * 4),
    rift: 0.05 + 0.95 * Math.pow(t, 1.1),
    riftWide: Math.pow(t, 1.5),
    riftShoulder: 0.1 + 0.9 * Math.pow(t, 0.8),
    convergence: 0.55 + 0.45 * Math.min(1, t * 2),
    arc: 0.5 + 0.5 * Math.min(1, t * 2),
    plateau: 0.6 + 0.4 * Math.min(1, t * 2),
    transform: 0.35 + 0.65 * Math.min(1, t * 2)
  };
}

function weldWeight(distanceDeg: number, sigma: number): number {
  const z = distanceDeg / sigma;
  return Math.exp(-z * z);
}

function shoulderWeight(distanceDeg: number, offset: number, sigma: number): number {
  const z = (distanceDeg - offset) / sigma;
  return Math.exp(-z * z);
}

export function buildTerrainModel(
  raster: PlateRaster,
  boundaries: BoundaryCluster[],
  seed = 20261028
): TerrainModel {
  const rows = TERRAIN_ROWS;
  const cols = TERRAIN_COLS;
  const vertexCount = rows * cols;
  const latitudes = new Float32Array(rows);
  const longitudes = new Float32Array(cols);
  const directions = new Float32Array(vertexCount * 3);
  const ocean = new Uint8Array(vertexCount);
  const plateIds = new Uint8Array(vertexCount);
  const plateColors = new Float32Array(vertexCount * 3);
  const baseHeights = new Float32Array(vertexCount);
  const crustAge = new Float32Array(vertexCount);
  const features = makeFeatureFields(vertexCount);
  const plateColorMap = PLATES.map((plate) => hexToRgb(plate.color));

  for (let row = 0; row < rows; row += 1) {
    const lat = -90 + row * D_LAT;
    latitudes[row] = lat;
    for (let col = 0; col < cols; col += 1) {
      const lon = -180 + col * D_LON;
      if (row === 0) longitudes[col] = lon;
      const index = row * cols + col;
      const direction = latLonToVector(lat, lon);
      directions[index * 3] = direction.x;
      directions[index * 3 + 1] = direction.y;
      directions[index * 3 + 2] = direction.z;
      const isLand = raster.isLandAt(lat, lon);
      ocean[index] = isLand ? 0 : 1;
      const plateIndex = raster.idAt(lat, lon);
      plateIds[index] = plateIndex;
      const plateColor = plateColorMap[plateIndex] ?? plateColorMap[0];
      plateColors[index * 3] = plateColor[0];
      plateColors[index * 3 + 1] = plateColor[1];
      plateColors[index * 3 + 2] = plateColor[2];
      const polarIce = isLand && (lat < -64 || (lat > 64 && lon > -65 && lon < -15));
      let base = isLand ? 0.4 : -4.0;
      if (polarIce) base += lat < -64 ? 0.65 : 1.0;
      const noise = fractalNoise(direction.x, direction.y, direction.z, seed);
      base += noise * (isLand ? 0.55 : 0.4);
      baseHeights[index] = base;
      crustAge[index] = isLand ? 200 : 180;
    }
  }

  const maxRadiusDeg = 11;
  const maxRadiusRad = maxRadiusDeg * DEG;
  const cosMaxRadius = Math.cos(maxRadiusRad);

  for (const cluster of boundaries) {
    for (const segment of cluster.segments) {
      scatterSegment(
        segment,
        rows,
        cols,
        directions,
        ocean,
        crustAge,
        features,
        maxRadiusDeg,
        cosMaxRadius
      );
    }
  }

  const keyframes: TerrainKeyframe[] = [];
  for (let index = 0; index < KEYFRAME_COUNT; index += 1) {
    keyframes.push({
      heights: buildHeights(index * KEYFRAME_INTERVAL_MYR, baseHeights, features, vertexCount),
      normals: null
    });
  }

  const keyframeIndex = (myr: number): number => {
    const raw = clamp(myr, 0, MAX_TIME_MYR) / KEYFRAME_INTERVAL_MYR;
    return clamp(Math.round(raw), 0, KEYFRAME_COUNT - 1);
  };

  const frameAt = (myr: number) => {
    const raw = clamp(myr, 0, MAX_TIME_MYR) / KEYFRAME_INTERVAL_MYR;
    const a = clamp(Math.floor(raw), 0, KEYFRAME_COUNT - 1);
    const b = Math.min(a + 1, KEYFRAME_COUNT - 1);
    return {
      a,
      b,
      mix: raw - a,
      heightsA: keyframes[a].heights,
      heightsB: keyframes[b].heights
    };
  };

  const heightAtKeyframe = (lat: number, lon: number, heights: Float32Array): number => {
    const latPosition = ((clamp(lat, -90, 90) + 90) / 180) * TERRAIN_LAT_SEGMENTS;
    const lonPosition = ((normalizeLon(lon) + 180) / 360) * TERRAIN_LON_SEGMENTS;
    const row0 = clamp(Math.floor(latPosition), 0, TERRAIN_LAT_SEGMENTS);
    const row1 = Math.min(row0 + 1, TERRAIN_LAT_SEGMENTS);
    const col0 =
      ((Math.floor(lonPosition) % TERRAIN_LON_SEGMENTS) + TERRAIN_LON_SEGMENTS) %
      TERRAIN_LON_SEGMENTS;
    const col1 = (col0 + 1) % TERRAIN_LON_SEGMENTS;
    const ty = latPosition - row0;
    const tx = lonPosition - Math.floor(lonPosition);
    const h00 = heights[row0 * cols + col0];
    const h10 = heights[row0 * cols + col1];
    const h01 = heights[row1 * cols + col0];
    const h11 = heights[row1 * cols + col1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), ty);
  };

  const heightAt = (lat: number, lon: number, myr: number): number => {
    const { mix, heightsA, heightsB } = frameAt(myr);
    const heightA = heightAtKeyframe(lat, lon, heightsA);
    if (mix < 1e-6) return heightA;
    const heightB = heightAtKeyframe(lat, lon, heightsB);
    return lerp(heightA, heightB, mix);
  };

  const normalsFor = (index: number): Float32Array => {
    const keyframe = keyframes[index];
    if (keyframe.normals) return keyframe.normals;
    const normals = computeNormals(keyframe.heights, directions, rows, cols);
    keyframe.normals = normals;
    return normals;
  };

  const surfacePoint = (lat: number, lon: number, myr: number, offset = 0): Vector3 => {
    const height = heightAt(lat, lon, myr);
    const radius = 1 + (height * VISUAL_HEIGHT_EXAGGERATION) / EARTH_RADIUS_KM + offset;
    return latLonToVector(lat, lon, radius);
  };

  const computeColors = (
    heights: Float32Array,
    layers: TerrainLayerState,
    out?: Float32Array
  ): Float32Array => {
    const colors = out ?? new Float32Array(vertexCount * 3);
    for (let row = 0; row < rows; row += 1) {
      const lat = latitudes[row];
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const height = heights[index];
        const baseIndex = index * 3;
        let r: number;
        let g: number;
        let b: number;
        if (layers.crustAge && ocean[index] === 1) {
          const age = clamp(crustAge[index] / 200, 0, 1);
          if (age < 0.25) {
            const t = age / 0.25;
            r = lerp(1.0, 1.0, t);
            g = lerp(0.32, 0.7, t);
            b = lerp(0.2, 0.28, t);
          } else if (age < 0.6) {
            const t = (age - 0.25) / 0.35;
            r = lerp(1.0, 0.31, t);
            g = lerp(0.7, 0.8, t);
            b = lerp(0.28, 0.7, t);
          } else {
            const t = (age - 0.6) / 0.4;
            r = lerp(0.31, 0.12, t);
            g = lerp(0.8, 0.35, t);
            b = lerp(0.7, 0.68, t);
          }
        } else if (height > 0.02) {
          if (height < 0.65) {
            const t = clamp(height / 0.65, 0, 1);
            r = lerp(0.16, 0.3, t);
            g = lerp(0.46, 0.56, t);
            b = lerp(0.3, 0.26, t);
          } else if (height < 1.8) {
            const t = (height - 0.65) / 1.15;
            r = lerp(0.3, 0.48, t);
            g = lerp(0.56, 0.51, t);
            b = lerp(0.26, 0.28, t);
          } else if (height < 3.3) {
            const t = (height - 1.8) / 1.5;
            r = lerp(0.48, 0.62, t);
            g = lerp(0.51, 0.45, t);
            b = lerp(0.28, 0.32, t);
          } else if (height < 5.3) {
            const t = (height - 3.3) / 2.0;
            r = lerp(0.62, 0.74, t);
            g = lerp(0.45, 0.6, t);
            b = lerp(0.32, 0.5, t);
          } else if (height < 7.2) {
            const t = (height - 5.3) / 1.9;
            r = lerp(0.74, 0.84, t);
            g = lerp(0.6, 0.74, t);
            b = lerp(0.5, 0.68, t);
          } else {
            const t = clamp((height - 7.2) / 2.2, 0, 1);
            r = lerp(0.84, 0.96, t);
            g = lerp(0.74, 0.97, t);
            b = lerp(0.68, 0.98, t);
          }
          if (lat < -62 || lat > 68) {
            const ice = lat < -62 ? 1 : clamp((lat - 68) / 12, 0, 0.75);
            r = lerp(r, 0.91, ice);
            g = lerp(g, 0.96, ice);
            b = lerp(b, 0.98, ice);
          }
        } else {
          const depth = clamp(-height / 8.5, 0, 1);
          r = lerp(0.16, 0.012, depth);
          g = lerp(0.48, 0.05, depth);
          b = lerp(0.58, 0.16, depth);
        }
        if (layers.plateColors) {
          r = lerp(r, plateColors[baseIndex], 0.2);
          g = lerp(g, plateColors[baseIndex + 1], 0.2);
          b = lerp(b, plateColors[baseIndex + 2], 0.2);
        }
        const west = heights[row * cols + ((col - 1 + cols) % cols)];
        const east = heights[row * cols + ((col + 1) % cols)];
        const south = heights[Math.max(0, row - 1) * cols + col];
        const north = heights[Math.min(rows - 1, row + 1) * cols + col];
        const slope = (Math.abs(east - west) + Math.abs(north - south)) * 0.5;
        const shade = clamp(1 - slope * 0.12, 0.74, 1.04);
        r *= shade;
        g *= shade;
        b *= shade;
        colors[baseIndex] = clamp(r, 0, 1);
        colors[baseIndex + 1] = clamp(g, 0, 1);
        colors[baseIndex + 2] = clamp(b, 0, 1);
      }
    }
    return colors;
  };

  return {
    rows,
    cols,
    vertexCount,
    latitudes,
    longitudes,
    directions,
    ocean,
    plateIds,
    plateColors,
    baseHeights,
    crustAge,
    features,
    keyframes,
    keyframeIndex,
    frameAt,
    normalsFor,
    heightAt,
    surfacePoint,
    computeColors
  };
}

function scatterSegment(
  segment: BoundarySegment,
  rows: number,
  cols: number,
  directions: Float32Array,
  ocean: Uint8Array,
  crustAge: Float32Array,
  features: TerrainFeatures,
  maxRadiusDeg: number,
  cosMaxRadius: number
): void {
  const plateA = PLATE_BY_ID.get(segment.plateA);
  const plateB = PLATE_BY_ID.get(segment.plateB);
  if (!plateA || !plateB) return;
  if (segment.type === 'inactive') return;
  const midLat = segment.mid.lat;
  const midLon = segment.mid.lon;
  const boundaryDirection = latLonToVector(midLat, midLon);
  const normal = segment.normal;
  const latRadius = maxRadiusDeg;
  const lonRadius = Math.min(180, maxRadiusDeg / Math.max(0.14, Math.cos(midLat * DEG)));
  const rowStart = clamp(Math.floor((midLat - latRadius + 90) / (180 / (rows - 1))), 0, rows - 1);
  const rowEnd = clamp(Math.ceil((midLat + latRadius + 90) / (180 / (rows - 1))), 0, rows - 1);
  const lonStep = 360 / cols;
  const colCount = cols;
  const colStartRaw = Math.floor((normalizeLon(midLon - lonRadius) + 180) / lonStep);
  const colEndRaw = Math.ceil((normalizeLon(midLon + lonRadius) + 180) / lonStep);
  const colCountWindow = Math.max(1, Math.min(cols, colEndRaw - colStartRaw + 1));

  const applySide = (side: number, sign: number): boolean =>
    sign > 0 ? side > 0.0015 : side < -0.0015;

  const subtype = segment.subtype;
  const bothContinental = plateA.type === 'continental' && plateB.type === 'continental';
  const aOceanic = plateA.type === 'oceanic';
  let oceanSign = 0;
  let continentalSign = 0;
  let overridingSign = 0;
  if (subtype === 'oceanic-continental') {
    oceanSign = aOceanic ? -1 : 1;
    continentalSign = -oceanSign;
    overridingSign = continentalSign;
  } else if (subtype === 'oceanic-oceanic') {
    oceanSign = -1;
    overridingSign = 1;
  }

  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let offset = 0; offset < colCountWindow; offset += 1) {
      const col = (((colStartRaw + offset) % colCount) + colCount) % colCount;
      const index = row * cols + col;
      const dx = directions[index * 3];
      const dy = directions[index * 3 + 1];
      const dz = directions[index * 3 + 2];
      const dot = boundaryDirection.x * dx + boundaryDirection.y * dy + boundaryDirection.z * dz;
      if (dot < cosMaxRadius) continue;
      const distanceDeg = Math.acos(clamp(dot, -1, 1)) / DEG;
      if (distanceDeg > maxRadiusDeg) continue;
      const side = normal.x * dx + normal.y * dy + normal.z * dz;
      const isOcean = ocean[index] === 1;

      if (segment.type === 'divergent') {
        if (isOcean) {
          const uplift = weldWeight(distanceDeg, 4.0) * 1.5;
          const trough = weldWeight(distanceDeg, 0.6) * 1.3;
          if (uplift > features.ridgeUplift[index]) features.ridgeUplift[index] = uplift;
          if (trough > features.ridgeTrough[index]) features.ridgeTrough[index] = trough;
          if (distanceDeg < 32) {
            const age = distanceDeg * 6.2;
            if (age < crustAge[index]) crustAge[index] = age;
          }
        } else {
          const valley = weldWeight(distanceDeg, 1.2) * 3.4;
          const wide = weldWeight(distanceDeg, 3.2) * 1.5;
          const shoulder = shoulderWeight(distanceDeg, 2.6, 1.4) * 0.9;
          if (valley > features.riftValley[index]) features.riftValley[index] = valley;
          if (wide > features.riftWide[index]) features.riftWide[index] = wide;
          if (shoulder > features.riftShoulder[index]) features.riftShoulder[index] = shoulder;
        }
      } else if (segment.type === 'convergent') {
        if (bothContinental) {
          const mountain = weldWeight(distanceDeg, 2.8) * 4.6;
          const plateau = weldWeight(distanceDeg, 5.5) * 1.4;
          if (mountain > features.mountain[index]) features.mountain[index] = mountain;
          if (plateau > features.plateau[index]) features.plateau[index] = plateau;
        } else {
          if (isOcean && oceanSign !== 0 && applySide(side, oceanSign)) {
            const trench = weldWeight(distanceDeg, 0.9) * 6.0;
            if (trench > features.trench[index]) features.trench[index] = trench;
          }
          if (continentalSign !== 0 && applySide(side, continentalSign)) {
            const mountain = weldWeight(distanceDeg, 3.0) * 3.6;
            if (mountain > features.mountain[index]) features.mountain[index] = mountain;
          }
          if (overridingSign !== 0 && applySide(side, overridingSign)) {
            const arcOffset = subtype === 'oceanic-oceanic' ? 4.0 : 5.0;
            const arcAmplitude = subtype === 'oceanic-oceanic' ? 6.5 : 4.0;
            const arc = shoulderWeight(distanceDeg, arcOffset, 1.6) * arcAmplitude;
            if (arc > features.arc[index]) features.arc[index] = arc;
          }
        }
      } else if (segment.type === 'transform') {
        const trough = weldWeight(distanceDeg, 0.5) * 0.45;
        const uplift = shoulderWeight(distanceDeg, 1.8, 1.0) * 0.3;
        if (trough > features.transformTrough[index]) features.transformTrough[index] = trough;
        if (uplift > features.transformUplift[index]) features.transformUplift[index] = uplift;
      }
    }
  }
}

function buildHeights(
  myr: number,
  baseHeights: Float32Array,
  features: TerrainFeatures,
  vertexCount: number
): Float32Array {
  const factors = timeFactors(myr);
  const heights = new Float32Array(vertexCount);
  for (let index = 0; index < vertexCount; index += 1) {
    let height = baseHeights[index];
    height += features.ridgeUplift[index] * factors.ridge;
    height -= features.ridgeTrough[index] * factors.ridge;
    height -= features.riftValley[index] * factors.rift;
    height -= features.riftWide[index] * factors.riftWide;
    height += features.riftShoulder[index] * factors.riftShoulder;
    height -= features.trench[index] * factors.convergence;
    height += features.mountain[index] * factors.convergence;
    height += features.plateau[index] * factors.plateau;
    height += features.arc[index] * factors.arc;
    height -= features.transformTrough[index] * factors.transform;
    height += features.transformUplift[index] * factors.transform;
    heights[index] = clamp(height, -11, 9.5);
  }
  return heights;
}

function computeNormals(
  heights: Float32Array,
  directions: Float32Array,
  rows: number,
  cols: number
): Float32Array {
  const normals = new Float32Array(rows * cols * 3);
  const positionAt = (index: number, height: number, out: Vector3): Vector3 => {
    const radius = 1 + (height * VISUAL_HEIGHT_EXAGGERATION) / EARTH_RADIUS_KM;
    return out.set(
      directions[index * 3] * radius,
      directions[index * 3 + 1] * radius,
      directions[index * 3 + 2] * radius
    );
  };
  const east = new Vector3();
  const north = new Vector3();
  const pWest = new Vector3();
  const pEast = new Vector3();
  const pSouth = new Vector3();
  const pNorth = new Vector3();

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const out = index * 3;
      if (row === 0 || row === rows - 1) {
        normals[out] = directions[out];
        normals[out + 1] = directions[out + 1];
        normals[out + 2] = directions[out + 2];
        continue;
      }
      const west = row * cols + ((col - 1 + cols) % cols);
      const eastIndex = row * cols + ((col + 1) % cols);
      const south = (row - 1) * cols + col;
      const northIndex = (row + 1) * cols + col;
      positionAt(west, heights[west], pWest);
      positionAt(eastIndex, heights[eastIndex], pEast);
      positionAt(south, heights[south], pSouth);
      positionAt(northIndex, heights[northIndex], pNorth);
      east.subVectors(pEast, pWest);
      north.subVectors(pNorth, pSouth);
      east.cross(north);
      if (east.lengthSq() < 1e-16) {
        east.set(directions[out], directions[out + 1], directions[out + 2]);
      }
      east.normalize();
      if (
        east.x * directions[out] + east.y * directions[out + 1] + east.z * directions[out + 2] <
        0
      ) {
        east.negate();
      }
      normals[out] = east.x;
      normals[out + 1] = east.y;
      normals[out + 2] = east.z;
    }
  }
  return normals;
}

export function terrainBounds(model: TerrainModel, myr: number): { min: number; max: number } {
  const { heightsA, heightsB, mix } = model.frameAt(myr);
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < model.vertexCount; index += 1) {
    const h = lerp(heightsA[index], heightsB[index], mix);
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return { min, max };
}

export function terrainFeatureAt(
  model: TerrainModel,
  index: number,
  field: keyof TerrainFeatures
): number {
  return model.features[field][index];
}
