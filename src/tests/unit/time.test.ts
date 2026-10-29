import { describe, expect, it } from 'vitest';
import {
  clampTime,
  formatTimeLabel,
  formatTimeShort,
  interpolate,
  keyframePosition,
  nextSpeed,
  speedLabel
} from '../../geo/time';

describe('time model', () => {
  it('clamps to zero through two hundred million years', () => {
    expect(clampTime(-5)).toBe(0);
    expect(clampTime(0)).toBe(0);
    expect(clampTime(200)).toBe(200);
    expect(clampTime(250)).toBe(200);
  });

  it('maps time onto five-million-year keyframes', () => {
    expect(keyframePosition(0)).toEqual({ a: 0, b: 1, mix: 0 });
    expect(keyframePosition(5)).toEqual({ a: 1, b: 2, mix: 0 });
    expect(keyframePosition(200)).toEqual({ a: 40, b: 40, mix: 0 });
    expect(keyframePosition(2.5).a).toBe(0);
    expect(keyframePosition(2.5).mix).toBeCloseTo(0.5, 9);
  });

  it('interpolates and formats labels', () => {
    expect(interpolate(0, 10, 0.25)).toBe(2.5);
    expect(formatTimeLabel(0)).toContain('현재');
    expect(formatTimeLabel(200)).toContain('모델 미래');
    expect(formatTimeShort(50)).toBe('50 Myr');
    expect(speedLabel(5)).toBe('5 Myr/s');
    expect(nextSpeed(20)).toBe(0.5);
  });
});
