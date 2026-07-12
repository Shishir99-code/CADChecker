import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { startHandshake, type OwnTabIdentity } from "./postMessage/handshake.ts";
import { runCheck, isReconnectSignal, AuthRequiredError, type CheckReport } from "./api.ts";
import { ReportTable } from "./components/ReportTable.tsx";
import { ReconnectState } from "./components/ReconnectState.tsx";
import { HullRender } from "./components/HullRender.tsx";
import { DisclosureHeader } from "./components/DisclosureHeader.tsx";

type CheckUiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "report"; report: CheckReport }
  | { status: "reconnect" }
  | { status: "auth-required" }
  | { status: "error"; message: string };

function App() {
  const [identity, setIdentity] = useState<OwnTabIdentity | null>(null);
  const [checkState, setCheckState] = useState<CheckUiState>({ status: "idle" });

  useEffect(() => {
    const { identity: ownIdentity, teardown } = startHandshake();
    setIdentity(ownIdentity);
    return teardown;
  }, []);

  function handleConnect() {
    // OAuth cannot complete inside the sandboxed Element Tab iframe -- the
    // Connect button must navigate the TOP-LEVEL frame to the backend OAuth
    // start URL, not fetch it from inside the iframe.
    window.top!.location.href = "/auth/onshape";
  }

  async function handleCheckNow() {
    if (!identity?.documentId || !identity.workspaceId) {
      setCheckState({ status: "error", message: "Missing document context; reopen the panel." });
      return;
    }

    setCheckState({ status: "loading" });
    try {
      // The panel supplies its own document/workspace identity; the backend
      // re-derives which ELEMENT to check at THIS click (CONN-02) -- it is
      // never selected or cached client-side.
      const result = await runCheck(identity.documentId, identity.workspaceId);
      if (isReconnectSignal(result)) {
        // D-05: rendered as a dedicated state, never as a row inside the
        // report table.
        setCheckState({ status: "reconnect" });
      } else {
        setCheckState({ status: "report", report: result });
      }
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        setCheckState({ status: "auth-required" });
      } else {
        setCheckState({ status: "error", message: "Check failed unexpectedly. Try again." });
      }
    }
  }

  return (
    <main>
      <h1>CADChecker</h1>
      <p>FRC robot legality checks for Onshape.</p>
      <button type="button" onClick={handleConnect}>
        Connect Onshape
      </button>
      <button type="button" onClick={handleCheckNow} disabled={checkState.status === "loading"}>
        Check now
      </button>

      <section id="report-placeholder">
        {checkState.status === "loading" && <p>Checking...</p>}

        {checkState.status === "reconnect" && <ReconnectState />}

        {checkState.status === "auth-required" && (
          <p>Not connected yet — click "Connect Onshape" above.</p>
        )}

        {checkState.status === "error" && <p role="alert">{checkState.message}</p>}

        {checkState.status === "report" && (
          <>
            <DisclosureHeader context={checkState.report.measuredContext} />
            <ReportTable verdicts={checkState.report.verdicts} />
            {(() => {
              // Selected by `geometry` presence, NOT `rule === "R101"` -- the
              // pre-existing R101/R103 rule-citation collision (a retired
              // Phase-1 proof-of-plumbing check also positionally cited
              // "R101") was resolved by retiring the two proof-of-plumbing
              // checks in 04-01 (D-01); `geometry` selection is kept as the
              // still-correct, collision-proof idiom. The panel performs
              // zero geometry recomputation -- it only renders whatever hull
              // vertex array the backend already computed (D-07).
              const perimeterVerdict = checkState.report.verdicts.find((v) => v.geometry);
              return perimeterVerdict ? <HullRender verdict={perimeterVerdict} /> : null;
            })()}
          </>
        )}
      </section>
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
