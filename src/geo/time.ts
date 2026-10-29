import { KEYFRAME_COUNT, KEYFRAME_INTERVAL_MYR, MAX_TIME_MYR, PLAYBACK_SPEEDS } from './constants';
import { clamp } from './sphere';

export interface KeyframePosition {
  a: number;
  b: number;
  mix: number;
}

export function clampTime(myr: number): number {
  return clamp(myr, 0, MAX_TIME_MYR);
}

export function keyframePosition(myr: number): KeyframePosition {
  const raw = clampTime(myr) / KEYFRAME_INTERVAL_MYR;
  const a = clamp(Math.floor(raw), 0, KEYFRAME_COUNT - 1);
  const b = Math.min(a + 1, KEYFRAME_COUNT - 1);
  return { a, b, mix: raw - a };
}

export function interpolate(a: number, b: number, mix: number): number {
  return a + (b - a) * mix;
}

export function formatTimeLabel(myr: number): string {
  const value = clampTime(myr);
  if (value < 0.05) return '0 Myr · 현재';
  if (value > MAX_TIME_MYR - 0.05) return '200 Myr · 모델 미래';
  return `${value.toFixed(value < 10 ? 1 : 0)} Myr`;
}

export function formatTimeShort(myr: number): string {
  const value = clampTime(myr);
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)} Myr`;
}

export function timeDescriptionKo(myr: number): string {
  if (myr < 0.05) return '현재를 모델의 출발점으로 둡니다.';
  if (myr >= MAX_TIME_MYR - 0.05) return '모델 시간 200 Myr의 끝입니다. 실제 미래 예측이 아닙니다.';
  return '과거가 아니라 모델이 앞으로 진행되는 시간입니다.';
}

export function speedLabel(speed: number): string {
  return `${speed} Myr/s`;
}

export function nextSpeed(speed: number): number {
  const index = PLAYBACK_SPEEDS.indexOf(speed as (typeof PLAYBACK_SPEEDS)[number]);
  if (index < 0) return PLAYBACK_SPEEDS[0];
  return PLAYBACK_SPEEDS[(index + 1) % PLAYBACK_SPEEDS.length];
}

export function timeBucket(myr: number, bucketsPerMyr = 4): number {
  return Math.round(clampTime(myr) * bucketsPerMyr) / bucketsPerMyr;
}
