import { afterEach, beforeEach, vi } from "vitest";

// jsdom has no layout. Supply geometry, not a mock virtualizer, so tests run the
// real range selection, resize observation, anchoring and scroll implementation.
const observers = new Set<ResizeObserverMock>();
let viewportHeight = 600;
const isViewport = (element: Element) => element.getAttribute("aria-label") === "Conversation history";
const height = (element: Element) => isViewport(element) ? viewportHeight : element.hasAttribute("data-message-id") ? Number(element.querySelector("[data-height]")?.getAttribute("data-height") ?? 180) : 0;
class ResizeObserverMock {
  targets = new Set<Element>();
  constructor(private callback: ResizeObserverCallback) { observers.add(this); }
  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); observers.delete(this); }
  notify() {
    const entries = [...this.targets].map(target => ({ target, borderBoxSize: [{ blockSize: height(target), inlineSize: 900 }], contentRect: target.getBoundingClientRect() } as unknown as ResizeObserverEntry));
    this.callback(entries, this as unknown as ResizeObserver);
  }
}
export function resizeTimeline(nextViewportHeight = viewportHeight) {
  viewportHeight = nextViewportHeight;
  for (const observer of observers) observer.notify();
}
beforeEach(() => {
  viewportHeight = 600;
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) { return height(this); });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) { return height(this); });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) { return isViewport(this) ? Math.max(viewportHeight, parseFloat(this.querySelector<HTMLElement>('ol[aria-label="Messages"]')?.style.height ?? "0") || 0) : height(this); });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) { return { x: 0, y: 0, top: 0, left: 0, right: 900, bottom: height(this), width: 900, height: height(this), toJSON() {} }; });
  const previous = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollTo = function (this: HTMLElement, options: ScrollToOptions | number = {}, y?: number) {
    const top = typeof options === "number" ? y ?? 0 : options.top ?? this.scrollTop;
    this.scrollTop = Math.max(0, Math.min(top, this.scrollHeight - this.clientHeight));
    this.dispatchEvent(new Event("scroll"));
  };
  restores.push(() => { HTMLElement.prototype.scrollTo = previous; });
});
const restores: (() => void)[] = [];
afterEach(() => { restores.splice(0).forEach(restore => restore()); observers.clear(); vi.restoreAllMocks(); });
