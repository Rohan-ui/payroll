/**
 * Test environment fixes, not app behaviour.
 *
 * Node 25+ ships its own `localStorage`/`sessionStorage`, which are undefined
 * unless Node is given a storage file, and they hide jsdom's working ones.
 * Point the globals back at jsdom's, as a browser has them.
 *
 * jsdom has no ResizeObserver (the letter editor uses it); a stand-in that
 * never reports a resize is enough for tests, which don't lay anything out.
 */
const dom = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (dom && !(globalThis as Record<string, unknown>)[key]) {
    Object.defineProperty(globalThis, key, { value: dom[key], configurable: true, writable: true });
  }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStandIn {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStandIn;
}
