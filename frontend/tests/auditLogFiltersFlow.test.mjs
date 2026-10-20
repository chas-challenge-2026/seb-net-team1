import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";
import * as icons from "react-icons/fi";
import ts from "typescript";

const entry = {
  id: 43,
  action: "CREATE_PAYMENT",
  entityType: "payment",
  entityId: 36,
  description: "Betalning skapad: 175000 SEK till mottagaren",
  createdAt: "2026-10-14T12:14:51Z",
  userName: "Sara Ek",
  ipAddress: "192.0.2.1",
};
const filterOptions = {
  actions: ["CREATE_PAYMENT", "APPROVE_PAYMENT", "REJECT_PAYMENT"],
  users: [{ id: 0, name: "Systemet" }, { id: 7, name: "Sara Ek" }],
};
const page = (entries = [entry], nextCursor = null) => ({ entries, nextCursor });

function findAll(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => findAll(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...findAll(tree.props?.children, predicate)];
}

function find(tree, predicate) {
  const node = findAll(tree, predicate)[0];
  assert.ok(node, "Expected an element matching the supplied predicate");
  return node;
}

function textContent(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (Array.isArray(tree)) return tree.map(textContent).join("");
  if (typeof tree === "object") return textContent(tree.props?.children);
  return String(tree);
}

