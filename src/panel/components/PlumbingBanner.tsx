/**
 * Explicit "plumbing proof" banner (CONTEXT.md discretion guidance):
 * Phase 1's two checks prove the integration chain works end-to-end -- they
 * do NOT prove any individual check's correctness. This banner keeps the
 * Walking Skeleton's UI from overclaiming (Threat T-01-14, disposition
 * "accept by design").
 */
export function PlumbingBanner() {
  return (
    <div
      role="status"
      style={{
        background: "#fff3cd",
        color: "#664d03",
        border: "1px solid #ffecb5",
        borderRadius: 4,
        padding: "8px 12px",
        marginBottom: 12,
        fontWeight: 600,
      }}
    >
      Plumbing proof — verdicts not yet trusted
    </div>
  );
}
