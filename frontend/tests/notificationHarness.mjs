import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";
import * as icons from "react-icons/fi";
import ts from "typescript";

export const admin = { id: 1, tenantId: 10, name: "Test Admin", email: "admin@example.test", role: "admin" };
export const pending = (paymentId, values = {}) => ({
  paymentId, approvalStepId: `step-${paymentId}`, toIban: "SE4550000000054910000099",
  amount: "175000.00", currency: "SEK", reference: `Faktura ${paymentId}`,
  createdAt: "2026-10-20T10:00:00Z", createdByName: "Sara Ek", fromAccountName: "Företagskonto",
  currentStep: 1, totalSteps: 2, requiresDoubleApproval: true, attestants: [], timeline: [], ...values,
});
export const inbox = (entries = []) => ({ pending: entries, recentlyHandled: [] });
export function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

export function findAll(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => findAll(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...findAll(tree.props?.children, predicate)];
}
export function find(tree, predicate) {
  const element = findAll(tree, predicate)[0];
  assert.ok(element, "Expected an element matching the supplied predicate");
  return element;
}
export function textContent(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (Array.isArray(tree)) return tree.map(textContent).join("");
  return typeof tree === "object" ? textContent(tree.props?.children) : String(tree);
}

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatchEvent(event) {
      for (const callback of [...(listeners.get(event.type) ?? [])]) callback(event);
      return true;
    },
    listenerCount(type) { return listeners.get(type)?.size ?? 0; },
  };
}

export function createBrowser(storedUser = null) {
  const timers = new Map();
  const storage = new Map(storedUser === null ? [] : [["user", JSON.stringify(storedUser)]]);
  let now = 0;
  let nextId = 0;
  const clock = {
    setTimeout(callback, delay = 0) { const id = ++nextId; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback, interval) { const id = ++nextId; timers.set(id, { callback, due: now + interval, interval }); return id; },
    clearInterval(id) { timers.delete(id); },
  };
  const document = { ...eventTarget(), visibilityState: "visible", activeElement: null };
  Object.defineProperty(document, "hidden", { get: () => document.visibilityState !== "visible" });
  const window = { ...eventTarget(), ...clock, innerWidth: 1280, innerHeight: 800 };
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  class FakeElement {
    constructor(node, parent) { this.node = node; this.parent = parent; this.children = []; this.style = {}; this.isConnected = true; this.focusCount = 0; }
    focus() { this.focusCount++; document.activeElement = this; }
    getBoundingClientRect() { return { top: 16, bottom: 52, left: 1200, right: 1236, width: 36, height: 36 }; }
    contains(target) { for (let current = target; current; current = current.parent) if (current === this) return true; return false; }
    querySelector() {
      const walk = (element) => {
        for (const child of element.children) {
          if (["button", "a", "input"].includes(child.node.type) || child.node.props?.to) return child;
          const found = walk(child);
          if (found) return found;
        }
      };
      return walk(this) ?? null;
    }
  }
  const refElements = new WeakMap();
  const nodeElements = new WeakMap();
  function attachRefs(tree, parent = null) {
    if (!tree || typeof tree !== "object") return;
    if (Array.isArray(tree)) { tree.forEach((child) => attachRefs(child, parent)); return; }
    const ref = tree.ref;
    const element = ref && typeof ref === "object" && refElements.has(ref) ? refElements.get(ref) : new FakeElement(tree, parent);
    element.node = tree;
    element.parent = parent;
    element.children = [];
    parent?.children.push(element);
    nodeElements.set(tree, element);
    if (ref && typeof ref === "object") { refElements.set(ref, element); ref.current = element; }
    else if (typeof ref === "function") ref(element);
    attachRefs(tree.props?.children, element);
  }
  return {
    window, document, localStorage, clock, attachRefs,
    elementFor: (node) => nodeElements.get(node),
    globals: { window, document, localStorage, ...clock, HTMLElement: FakeElement, Node: FakeElement, Event, CustomEvent },
    async advance(milliseconds, settle) {
      const until = now + milliseconds;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.due <= until).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.due;
        if (timer.interval) timer.due += timer.interval;
        else timers.delete(id);
        timer.callback();
        await settle();
      }
      now = until;
      return settle();
    },
    timerCount: () => timers.size,
  };
}

