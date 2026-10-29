import { Vector3 } from 'three';
import raw from '../data/plates.json';
import { latLonToVector, sphericalCentroid, vectorToLatLon, type LatLon } from './sphere';

export type PlateType = 'oceanic' | 'continental';

export interface PlateMotion {
  eastCmYr: number;
  northCmYr: number;
}

export interface Plate {
  id: string;
  nameKo: string;
  nameEn: string;
  type: PlateType;
  color: string;
  motion: PlateMotion;
  polygon: LatLon[];
  polar?: 'south';
  fallbackEligible?: boolean;
}

export interface LandRegion {
  id: string;
  nameKo: string;
  polygon: LatLon[];
  polar?: 'south';
}

interface RawPlate extends Omit<Plate, 'polygon'> {
  polygon: LatLon[];
}

interface RawLand extends Omit<LandRegion, 'polygon'> {
  polygon: LatLon[];
}

interface RawData {
  meta: { labelKo: string; noteKo: string };
  plates: RawPlate[];
  land: RawLand[];
}

const data = raw as unknown as RawData;

export const PLATE_META = data.meta;
export const PLATES: Plate[] = data.plates;
export const LAND_REGIONS: LandRegion[] = data.land;
export const PLATE_BY_ID = new Map(PLATES.map((plate) => [plate.id, plate]));
export const PLATE_INDEX_BY_ID = new Map(PLATES.map((plate, index) => [plate.id, index]));

export const PLATE_CENTROIDS: LatLon[] = PLATES.map((plate) => sphericalCentroid(plate.polygon));
export const PLATE_CENTROID_VECTORS: Vector3[] = PLATE_CENTROIDS.map((centroid) =>
  latLonToVector(centroid.lat, centroid.lon)
);

export function plateAt(index: number): Plate {
  return PLATES[index] ?? PLATES[0];
}

export function plateById(id: string): Plate | undefined {
  return PLATE_BY_ID.get(id);
}

export function plateName(id: string): string {
  return PLATE_BY_ID.get(id)?.nameKo ?? id;
}

export function plateTypeLabel(type: PlateType): string {
  return type === 'oceanic' ? '해양판' : '대륙판';
}

export function plateTypeLabelForId(id: string): string {
  const plate = PLATE_BY_ID.get(id);
  return plate ? plateTypeLabel(plate.type) : '';
}

export function plateMotionLabel(plate: Plate): string {
  const east = plate.motion.eastCmYr;
  const north = plate.motion.northCmYr;
  const speed = Math.hypot(east, north).toFixed(1);
  const eastLabel = east >= 0 ? '동' : '서';
  const northLabel = north >= 0 ? '북' : '남';
  return `${eastLabel}${Math.abs(east).toFixed(1)} · ${northLabel}${Math.abs(north).toFixed(1)} cm/yr (${speed} cm/yr)`;
}

export function plateLabelPoint(plate: Plate): LatLon {
  return sphericalCentroid(plate.polygon);
}

export function plateOnSphere(plate: Plate, radius = 1.05): Vector3 {
  const centroid = plateLabelPoint(plate);
  return latLonToVector(centroid.lat, centroid.lon, radius);
}

export function plateCentroidVector(plate: Plate): Vector3 {
  return latLonToVector(plateLabelPoint(plate).lat, plateLabelPoint(plate).lon);
}

export function latLonEquals(a: LatLon, b: LatLon, epsilon = 1e-9): boolean {
  return Math.abs(a.lat - b.lat) < epsilon && Math.abs(a.lon - b.lon) < epsilon;
}

export function centroidFromVectors(vectors: Vector3[]): LatLon {
  const sum = new Vector3();
  for (const vector of vectors) sum.add(vector);
  if (sum.lengthSq() < 1e-12) return { lat: 0, lon: 0 };
  return vectorToLatLon(sum.normalize());
}
