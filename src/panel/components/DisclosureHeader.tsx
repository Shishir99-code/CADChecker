import type { CheckReportContext } from "../api.ts";

export interface DisclosureHeaderProps {
  context: CheckReportContext;
}

/**
 * The "measured against" disclosure block (RSLT-03, SC3): states the
 * document, tab/element, configuration, and timestamp every verdict below it
 * reflects -- with human-readable names, not raw id hashes -- so a mentor can
 * tell at a glance whether a result is stale. Rendered as a sibling of
 * <ReportTable> inside main.tsx's atomic "report" branch (SC4/D-03): header
 * and verdicts always mount together on every check/re-check, so an old-
 * geometry/new-timestamp mismatch is structurally impossible.
 *
 * Uses only inline `style={{...}}` objects (D-05, no CSS framework) --
 * matches the idiom already established by ReportTable.tsx/ReconnectState.tsx.
 * All values are rendered via plain React JSX text interpolation
 * (auto-escaped) -- never dangerouslySetInnerHTML (T-04-05).
 */
export function DisclosureHeader({ context }: DisclosureHeaderProps) {
  const documentLabel = context.documentName ?? context.documentId;
  const tabLabel = context.tabName ?? context.elementId;
  const checkedAtLabel = new Date(context.checkedAt).toLocaleString();

  return (
    <div
      style={{
        background: "#f8f9fa",
        border: "1px solid #dee2e6",
        borderRadius: 6,
        padding: "8px 12px",
        marginBottom: 12,
        fontSize: 14,
        color: "#495057",
      }}
    >
      <strong>Measured against:</strong>{" "}
      Document: {documentLabel} · Tab: {tabLabel} · Configuration: {context.configurationName} · Checked at:{" "}
      {checkedAtLabel}
    </div>
  );
}
