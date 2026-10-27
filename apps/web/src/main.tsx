import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { net, savedSession } from "./store";
import "./styles.css";

const wanted = new URLSearchParams(location.search).get("sala")?.toUpperCase();
const session = savedSession();
if (session && (!wanted || wanted === session.code)) net.resume();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
