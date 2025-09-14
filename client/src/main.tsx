import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { TranslationProvider } from "@/context/TranslationContext";

createRoot(document.getElementById("root")!).render(
  <TranslationProvider>
    <App />
  </TranslationProvider>,
);
