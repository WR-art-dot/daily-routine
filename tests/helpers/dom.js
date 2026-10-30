import { JSDOM } from 'jsdom';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

const GLOBALS = [
  'Node',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'Event',
  'CustomEvent',
  'HashChangeEvent',
  'MouseEvent',
  'KeyboardEvent',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'Blob',
  'File',
  'FileReader',
  'DOMParser'
];

export function setupDom() {
  const dom = new JSDOM(
    `<!DOCTYPE html><html data-theme="light"><body>
      <div id="app">
        <nav id="rail"></nav>
        <span id="page-title"></span>
        <span id="page-meta"></span>
        <span id="save-dot" data-state="idle"></span>
        <button id="btn-search"></button>
        <main id="view"></main>
      </div>
      <div id="toast-host"></div>
      <div id="overlay-host"></div>
    </body></html>`,
    { url: 'http://127.0.0.1:8787/#/home', pretendToBeVisual: true }
  );
  const w = dom.window;
  globalThis.window = w;
  globalThis.document = w.document;
  for (const key of GLOBALS) {
    if (w[key] !== undefined) globalThis[key] = w[key];
  }
  globalThis.indexedDB = indexedDB;
  globalThis.IDBKeyRange = IDBKeyRange;
  globalThis.localStorage = w.localStorage;
  globalThis.sessionStorage = w.sessionStorage;
  globalThis.location = w.location;
  globalThis.history = w.history;
  if (typeof w.matchMedia === 'function') {
    globalThis.matchMedia = w.matchMedia.bind(w);
  } else {
    globalThis.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {}
    });
  }
  return dom;
}

export function teardown(dom) {
  try {
    dom.window.close();
  } catch {
    /* ignore */
  }
}

export function click(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
}

export function type(input, value) {
  input.value = value;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
}

export function key(el, name, opts = {}) {
  const view = el.ownerDocument.defaultView;
  el.dispatchEvent(new view.KeyboardEvent('keydown', { key: name, bubbles: true, ...opts }));
}

export function wait(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}
