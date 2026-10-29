export function qs<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

export function qsa<T extends Element>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function setText(element: Element | null, value: string): void {
  if (element) element.textContent = value;
}

export function show(element: HTMLElement | null, visible: boolean): void {
  if (!element) return;
  element.classList.toggle('hidden', !visible);
}

export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
