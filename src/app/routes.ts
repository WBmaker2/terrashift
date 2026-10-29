import type { Route } from './state';

export function parseRoute(hash: string): Route {
  const value = hash.replace(/^#\/?/, '').split('?')[0];
  if (value === 'missions' || value === 'teacher' || value === 'explore') return value;
  return 'explore';
}

export function routeHash(route: Route): string {
  return `#/${route}`;
}

export function navigate(route: Route): void {
  const next = routeHash(route);
  if (window.location.hash === next) return;
  window.location.hash = next;
}
