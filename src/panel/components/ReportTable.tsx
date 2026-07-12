import type { CheckReportVerdict } from "../api.ts";

export interface ReportTableProps {
  verdicts: CheckReportVerdict[];
}

const STATUS_COLORS: Record<CheckReportVerdict["status"], { color: string; background: string }> = {
  PASS: { color: "#0f5132", background: "#d1e7dd" },
  FAIL: { color: "#842029", background: "#f8d7da" },
  UNKNOWN: { color: "#664d03", background: "#fff3cd" },
};

/** Renders the tri-state Measured cell content (D-10: never a partial/floor
 * number when UNKNOWN; a dual lb/kg figure for weight checks; a plain count
 * for non-weight checks; empty otherwise). The UNKNOWN branch shows only the
 * non-misleading literal "NOT YET CHECKABLE" -- the actual plain-language
 * reason is surfaced once, via renderReason()/the caveats-row block below,
 * never duplicated here. */
function renderMeasured(verdict: CheckReportVerdict): string {
  if (verdict.status === "UNKNOWN") {
    return "NOT YET CHECKABLE";
  }
  if (verdict.measured) {
    return `${verdict.measured.lb.toFixed(1)} lb (${verdict.measured.kg.toFixed(1)} kg)`;
  }
  if (verdict.measuredCount !== undefined) {
    return `${verdict.measuredCount} ${verdict.unit}`;
  }
  return "";
}

/** Renders the season limit + unit for EVERY row (RSLT-01/SC1) -- a clean
 * em-dash placeholder when `verdict.limit` is not a finite number, so the
 * literal string "undefined" never renders. */
function renderLimit(verdict: CheckReportVerdict): string {
  if (typeof verdict.limit === "number" && Number.isFinite(verdict.limit)) {
    return `${verdict.limit} ${verdict.unit}`;
  }
  return "—";
}

/** Renders each UNKNOWN verdict's own plain-language reason (D-04): the
 * check's own caveats[0] when present, else a defensive fallback so a row
 * never silently shows nothing. */
function renderReason(verdict: CheckReportVerdict): string {
  if (verdict.caveats.length > 0) {
    return verdict.caveats[0]!;
  }
  return `not yet checkable${verdict.affectedPartCount ? ` — ${verdict.affectedPartCount} part(s) affected` : ""}`;
}

/**
 * Renders each Verdict as a row: rule number, title, measured value, and a
 * tri-state PASS/FAIL/UNKNOWN badge -- shaped like the eventual Phase 4
 * dashboard (CONTEXT.md discretion guidance). Uses only React JSX text
 * interpolation (no dangerouslySetInnerHTML) -- values are server-controlled
 * data, not arbitrary user HTML, but this keeps the component safe by
 * construction. Kept unstyled beyond the existing inline-style badge idiom
 * per project memory ("don't style the panel until checks compute real
 * values") -- no CSS framework introduced.
 */
export function ReportTable({ verdicts }: ReportTableProps) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left" }}>Rule</th>
          <th style={{ textAlign: "left" }}>Title</th>
          <th style={{ textAlign: "left" }}>Limit</th>
          <th style={{ textAlign: "left" }}>Measured</th>
          <th style={{ textAlign: "left" }}>Verdict</th>
        </tr>
      </thead>
      <tbody>
        {verdicts.map((verdict) => {
          const badge = STATUS_COLORS[verdict.status];
          return (
            <tr key={verdict.rule}>
              <td>{verdict.rule}</td>
              <td>{verdict.title}</td>
              <td>{renderLimit(verdict)}</td>
              <td>{renderMeasured(verdict)}</td>
              <td>
                <span
                  style={{
                    color: badge.color,
                    background: badge.background,
                    borderRadius: 4,
                    padding: "2px 8px",
                    fontWeight: 600,
                  }}
                >
                  {verdict.status === "UNKNOWN" ? "NOT YET CHECKABLE" : verdict.status}
                </span>
              </td>
            </tr>
          );
        })}
        {verdicts.map((verdict) => {
          const hasOffendingParts = (verdict.affectedParts?.length ?? 0) > 0;
          const hasCaveats = verdict.caveats.length > 0;
          if (!hasOffendingParts && !hasCaveats) {
            return null;
          }
          return (
            <tr key={`${verdict.rule}-notes`}>
              <td />
              <td colSpan={4}>
                {hasOffendingParts && (
                  <div>
                    <strong>Missing material:</strong>
                    <ul>
                      {verdict.affectedParts?.map((part) => (
                        <li key={`${verdict.rule}-${part.path.join("/")}`}>{part.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {hasCaveats && (
                  <div>
                    {verdict.caveats.map((caveat, i) => (
                      <div key={caveat}>{i === 0 ? renderReason(verdict) : caveat}</div>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