const byName = (name) => (node) => node.props?.name === name;
const byLabel = (label) => (node) => node.props?.["aria-label"] === label;
const byText = (label) => (node) => typeof node.props?.onClick === "function" && textContent(node) === label;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// Render the production page with controlled hooks and a deterministic timer.
// The real API/client still serializes requests; only the browser fetch boundary
// and unrelated child components are adapted for this dependency-free harness.
async function loadAuditLog(responses = [page()]) {
  const state = [];
  const refs = [];
  const dependencies = [];
  const memoized = [];
  const effects = [];
  const cleanups = [];
  const calls = [];
  const timers = new Map();
  let hookIndex = 0;
  let timerId = 0;
  let now = 0;
  let requestIndex = 0;

  const changed = (index, deps) => !dependencies[index] || !deps ||
    deps.length !== dependencies[index].length || deps.some((dep, i) => !Object.is(dep, dependencies[index][i]));
  const hooks = {
    useState(initial) {
      const index = hookIndex++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useRef(initial) {
      const index = hookIndex++;
      refs[index] ??= { current: initial };
      return refs[index];
    },
    useEffect(callback, deps) {
      const index = hookIndex++;
      if (changed(index, deps)) {
        dependencies[index] = deps;
        effects.push({ index, callback });
      }
    },
    useMemo(callback, deps) {
      const index = hookIndex++;
      if (changed(index, deps)) {
        dependencies[index] = deps;
        memoized[index] = callback();
      }
      return memoized[index];
    },
  };
  hooks.useCallback = (callback, deps) => hooks.useMemo(() => callback, deps);
  hooks.useLayoutEffect = hooks.useEffect;
  const clock = {
    setTimeout(callback, delay = 0) {
      const id = ++timerId;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const externals = new Map([
    ["react", hooks],
    ["react/jsx-runtime", jsxRuntime],
    ["react-icons/fi", icons],
    ["react-router-dom", { Link: () => null }],
    ["../components/dashboard/Sidebar", { default: () => null }],
    ["../components/dashboard/DashboardHeader", { default: () => null }],
    ["../components/audit/AuditEntryDetails", { default: () => null }],
  ]);
  const context = createContext({
    Headers, URLSearchParams, AbortController, Error, TypeError,
    console, ...clock, window: clock,
    localStorage: { getItem: () => null },
    fetch: async (url, options = {}) => {
      calls.push({ url: new URL(url), options });
      let body;
      if (new URL(url).pathname === "/api/audit-log/filters") {
        body = filterOptions;
      } else {
        assert.equal(new URL(url).pathname, "/api/audit-log");
        assert.ok(requestIndex < responses.length, "Unexpected audit request or automatic retry");
        const response = responses[requestIndex++];
        body = await (typeof response === "function" ? response(new URL(url), options) : response);
      }
      if (body instanceof Response) return body;
      return new Response(JSON.stringify(body), { status: 200 });
    },
  });
  const modules = new Map();
  function load(identifier) {
    if (!modules.has(identifier)) modules.set(identifier, createModule(identifier));
    return modules.get(identifier);
  }
  async function createModule(identifier) {
    const external = externals.get(identifier) ?? (identifier.endsWith(".css") ? {} : undefined);
    if (external) {
      return new SyntheticModule(Object.keys(external), function () {
        for (const [name, value] of Object.entries(external)) this.setExport(name, value);
      }, { context, identifier });
    }
    const url = new URL(identifier);
    const { outputText } = ts.transpileModule(await readFile(url, "utf8"), {
      fileName: fileURLToPath(url),
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    return new SourceTextModule(outputText, {
      context, identifier,
      initializeImportMeta(meta) { meta.env = { VITE_API_URL: "http://audit.test" }; },
    });
  }
  const module = await load(new URL("../src/pages/AuditLog.tsx", import.meta.url).href);
  await module.link((specifier, parent) => {
    if (externals.has(specifier) || specifier.endsWith(".css")) return load(specifier);
    const tsUrl = new URL(`${specifier}.ts`, parent.identifier);
    return load(existsSync(tsUrl) ? tsUrl.href : new URL(`${specifier}.tsx`, parent.identifier).href);
  });
  await module.evaluate();
  function render() {
    hookIndex = 0;
    return module.namespace.default();
  }
  async function settle() {
    // State updates from effects/fetch promises become visible on a subsequent
    // render, matching React's render/effect ordering without a browser DOM.
    for (let i = 0; i < 6; i++) {
      render();
      for (const { index, callback } of effects.splice(0)) {
        cleanups[index]?.();
        cleanups[index] = callback();
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    return render();
  }
  async function advance(milliseconds) {
    const until = now + milliseconds;
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.due <= until)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!due) break;
      now = due[1].due;
      timers.delete(due[0]);
      due[1].callback();
      await settle();
    }
    now = until;
    return settle();
  }
  async function change(name, value, predicate = byName(name)) {
    find(render(), predicate).props.onChange({ target: { name, value } });
    return settle();
  }
  await settle();
  return {
    render, settle, advance, change, calls,
    requests: () => calls.filter((call) => call.url.pathname === "/api/audit-log"),
    unmount: () => cleanups.forEach((cleanup) => cleanup?.()),
  };
}

test("audit has one search field in the filter toolbar and waits 300 ms before requesting results", async () => {
  const loaded = await loadAuditLog([page(), page([{ ...entry, id: 44, description: "Matchar Sara" }])]);
  const { render, change, advance, requests } = loaded;
  assert.equal(loaded.calls.filter((call) => call.url.pathname === "/api/audit-log/filters").length, 1);
  assert.equal(requests().length, 1);
  assert.equal(requests()[0].url.searchParams.get("limit"), "50");

  assert.equal(findAll(render(), (node) => node.type === "input" && node.props.type === "search").length, 1);
  const toolbar = find(render(), (node) => node.type === "form" && node.props.className === "audit-log-toolbar");
  assert.ok(find(toolbar, byName("search")));
  await change("search", "Sa");
  assert.equal(find(render(), byName("search")).props.value, "Sa");
  await advance(200);
  await change("search", "  Sara  ");
  assert.equal(find(render(), byName("search")).props.value, "  Sara  ");
  await advance(299);
  assert.equal(requests().length, 1, "Typing must not immediately request results");
  await advance(1);
  assert.equal(requests().length, 2);
  assert.equal(requests()[1].url.searchParams.get("search"), "Sara");
  assert.match(textContent(render()), /Matchar Sara/);
  loaded.unmount();
});

test("audit filters combine across requests and custom dates, then clear completely", async () => {
  const loaded = await loadAuditLog(Array.from({ length: 9 }, () => page()));
  const { render, change, requests, settle } = loaded;
  // These values are absent from the loaded CREATE_PAYMENT/Sara row. Options
  // must come from the dedicated endpoint, rather than the current page.
  assert.ok(find(render(), (node) => node.type === "option" && node.props.value === "APPROVE_PAYMENT"));
  assert.ok(find(render(), (node) => node.type === "option" && String(node.props.value) === "0" && textContent(node).includes("Systemet")));

  await change("action", "APPROVE_PAYMENT");
  assert.equal(requests().length, 2, "Selecting an action applies it immediately");
  await change("userId", "0");
  assert.equal(requests().at(-1).url.searchParams.get("userId"), "0");
  await change("dateRange", "custom");
  await change("fromDate", "2026-10-25");
  await change("toDate", "2026-10-25");
  const query = requests().at(-1).url.searchParams;
  assert.equal(query.get("action"), "APPROVE_PAYMENT");
  assert.equal(query.get("userId"), "0");
  assert.equal(query.get("from"), "2026-10-24T22:00:00.000Z");
  assert.equal(query.get("to"), "2026-10-25T23:00:00.000Z");

  await change("search", "pending search");
  await find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  await settle();
  assert.equal(requests().at(-1).url.searchParams.get("search"), "pending search", "Form submission includes the still-debounced search");
  const submittedCount = requests().length;
  await loaded.advance(300);
  assert.equal(requests().length, submittedCount, "A submitted search must not be submitted again by its old timer");

  find(render(), byText("Rensa filter")).props.onClick();
  await settle();
  assert.deepEqual([...requests().at(-1).url.searchParams.entries()], [["limit", "50"]]);
  assert.equal(find(render(), byName("dateRange")).props.value, "all");
  assert.equal(find(render(), byName("action")).props.value, "");
  assert.equal(find(render(), byName("userId")).props.value, "");
  assert.ok(findAll(render(), byName("search")).every((node) => node.props.value === ""));
  assert.equal(loaded.calls.filter((call) => call.url.pathname === "/api/audit-log/filters").length, 1,
    "Paging and filtering must not narrow or repeatedly reload filter choices");
  loaded.unmount();
});

test("filter changes reset pagination and prevent an aborted page from replacing new results", async () => {
  const oldPage = deferred();
  const filteredEntry = { ...entry, id: 90, action: "REJECT_PAYMENT", description: "Ny filtrerad betalning" };
  const loaded = await loadAuditLog([
    page([entry], "older+cursor/="),
    oldPage.promise,
    page([filteredEntry], "filtered-next"),
    page([{ ...filteredEntry, id: 91, description: "Äldre filtrerad betalning" }]),
    page([{ ...filteredEntry, id: 92, description: "Första sidan efter användarfilter" }]),
  ]);
  const { render, requests, settle, change } = loaded;
  find(render(), byLabel("Visa äldre händelser")).props.onClick();
  await settle();
  const oldRequest = requests()[1];
  assert.equal(oldRequest.url.searchParams.get("cursor"), "older+cursor/=");
  assert.equal(oldRequest.options.signal.aborted, false);

  await change("action", "REJECT_PAYMENT");
  assert.equal(oldRequest.options.signal.aborted, true, "Changing filters aborts the active page request");
  assert.equal(requests()[2].url.searchParams.has("cursor"), false);
  assert.equal(requests()[2].url.searchParams.get("action"), "REJECT_PAYMENT");
  assert.match(textContent(render()), /Ny filtrerad betalning/);
  assert.equal(find(render(), byLabel("Sida 1")).props["aria-current"], "page");
  assert.equal(findAll(render(), byLabel("Sida 2")).length, 0);

  oldPage.resolve(page([{ ...entry, description: "Gammalt svar som inte får visas" }], "outdated-cursor"));
  await settle();
  assert.match(textContent(render()), /Ny filtrerad betalning/);
  assert.doesNotMatch(textContent(render()), /Gammalt svar som inte får visas/);
  find(render(), byLabel("Visa äldre händelser")).props.onClick();
  await settle();
  assert.equal(requests()[3].url.searchParams.get("cursor"), "filtered-next");
  assert.equal(requests()[3].url.searchParams.get("action"), "REJECT_PAYMENT");
  assert.equal(find(render(), byLabel("Sida 2")).props["aria-current"], "page");
  assert.match(textContent(render()), /Äldre filtrerad betalning/);

  await change("userId", "7");
  assert.equal(requests()[4].url.searchParams.has("cursor"), false);
  assert.equal(requests()[4].url.searchParams.get("userId"), "7");
  assert.equal(requests()[4].url.searchParams.get("action"), "REJECT_PAYMENT");
  assert.equal(find(render(), byLabel("Sida 1")).props["aria-current"], "page");
  assert.equal(findAll(render(), byLabel("Sida 2")).length, 0, "Previously reached pages belong only to their old filters");
  loaded.unmount();
});

test("an empty filtered result remains usable and populated rows still open event details", async () => {
  const loaded = await loadAuditLog([page(), page([]), page()]);
  const { render, change, advance, settle } = loaded;
  find(render(), byLabel(`Visa detaljer för audit #${entry.id}`)).props.onClick();
  const details = find(render(), (node) => node.props?.entry?.id === entry.id);
  assert.equal(details.props.entry.entityId, 36);
  details.props.onClose();
  await settle();
  assert.equal(findAll(render(), (node) => node.props?.entry?.id === entry.id).length, 0);

  await change("search", "saknas");
  await advance(300);
  assert.equal(findAll(render(), (node) => node.type === "tbody").length, 0);
  assert.ok(find(render(), (node) => node.props?.role === "status" && /inga|ingen/i.test(textContent(node))));
  assert.equal(find(render(), byLabel("Visa äldre händelser")).props.disabled, true);
  find(render(), byText("Rensa filter")).props.onClick();
  await settle();
  assert.ok(find(render(), byLabel(`Visa detaljer för audit #${entry.id}`)));
  loaded.unmount();
});

test("revoked audit permission during a filter request removes previously visible data", async () => {
  const loaded = await loadAuditLog([
    page(),
    new Response(JSON.stringify({ detail: "Internal database secret" }), { status: 403 }),
  ]);
  assert.ok(find(loaded.render(), byLabel(`Visa detaljer för audit #${entry.id}`)));
  await loaded.change("action", "REJECT_PAYMENT");
  const tree = loaded.render();
  assert.match(textContent(find(tree, (node) => node.props?.role === "alert")), /Du saknar behörighet/);
  assert.doesNotMatch(textContent(tree), /Internal database secret|Betalning skapad: 175000/);
  assert.equal(findAll(tree, (node) => node.type === "tbody").length, 0);
  assert.equal(findAll(tree, byLabel("Visa äldre händelser")).length, 0);
  assert.equal(findAll(tree, byText("Försök igen")).length, 0);
  loaded.unmount();
});
