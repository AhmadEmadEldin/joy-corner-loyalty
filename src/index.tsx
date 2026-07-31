import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RootApp } from "./RootApp";
import "./app.css";
import "./styles/joy-corner-tokens.css";
import "./styles/joy-corner-components.css";
import "./styles/joy-corner-responsive.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element.");
}

createRoot(root).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
