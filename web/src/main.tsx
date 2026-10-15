import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("index.html has no element with the ID root.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
