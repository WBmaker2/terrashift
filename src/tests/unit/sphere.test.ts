import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  boundaryNormal,
  greatCircleDistanceKm,
  latLonToVector,
  motionVectorAt,
  pointInSphericalPolygon,
  sphericalCentroid,
  tangentBasis,
  vectorToLatLon,
  type LatLon
} from '../../geo/sphere';

const places: LatLon[] = [
  { lat: 37.5665, lon: 126.978 },
  { lat: 40.7128, lon: -74.006 },
  { lat: -33.8688, lon: 151.2093 },
  { lat: -0.1807, lon: -78.4678 },
  { lat: 0, lon: 180 },
  { lat: 89.9, lon: -179.9 },
  { lat: -89.5, lon: 45 }
];

describe('sphere geometry', () => {
  it('round-trips lat/lon through unit vectors', () => {
    for (const place of places) {
      const vector = latLonToVector(place.lat, place.lon);
      expect(vector.length()).toBeCloseTo(1, 9);
      const back = vectorToLatLon(vector);
      expect(back.lat).toBeCloseTo(place.lat, 6);
      const lonDiff = Math.abs(((back.lon - place.lon + 540) % 360) - 180);
      expect(lonDiff).toBeLessThan(1e-6);
    }
  });

  it('computes known great-circle distances', () => {
    const seoulTokyo = greatCircleDistanceKm(
      { lat: 37.5665, lon: 126.978 },
      { lat: 35.6762, lon: 139.6503 }
    );
    expect(seoulTokyo).toBeGreaterThan(1120);
    expect(seoulTokyo).toBeLessThan(1200);
    const newYorkLondon = greatCircleDistanceKm(
      { lat: 40.7128, lon: -74.006 },
      { lat: 51.5074, lon: -0.1278 }
    );
    expect(newYorkLondon).toBeGreaterThan(5500);
    expect(newYorkLondon).toBeLessThan(5650);
  });

  it('handles spherical polygons on both sides of the dateline', () => {
    const triangle = [
      { lat: -10, lon: -10 },
      { lat: 10, lon: -10 },
      { lat: 0, lon: 10 }
    ];
    expect(pointInSphericalPolygon({ lat: 0, lon: 0 }, triangle)).toBe(true);
    expect(pointInSphericalPolygon({ lat: 35, lon: 0 }, triangle)).toBe(false);
    const dateline = [
      { lat: -10, lon: 170 },
      { lat: 10, lon: 170 },
      { lat: 10, lon: -170 },
      { lat: -10, lon: -170 }
    ];
    expect(pointInSphericalPolygon({ lat: 0, lon: 180 }, dateline)).toBe(true);
    expect(pointInSphericalPolygon({ lat: 0, lon: -180 }, dateline)).toBe(true);
    expect(pointInSphericalPolygon({ lat: 0, lon: 0 }, dateline)).toBe(false);
  });

  it('computes centroids and motion vectors with a proper tangent basis', () => {
    const centroid = sphericalCentroid([
      { lat: -10, lon: -10 },
      { lat: 10, lon: -10 },
      { lat: 10, lon: 10 },
      { lat: -10, lon: 10 }
    ]);
    expect(centroid.lat).toBeCloseTo(0, 6);
    expect(centroid.lon).toBeCloseTo(0, 6);
    const { east, north, up } = tangentBasis(0, 0);
    expect(east.dot(north)).toBeCloseTo(0, 9);
    expect(east.dot(up)).toBeCloseTo(0, 9);
    expect(north.y).toBeGreaterThan(0.99);
    const motion = motionVectorAt({ eastCmYr: 2, northCmYr: 3 }, 0, 0);
    expect(motion.z).toBeCloseTo(2, 9);
    expect(motion.y).toBeCloseTo(3, 9);
  });

  it('orients a boundary normal from plate A toward plate B', () => {
    const up = latLonToVector(0, 0);
    const tangent = new Vector3(0, 1, 0);
    const towardB = new Vector3(0, 0, 1);
    const normal = boundaryNormal(up, tangent, towardB);
    expect(normal.z).toBeCloseTo(1, 9);
  });
});
