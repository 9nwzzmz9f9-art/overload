// Minimal hash router. Routes are registered as "/segment/:param/..."
// patterns; the first match wins. No history API needed — hash changes
// already give back-button and reload-to-same-screen support for free.

const routes = [];
let notFoundHandler = () => {};

export function route(pattern, handler) {
  const paramNames = [];
  const regex = new RegExp(
    "^" +
      pattern
        .split("/")
        .filter(Boolean)
        .map((segment) => {
          if (segment.startsWith(":")) {
            paramNames.push(segment.slice(1));
            return "([^/]+)";
          }
          return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("/") +
      "$"
  );
  routes.push({ regex, paramNames, handler });
}

export function notFound(handler) {
  notFoundHandler = handler;
}

export function navigate(path) {
  window.location.hash = path;
}

function currentPath() {
  return window.location.hash.replace(/^#/, "").split("/").filter(Boolean).join("/");
}

async function dispatch() {
  const path = currentPath();
  for (const { regex, paramNames, handler } of routes) {
    const match = path.match(regex);
    if (match) {
      const params = {};
      paramNames.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1])));
      await handler(params);
      return;
    }
  }
  await notFoundHandler();
}

export function startRouter() {
  window.addEventListener("hashchange", dispatch);
  dispatch();
}
