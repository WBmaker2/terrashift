import { PLATES, PLATE_INDEX_BY_ID, LAND_REGIONS, type LandRegion, type Plate } from './plates';
import { RASTER_LAT_STEPS, RASTER_LON_STEPS } from './constants';
import { clamp, latLonToVector, sphericalCentroid, unwrapLon, type LatLon } from './sphere';

interface PreparedPolygon {
  points: LatLon[];
  refLon: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  polarSouth: boolean;
  polarThreshold: number;
}

function preparePolygon(polygon: LatLon[], polar?: 'south'): PreparedPolygon {
  const refLon = polygon[0]?.lon ?? 0;
  const points = polygon.map((point) => ({
    lat: point.lat,
    lon: unwrapLon(point.lon, refLon)
  }));
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLon = Math.min(minLon, point.lon);
    maxLon = Math.max(maxLon, point.lon);
  }
  return {
    points,
    refLon,
    minLat,
    maxLat,
    minLon,
    maxLon,
    polarSouth: polar === 'south',
    polarThreshold: maxLat
  };
}

function containsPlanar(polygon: PreparedPolygon, lat: number, lon: number): boolean {
  if (polygon.polarSouth) return lat <= polygon.polarThreshold + 1e-9;
  const x = unwrapLon(lon, polygon.refLon);
  const y = lat;
  if (
    y < polygon.minLat - 1e-9 ||
    y > polygon.maxLat + 1e-9 ||
    x < polygon.minLon - 1e-9 ||
    x > polygon.maxLon + 1e-9
  ) {
    return false;
  }
  const points = polygon.points;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    const intersects =
      a.lat > y !== b.lat > y &&
      x < ((b.lon - a.lon) * (y - a.lat)) / (b.lat - a.lat || 1e-12) + a.lon;
    if (intersects) inside = !inside;
  }
  return inside;
}

export interface PlateRaster {
  ids: Uint8Array;
  land: Uint8Array;
  fallback: Uint8Array;
  fallbackCells: number;
  landCells: number;
  idAt: (lat: number, lon: number) => number;
  plateAtLatLon: (lat: number, lon: number) => Plate;
  isLandAt: (lat: number, lon: number) => boolean;
  cellCenter: (latIndex: number, lonIndex: number) => LatLon;
  cellId: (latIndex: number, lonIndex: number) => number;
  cellLand: (latIndex: number, lonIndex: number) => boolean;
}

function clampLatIndex(latIndex: number): number {
  return clamp(latIndex, 0, RASTER_LAT_STEPS - 1);
}

function wrapLonIndex(lonIndex: number): number {
  return ((lonIndex % RASTER_LON_STEPS) + RASTER_LON_STEPS) % RASTER_LON_STEPS;
}

export function buildPlateRaster(
  plates: Plate[] = PLATES,
  landRegions: LandRegion[] = LAND_REGIONS
): PlateRaster {
  const platePolygons = plates.map((plate) => preparePolygon(plate.polygon, plate.polar));
  const centroidVectors = plates.map((plate) => {
    const centroid = sphericalCentroid(plate.polygon);
    return latLonToVector(centroid.lat, centroid.lon);
  });
  const fallbackIndices = plates
    .map((plate, index) => (plate.fallbackEligible === false ? -1 : index))
    .filter((index) => index >= 0);
  const landPolygons = landRegions.map((region) => preparePolygon(region.polygon, region.polar));
  const ids = new Uint8Array(RASTER_LAT_STEPS * RASTER_LON_STEPS);
  const land = new Uint8Array(RASTER_LAT_STEPS * RASTER_LON_STEPS);
  const fallback = new Uint8Array(RASTER_LAT_STEPS * RASTER_LON_STEPS);
  let fallbackCells = 0;
  let landCells = 0;

  for (let latIndex = 0; latIndex < RASTER_LAT_STEPS; latIndex += 1) {
    const lat = -89.5 + latIndex;
    for (let lonIndex = 0; lonIndex < RASTER_LON_STEPS; lonIndex += 1) {
      const lon = -179.5 + lonIndex;
      let plateIndex = -1;
      for (let i = 0; i < platePolygons.length; i += 1) {
        if (containsPlanar(platePolygons[i], lat, lon)) plateIndex = i;
      }
      const cell = latIndex * RASTER_LON_STEPS + lonIndex;
      if (plateIndex < 0) {
        fallbackCells += 1;
        fallback[cell] = 1;
        const cellVector = latLonToVector(lat, lon);
        let bestDot = -Infinity;
        for (const index of fallbackIndices) {
          const dot = cellVector.dot(centroidVectors[index]);
          if (dot > bestDot) {
            bestDot = dot;
            plateIndex = index;
          }
        }
      }
      ids[cell] = plateIndex;
      let isLand = false;
      for (let i = 0; i < landPolygons.length; i += 1) {
        if (containsPlanar(landPolygons[i], lat, lon)) {
          isLand = true;
          break;
        }
      }
      if (isLand) {
        landCells += 1;
        land[cell] = 1;
      }
    }
  }

  const cellCenter = (latIndex: number, lonIndex: number): LatLon => ({
    lat: -89.5 + clampLatIndex(latIndex),
    lon: -179.5 + wrapLonIndex(lonIndex)
  });

  const idAt = (lat: number, lon: number): number => {
    const latIndex = clampLatIndex(Math.floor(lat + 90));
    const lonIndex = wrapLonIndex(Math.floor(lon + 180));
    return ids[latIndex * RASTER_LON_STEPS + lonIndex];
  };

  return {
    ids,
    land,
    fallback,
    fallbackCells,
    landCells,
    idAt,
    plateAtLatLon: (lat, lon) => plates[idAt(lat, lon)],
    isLandAt: (lat, lon) => {
      const latIndex = clampLatIndex(Math.floor(lat + 90));
      const lonIndex = wrapLonIndex(Math.floor(lon + 180));
      return land[latIndex * RASTER_LON_STEPS + lonIndex] === 1;
    },
    cellCenter,
    cellId: (latIndex, lonIndex) =>
      ids[clampLatIndex(latIndex) * RASTER_LON_STEPS + wrapLonIndex(lonIndex)],
    cellLand: (latIndex, lonIndex) =>
      land[clampLatIndex(latIndex) * RASTER_LON_STEPS + wrapLonIndex(lonIndex)] === 1
  };
}

export function plateIndexForId(id: string): number {
  return PLATE_INDEX_BY_ID.get(id) ?? -1;
}

export const PLATE_RASTER: PlateRaster = buildPlateRaster();
