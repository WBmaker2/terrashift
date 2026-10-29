import type { Route } from './state';

export interface UrlScenario {
  route?: Route;
  missionId?: string | null;
  boundaryId?: string | null;
  plateId?: string | null;
  myr?: number;
  view?: 'globe' | 'cross-section';
  layers?: Record<string, boolean>;
}

export function parseRoute(hash: string): Route {
  const value = hash.replace(/^#\/?/, '').split('?')[0];
  if (value === 'missions' || value === 'teacher' || value === 'explore') return value;
  return 'explore';
}

export function parseUrlScenario(hash: string): UrlScenario {
  const result: UrlScenario = {};
  const queryStart = hash.indexOf('?');
  if (queryStart === -1) return result;
  const query = hash.slice(queryStart + 1);
  const params = new URLSearchParams(query);
  const route = params.get('route');
  if (route === 'missions' || route === 'teacher' || route === 'explore') {
    result.route = route;
  }
  const mission = params.get('mission');
  if (mission) result.missionId = mission;
  const boundary = params.get('boundary');
  if (boundary) result.boundaryId = boundary;
  const plate = params.get('plate');
  if (plate) result.plateId = plate;
  const myr = params.get('myr');
  if (myr !== null) {
    const value = Number(myr);
    if (!Number.isNaN(value)) result.myr = Math.min(200, Math.max(0, value));
  }
  const view = params.get('view');
  if (view === 'globe' || view === 'cross-section') result.view = view;
  const layers: Record<string, boolean> = {};
  for (const key of ['boundaries', 'labels', 'earthquakes', 'volcanoes', 'crustAge', 'plateColors', 'hotspots']) {
    const val = params.get(`layer.${key}`);
    if (val === '1') layers[key] = true;
    if (val === '0') layers[key] = false;
  }
  if (Object.keys(layers).length > 0) result.layers = layers;
  return result;
}

export function buildScenarioUrl(state: {
  route: Route;
  missionId?: string | null;
  boundaryId?: string | null;
  plateId?: string | null;
  myr: number;
  view: 'globe' | 'cross-section';
  layers: Record<string, boolean>;
}): string {
  const params = new URLSearchParams();
  params.set('route', state.route);
  if (state.missionId) params.set('mission', state.missionId);
  if (state.boundaryId) params.set('boundary', state.boundaryId);
  if (state.plateId) params.set('plate', state.plateId);
  params.set('myr', String(Math.round(state.myr)));
  params.set('view', state.view);
  for (const [key, value] of Object.entries(state.layers)) {
    if (key === 'boundaries' && value) continue;
    if (key === 'labels' && value) continue;
    if (key === 'earthquakes' && value) continue;
    if (key === 'volcanoes' && value) continue;
    if (key === 'crustAge' && !value) continue;
    if (key === 'plateColors' && value) continue;
    if (key === 'hotspots' && value) continue;
    params.set(`layer.${key}`, value ? '1' : '0');
  }
  return `#/${state.route}?${params.toString()}`;
}

export function routeHash(route: Route): string {
  return `#/${route}`;
}

export function navigate(route: Route): void {
  const next = routeHash(route);
  if (window.location.hash === next) return;
  window.location.hash = next;
}

export function copyCurrentScenario(state: {
  route: Route;
  missionId?: string | null;
  boundaryId?: string | null;
  plateId?: string | null;
  myr: number;
  view: 'globe' | 'cross-section';
  layers: Record<string, boolean>;
}): string {
  const url = buildScenarioUrl(state);
  const fullUrl = `${window.location.origin}${window.location.pathname}${url}`;
  try {
    navigator.clipboard.writeText(fullUrl);
  } catch {
    // ignore
  }
  return fullUrl;
}
