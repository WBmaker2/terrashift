import { describe, expect, it } from 'vitest';
import { PLATES } from '../../geo/plates';
import { PLATE_RASTER } from '../../geo/raster';

describe('plate raster', () => {
  it('assigns every one-degree cell to a valid plate', () => {
    expect(PLATE_RASTER.ids.length).toBe(360 * 180);
    const valid = new Set(PLATES.map((_, index) => index));
    let invalid = 0;
    for (const id of PLATE_RASTER.ids) if (!valid.has(id)) invalid += 1;
    expect(invalid).toBe(0);
  });

  it('places well-known locations on the expected plates', () => {
    expect(PLATE_RASTER.plateAtLatLon(0, -150).id).toBe('pacific');
    expect(PLATE_RASTER.plateAtLatLon(-10, -60).id).toBe('south-america');
    expect(PLATE_RASTER.plateAtLatLon(-80, 0).id).toBe('antarctica');
    expect(PLATE_RASTER.plateAtLatLon(50, 80).id).toBe('eurasia');
    expect(PLATE_RASTER.plateAtLatLon(-20, -85).id).toBe('nazca');
  });

  it('marks land and ocean for classroom landmarks', () => {
    expect(PLATE_RASTER.isLandAt(-10, -60)).toBe(true);
    expect(PLATE_RASTER.isLandAt(0, -150)).toBe(false);
    expect(PLATE_RASTER.isLandAt(30, 85)).toBe(true);
    expect(PLATE_RASTER.isLandAt(-80, 0)).toBe(true);
    expect(PLATE_RASTER.landCells).toBeGreaterThan(20000);
    expect(PLATE_RASTER.fallbackCells).toBeLessThan(PLATE_RASTER.ids.length);
  });
});
