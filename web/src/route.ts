import { useSyncExternalStore } from "react";

// The app's pages, each at its own path, so a reload opens the same page. Caddy and
// Vite give index.html for every path that isn't a file (systems design section 4).
export type Route =
  | { page: "home" }
  | { page: "newTrip" }
  | { page: "trip"; tripId: string }
  | { page: "newSession"; tripId: string }
  | { page: "session"; sessionId: string };

export function pathOf(route: Route): string {
  switch (route.page) {
    case "home":
      return "/";
    case "newTrip":
      return "/trips/new";
    case "trip":
      return `/trips/${route.tripId}`;
    case "newSession":
      return `/trips/${route.tripId}/sessions/new`;
    case "session":
      return `/sessions/${route.sessionId}`;
  }
}

// Each page's path, with the ID it holds.
const PATHS: [RegExp, (id: string) => Route][] = [
  [/^\/trips\/new$/, () => ({ page: "newTrip" })],
  [/^\/trips\/([^/]+)$/, (tripId) => ({ page: "trip", tripId })],
  [
    /^\/trips\/([^/]+)\/sessions\/new$/,
    (tripId) => ({ page: "newSession", tripId }),
  ],
  [/^\/sessions\/([^/]+)$/, (sessionId) => ({ page: "session", sessionId })],
];

// Any path it doesn't know is the home screen.
export function routeOf(path: string): Route {
  const trimmed = path.replace(/\/+$/, "");
  for (const [pattern, routeFor] of PATHS) {
    const match = pattern.exec(trimmed);
    if (match !== null) {
      return routeFor(match[1] ?? "");
    }
  }
  return { page: "home" };
}

let current = routeOf(window.location.pathname);
const listeners = new Set<() => void>();

function changeTo(route: Route): void {
  current = route;
  for (const listener of listeners) {
    listener();
  }
}

window.addEventListener("popstate", () => {
  changeTo(routeOf(window.location.pathname));
});

export function navigate(route: Route): void {
  window.history.pushState(null, "", pathOf(route));
  changeTo(route);
}

// Changes the address only, and leaves the page as it is. A new session's page uses
// it once the session exists, so a reload resumes it.
export function replaceAddress(route: Route): void {
  window.history.replaceState(null, "", pathOf(route));
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
  );
}
