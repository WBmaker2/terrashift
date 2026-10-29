import { MAX_TIME_MYR } from '../geo/constants';

export type Route = 'explore' | 'missions' | 'teacher';
export type ViewMode = 'globe' | 'cross-section';

export interface TimeState {
  myr: number;
  playing: boolean;
  speed: number;
}

export interface SelectionState {
  boundaryId: string | null;
  plateId: string | null;
}

export interface LayerState {
  boundaries: boolean;
  labels: boolean;
  earthquakes: boolean;
  volcanoes: boolean;
  crustAge: boolean;
  plateColors: boolean;
}

export interface MissionState {
  currentId: string | null;
  answers: Record<string, string>;
  completed: string[];
  scores: Record<string, number>;
  attempts: Record<string, number>;
}

export interface Preferences {
  reducedMotion: boolean;
  showScaleWarning: boolean;
}

export interface AppState {
  route: Route;
  time: TimeState;
  selection: SelectionState;
  view: ViewMode;
  layers: LayerState;
  mission: MissionState;
  preferences: Preferences;
}

export const DEFAULT_LAYERS: LayerState = {
  boundaries: true,
  labels: true,
  earthquakes: true,
  volcanoes: true,
  crustAge: false,
  plateColors: true
};

export function createInitialState(reducedMotion = false): AppState {
  return {
    route: 'explore',
    time: { myr: 0, playing: false, speed: 1 },
    selection: { boundaryId: null, plateId: null },
    view: 'globe',
    layers: { ...DEFAULT_LAYERS },
    mission: {
      currentId: null,
      answers: {},
      completed: [],
      scores: {},
      attempts: {}
    },
    preferences: {
      reducedMotion,
      showScaleWarning: true
    }
  };
}

export function clampStateTime(state: AppState): AppState {
  return {
    ...state,
    time: {
      ...state.time,
      myr: Math.min(MAX_TIME_MYR, Math.max(0, state.time.myr))
    }
  };
}

type Listener = (state: AppState) => void;

export class Store {
  private listeners = new Set<Listener>();
  state: AppState;

  constructor(initial: AppState) {
    this.state = initial;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  update(updater: (state: AppState) => AppState): void {
    this.state = clampStateTime(updater(this.state));
    for (const listener of this.listeners) listener(this.state);
  }

  patch(patch: Partial<AppState>): void {
    this.update((state) => ({ ...state, ...patch }));
  }
}
