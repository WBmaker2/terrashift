import { Vector3 } from 'three';
import { EARTH_RADIUS_KM } from './constants';

export interface LatLon {
  lat: number;
  lon: number;
}

const DEG = Math.PI / 180;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeLon(lon: number): number {
  let value = lon;
  while (value >= 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

export function unwrapLon(lon: number, reference: number): number {
  let value = lon;
  while (value - reference > 180) value -= 360;
  while (value - reference < -180) value += 360;
  return value;
}

export function latLonToVector(lat: number, lon: number, radius = 1): Vector3 {
  const phi = lat * DEG;
  const lambda = lon * DEG;
  const cosPhi = Math.cos(phi);
  return new Vector3(
    cosPhi * Math.cos(lambda) * radius,
    Math.sin(phi) * radius,
    cosPhi * Math.sin(lambda) * radius
  );
}

export function vectorToLatLon(vector: Vector3): LatLon {
  const normalized = vector.clone().normalize();
  const lat = Math.asin(clamp(normalized.y, -1, 1)) / DEG;
  const lon = Math.atan2(normalized.z, normalized.x) / DEG;
  return { lat, lon };
}

export function angularDistanceRad(a: Vector3, b: Vector3): number {
  return Math.acos(clamp(a.clone().normalize().dot(b.clone().normalize()), -1, 1));
}

export function greatCircleDistanceKm(a: LatLon, b: LatLon): number {
  const va = latLonToVector(a.lat, a.lon);
  const vb = latLonToVector(b.lat, b.lon);
  return angularDistanceRad(va, vb) * EARTH_RADIUS_KM;
}

export function sphericalCentroid(points: LatLon[]): LatLon {
  const sum = new Vector3();
  for (const point of points) sum.add(latLonToVector(point.lat, point.lon));
  if (sum.lengthSq() < 1e-12) return points[0] ?? { lat: 0, lon: 0 };
  return vectorToLatLon(sum.normalize());
}

function distanceToArc(point: Vector3, a: Vector3, b: Vector3): number {
  const n = new Vector3().crossVectors(a, b);
  if (n.lengthSq() < 1e-12) return angularDistanceRad(point, a);
  n.normalize();
  const planeDistance = Math.abs(point.dot(n));
  const projected = point.clone().addScaledVector(n, -point.dot(n));
  if (projected.lengthSq() < 1e-12) return Math.PI / 2;
  projected.normalize();
  const between =
    Math.acos(clamp(a.dot(projected), -1, 1)) + Math.acos(clamp(projected.dot(b), -1, 1));
  const arc = Math.acos(clamp(a.dot(b), -1, 1));
  if (between <= arc + 1e-9) return Math.asin(clamp(planeDistance, -1, 1));
  return Math.min(angularDistanceRad(point, a), angularDistanceRad(point, b));
}

export function pointInSphericalPolygon(point: LatLon, polygon: LatLon[]): boolean {
  if (polygon.length < 3) return false;
  const p = latLonToVector(point.lat, point.lon);
  const centroid = new Vector3();
  for (const vertex of polygon) centroid.add(latLonToVector(vertex.lat, vertex.lon));
  if (centroid.lengthSq() < 1e-12) return false;
  centroid.normalize();
  const up = centroid;
  const reference = new Vector3(0, 1, 0);
  const east = new Vector3().crossVectors(up, reference);
  if (east.lengthSq() < 1e-12) east.set(1, 0, 0);
  east.normalize();
  const north = new Vector3().crossVectors(east, up).normalize();

  const project = (vector: Vector3): { x: number; y: number } | null => {
    const dot = vector.dot(up);
    if (dot <= 1e-6) return null;
    const tangent = vector.clone().addScaledVector(up, -dot);
    return { x: tangent.dot(east), y: tangent.dot(north) };
  };

  for (let i = 0; i < polygon.length; i += 1) {
    const a = latLonToVector(polygon[i].lat, polygon[i].lon);
    const b = latLonToVector(
      polygon[(i + 1) % polygon.length].lat,
      polygon[(i + 1) % polygon.length].lon
    );
    if (angularDistanceRad(p, a) < 1e-9 || distanceToArc(p, a, b) < 1e-9) return true;
  }

  const point2d = project(p);
  if (!point2d) return false;
  const projected = polygon.map((vertex) => project(latLonToVector(vertex.lat, vertex.lon)));
  if (projected.some((value) => value === null)) return false;
  let inside = false;
  for (let i = 0, j = projected.length - 1; i < projected.length; j = i, i += 1) {
    const a = projected[i] as { x: number; y: number };
    const b = projected[j] as { x: number; y: number };
    const intersects =
      a.y > point2d.y !== b.y > point2d.y &&
      point2d.x < ((b.x - a.x) * (point2d.y - a.y)) / (b.y - a.y || 1e-12) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function tangentBasis(
  lat: number,
  lon: number
): {
  up: Vector3;
  east: Vector3;
  north: Vector3;
} {
  const up = latLonToVector(lat, lon);
  const northPole = new Vector3(0, 1, 0);
  const east = new Vector3().crossVectors(up, northPole);
  if (east.lengthSq() < 1e-12) {
    east.set(1, 0, 0);
  } else {
    east.normalize();
  }
  const north = new Vector3().crossVectors(east, up).normalize();
  return { up, east, north };
}

export function motionVectorAt(
  motion: { eastCmYr: number; northCmYr: number },
  lat: number,
  lon: number
): Vector3 {
  const { east, north } = tangentBasis(lat, lon);
  return east.multiplyScalar(motion.eastCmYr).add(north.multiplyScalar(motion.northCmYr));
}

export function boundaryNormal(up: Vector3, tangent: Vector3, towardB: Vector3): Vector3 {
  const normal = new Vector3().crossVectors(up, tangent);
  if (normal.lengthSq() < 1e-12) return new Vector3(1, 0, 0);
  normal.normalize();
  if (normal.dot(towardB) < 0) normal.negate();
  return normal;
}

export function projectToTangent(vector: Vector3, up: Vector3): Vector3 {
  return vector.clone().addScaledVector(up, -vector.dot(up));
}
