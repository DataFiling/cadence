import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Desk } from "@/components/cadence/desk";
import "@/styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Desk desktop />
    </StrictMode>,
  );
}
