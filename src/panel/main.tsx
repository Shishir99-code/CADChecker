import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { startHandshake } from "./postMessage/handshake.ts";

function App() {
  useEffect(() => {
    const { teardown } = startHandshake();
    return teardown;
  }, []);

  function handleConnect() {
    // OAuth cannot complete inside the sandboxed Element Tab iframe -- the
    // Connect button must navigate the TOP-LEVEL frame to the backend OAuth
    // start URL, not fetch it from inside the iframe.
    window.top!.location.href = "/auth/onshape";
  }

  return (
    <main>
      <h1>CADChecker</h1>
      <p>FRC robot legality checks for Onshape.</p>
      <button type="button" onClick={handleConnect}>
        Connect Onshape
      </button>
      {/* Placeholder region -- Plan 03 mounts the report table (pass/fail
          rows + "plumbing proof" banner) and the dedicated Reconnect state
          (D-05) here. */}
      <section id="report-placeholder" />
    </main>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
