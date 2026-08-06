import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RootApp } from "./RootApp";
import "./design-system.css";
import "./app.css";
import "./redesign-components.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element.");
}

createRoot(root).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
