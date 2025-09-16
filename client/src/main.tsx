import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { TranslationProvider } from "@/context/TranslationContext";
import ErrorBoundary from "@/components/ErrorBoundary";

function Fallback() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      flexDirection: "column",
      gap: 12,
      padding: 16,
      textAlign: "center",
    }}>
      <h1 style={{ margin: 0 }}>Something went wrong</h1>
      <p style={{ maxWidth: 520, color: "#555" }}>
        An unexpected error occurred in the UI. Try reloading the page. If the
        problem persists, please share the browser console error.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "8px 14px",
          borderRadius: 6,
          border: "1px solid #1e3a8a",
          background: "#2563eb",
          color: "white",
          cursor: "pointer",
        }}
      >
        Reload
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <TranslationProvider>
    <ErrorBoundary fallback={<Fallback />}>
      <App />
    </ErrorBoundary>
  </TranslationProvider>,
);
