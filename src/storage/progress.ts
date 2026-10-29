import type { AppState, LayerState, Preferences } from '../app/state';
import { MAX_TIME_MYR } from '../geo/constants';

export const STORAGE_KEY = 'terrashift.progress.v1';

export interface PersistedProgress {
  completed: string[];
  answers: Record<string, string>;
  scores: Record<string, number>;
  attempts: Record<string, number>;
  lastTime: number;
  lastSelection: { boundaryId: string | null; plateId: string | null };
  layers: LayerState;
  preferences: Preferences;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function sanitizeRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') result[key] = item;
  }
  return result;
}

function sanitizeNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'number' && Number.isFinite(item)) result[key] = item;
  }
  return result;
}

export function loadProgress(
  storage: StorageLike | null = defaultStorage()
): Partial<PersistedProgress> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      completed: sanitizeStringArray(parsed.completed),
      answers: sanitizeRecord(parsed.answers),
      scores: sanitizeNumberRecord(parsed.scores),
      attempts: sanitizeNumberRecord(parsed.attempts),
      lastTime:
        typeof parsed.lastTime === 'number' && Number.isFinite(parsed.lastTime)
          ? Math.min(MAX_TIME_MYR, Math.max(0, parsed.lastTime))
          : undefined,
      lastSelection:
        parsed.lastSelection && typeof parsed.lastSelection === 'object'
          ? {
              boundaryId:
                typeof (parsed.lastSelection as Record<string, unknown>).boundaryId === 'string'
                  ? ((parsed.lastSelection as Record<string, unknown>).boundaryId as string)
                  : null,
              plateId:
                typeof (parsed.lastSelection as Record<string, unknown>).plateId === 'string'
                  ? ((parsed.lastSelection as Record<string, unknown>).plateId as string)
                  : null
            }
          : undefined,
      layers:
        parsed.layers && typeof parsed.layers === 'object'
          ? (parsed.layers as LayerState)
          : undefined,
      preferences:
        parsed.preferences && typeof parsed.preferences === 'object'
          ? (parsed.preferences as Preferences)
          : undefined
    };
  } catch {
    return {};
  }
}

export function saveProgress(
  state: AppState,
  storage: StorageLike | null = defaultStorage()
): void {
  if (!storage) return;
  const payload: PersistedProgress = {
    completed: state.mission.completed,
    answers: state.mission.answers,
    scores: state.mission.scores,
    attempts: state.mission.attempts,
    lastTime: state.time.myr,
    lastSelection: state.selection,
    layers: state.layers,
    preferences: state.preferences
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be full or blocked; the app still works without persistence.
  }
}

export function clearProgress(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore blocked storage.
  }
}

export function mergeProgress(state: AppState, progress: Partial<PersistedProgress>): AppState {
  return {
    ...state,
    time: {
      ...state.time,
      myr: progress.lastTime ?? state.time.myr
    },
    selection: progress.lastSelection ?? state.selection,
    layers: progress.layers ? { ...state.layers, ...progress.layers } : state.layers,
    preferences: progress.preferences
      ? { ...state.preferences, ...progress.preferences }
      : state.preferences,
    mission: {
      ...state.mission,
      completed: progress.completed ?? state.mission.completed,
      answers: progress.answers ?? state.mission.answers,
      scores: progress.scores ?? state.mission.scores,
      attempts: progress.attempts ?? state.mission.attempts
    }
  };
}