export function createHookHarness(browser) {
  const values = [];
  const dependencies = [];
  const cleanups = [];
  const effects = [];
  let cursor = 0;
  let component;
  const changed = (index, deps) => !dependencies[index] || !deps ||
    deps.length !== dependencies[index].length || deps.some((value, i) => !Object.is(value, dependencies[index][i]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
      return [values[index], (value) => { values[index] = typeof value === "function" ? value(values[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; values[index] ??= { current: initial }; return values[index]; },
    useMemo(callback, deps) {
      const index = cursor++;
      if (changed(index, deps)) { dependencies[index] = deps; values[index] = callback(); }
      return values[index];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (changed(index, deps)) { dependencies[index] = deps; effects.push({ index, callback }); }
    },
    useId() { const index = cursor++; return `:notification-${index}:`; },
  };
  hooks.useCallback = (callback, deps) => hooks.useMemo(() => callback, deps);
  hooks.useLayoutEffect = hooks.useEffect;
  function render() { cursor = 0; const result = component(); browser.attachRefs(result); return result; }
  return {
    hooks, render,
    setComponent: (value) => { component = value; },
    async settle() {
      for (let i = 0; i < 6; i++) {
        render();
        for (const { index, callback } of effects.splice(0)) { cleanups[index]?.(); cleanups[index] = callback(); }
        await new Promise((resolve) => setImmediate(resolve));
      }
      return render();
    },
    unmount() { cleanups.forEach((cleanup) => cleanup?.()); },
  };
}

export async function loadProductionModule(entry, { globals = {}, externals = new Map(), hooks } = {}) {
  const context = createContext({ Headers, AbortController, Error, TypeError, console, ...globals });
  const externalModules = new Map([
    ["react", hooks], ["react/jsx-runtime", jsxRuntime], ["react-icons/fi", icons],
    ["react-router-dom", { Link: () => null, useLocation: () => ({ key: "payments-page", pathname: "/payments", search: "" }) }],
    ...externals,
  ]);
  const modules = new Map();
  function load(identifier) {
    if (!modules.has(identifier)) modules.set(identifier, createModule(identifier));
    return modules.get(identifier);
  }
  async function createModule(identifier) {
    const external = externalModules.get(identifier) ?? (identifier.endsWith(".css") ? {} : undefined);
    if (external) return new SyntheticModule(Object.keys(external), function () {
      for (const [name, value] of Object.entries(external)) this.setExport(name, value);
    }, { context, identifier });
    const url = new URL(identifier);
    const { outputText } = ts.transpileModule(await readFile(url, "utf8"), {
      fileName: fileURLToPath(url),
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    return new SourceTextModule(outputText, { context, identifier, initializeImportMeta: (meta) => { meta.env = { VITE_API_URL: "http://notification.test" }; } });
  }
  const module = await load(new URL(`../src/${entry}`, import.meta.url).href);
  await module.link((specifier, parent) => {
    if (externalModules.has(specifier) || specifier.endsWith(".css")) return load(specifier);
    const tsUrl = new URL(`${specifier}.ts`, parent.identifier);
    return load(existsSync(tsUrl) ? tsUrl.href : new URL(`${specifier}.tsx`, parent.identifier).href);
  });
  await module.evaluate();
  return module.namespace;
}

export function createFetch(responses) {
  const calls = [];
  return {
    calls,
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const next = responses[calls.length - 1];
      assert.ok(next !== undefined, "Unexpected request or automatic retry");
      const response = await (typeof next === "function" ? next(url, options) : next);
      if (response instanceof Response) return response;
      if (response.error) throw response.error;
      return Response.json(Object.hasOwn(response, "body") ? response.body : response, {
        status: typeof response.status === "number" ? response.status : 200,
      });
    },
  };
}
