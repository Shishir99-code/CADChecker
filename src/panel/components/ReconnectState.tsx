/**
 * D-05 dedicated Reconnect view. Rendered ONLY when the backend signals
 * needsReconnect (a refresh failure) -- it must be visually distinct from
 * check-result rows so an expired session is never mistaken for a check
 * failure (CONN-03 / Success Criterion 3, Threat T-01-13).
 */
export function ReconnectState() {
  function handleReconnect() {
    // OAuth cannot complete inside the sandboxed Element Tab iframe -- the
    // reconnect button must navigate the TOP-LEVEL frame, matching the
    // "Connect Onshape" action's own navigation pattern (Plan 01).
    window.top!.location.href = "/auth/onshape";
  }

  return (
    <div
      role="alert"
      style={{
        background: "#f8d7da",
        color: "#842029",
        border: "2px solid #842029",
        borderRadius: 6,
        padding: 16,
        textAlign: "center",
      }}
    >
      <p style={{ fontWeight: 700, margin: "0 0 8px" }}>Session expired — reconnect to Onshape</p>
      <button type="button" onClick={handleReconnect}>
        Reconnect
      </button>
    </div>
  );
}
