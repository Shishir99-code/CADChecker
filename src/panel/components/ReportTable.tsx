import type { CheckReportVerdict } from "../api.ts";

export interface ReportTableProps {
  verdicts: CheckReportVerdict[];
}

/**
 * Renders each Verdict as a row: rule number, title, measured value, and a
 * pass/fail badge -- shaped like the eventual Phase 4 dashboard
 * (CONTEXT.md discretion guidance). Uses only React JSX text interpolation
 * (no dangerouslySetInnerHTML) -- values are server-controlled data, not
 * arbitrary user HTML, but this keeps the component safe by construction.
 */
export function ReportTable({ verdicts }: ReportTableProps) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left" }}>Rule</th>
          <th style={{ textAlign: "left" }}>Title</th>
          <th style={{ textAlign: "left" }}>Measured</th>
          <th style={{ textAlign: "left" }}>Verdict</th>
        </tr>
      </thead>
      <tbody>
        {verdicts.map((verdict) => (
          <tr key={verdict.rule}>
            <td>{verdict.rule}</td>
            <td>{verdict.title}</td>
            <td>
              {verdict.measured} {verdict.unit}
            </td>
            <td>
              <span
                style={{
                  color: verdict.pass ? "#0f5132" : "#842029",
                  background: verdict.pass ? "#d1e7dd" : "#f8d7da",
                  borderRadius: 4,
                  padding: "2px 8px",
                  fontWeight: 600,
                }}
              >
                {verdict.pass ? "PASS" : "FAIL"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
