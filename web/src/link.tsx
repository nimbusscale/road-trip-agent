import type { MouseEvent, ReactNode } from "react";

import { navigate, pathOf, type Route } from "./route";

// A link to one of the app's pages. It changes the page without reloading, and still
// works as a plain link, such as to open in a new tab.
export function Link({ to, children }: { to: Route; children: ReactNode }) {
  function follow(event: MouseEvent<HTMLAnchorElement>): void {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  }

  return (
    <a href={pathOf(to)} onClick={follow}>
      {children}
    </a>
  );
}
