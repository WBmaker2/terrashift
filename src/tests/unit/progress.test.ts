import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../app/state';
import {
  STORAGE_KEY,
  clearProgress,
  loadProgress,
  mergeProgress,
  saveProgress
} from '../../storage/progress';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    data
  };
}

describe('progress persistence', () => {
  it('saves and restores mission progress, layers, time, and preferences', () => {
    const storage = fakeStorage();
    const state = createInitialState(true);
    state.time.myr = 75;
    state.selection = { boundaryId: 'south-america-nazca', plateId: null };
    state.layers = { ...state.layers, earthquakes: false, crustAge: true };
    state.preferences = { reducedMotion: true, showScaleWarning: false };
    state.mission = {
      currentId: 'boundary-id',
      answers: { 'boundary-id:prediction': '수렴 경계' },
      completed: ['boundary-id'],
      scores: { 'boundary-id': 100 },
      attempts: { 'boundary-id': 0 }
    };
    saveProgress(state, storage);
    expect(storage.data.get(STORAGE_KEY)).toBeTruthy();
    const loaded = loadProgress(storage);
    expect(loaded.completed).toEqual(['boundary-id']);
    expect(loaded.lastTime).toBe(75);
    expect(loaded.layers?.crustAge).toBe(true);
    expect(loaded.preferences?.reducedMotion).toBe(true);
    const merged = mergeProgress(createInitialState(false), loaded);
    expect(merged.mission.completed).toContain('boundary-id');
    expect(merged.time.myr).toBe(75);
    expect(merged.layers.earthquakes).toBe(false);
  });

  it('survives corrupt storage and clears cleanly', () => {
    const storage = fakeStorage();
    storage.setItem(STORAGE_KEY, '{not-json');
    expect(loadProgress(storage)).toEqual({});
    clearProgress(storage);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rejects out-of-range persisted time', () => {
    const storage = fakeStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ lastTime: 900 }));
    expect(loadProgress(storage).lastTime).toBe(200);
  });
});
