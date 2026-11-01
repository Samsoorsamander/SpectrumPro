import React, { forwardRef } from "react";

/** Inline styles for print/PDF — spreadsheet / ledger book look, white page. */
export const book = {
  wrap: {
    width: "210mm",
    minHeight: "297mm",
    boxSizing: "border-box" as const,
    padding: "12mm 11mm",
    backgroundColor: "#ffffff",
    color: "#111827",
    fontFamily:
      'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: "9px",
    lineHeight: 1.45,
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "14px",
    borderBottom: "2px solid #111827",
    paddingBottom: "8px",
    marginBottom: "12px",
  },
  company: {
    fontSize: "11px",
    fontWeight: 700 as const,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    margin: 0,
  },
  tag: { fontSize: "7px", color: "#6b7280", marginTop: "3px", letterSpacing: "0.04em" },
  metaRight: {
    textAlign: "right" as const,
    fontSize: "8px",
    color: "#374151",
    lineHeight: 1.55,
  },
  h1: {
    fontSize: "11px",
    fontWeight: 700 as const,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    textAlign: "center" as const,
    margin: "0 0 10px 0",
    padding: "7px 8px",
    backgroundColor: "#f3f4f6",
    border: "1px solid #9ca3af",
    color: "#111827",
  },
  table: { width: "100%", borderCollapse: "collapse" as const, marginBottom: "12px" },
  th: {
    border: "1px solid #6b7280",
    backgroundColor: "#e5e7eb",
    color: "#111827",
    fontWeight: 700 as const,
    fontSize: "7px",
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    textAlign: "left" as const,
    padding: "5px 6px",
  },
  thRight: { textAlign: "right" as const },
  thCenter: { textAlign: "center" as const },
  td: {
    border: "1px solid #d1d5db",
    padding: "4px 6px",
    fontSize: "8px",
    color: "#1f2937",
    verticalAlign: "top" as const,
  },
  tdRight: {
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums" as const,
  },
  tdCenter: { textAlign: "center" as const },
  sectionLabel: {
    fontSize: "8px",
    fontWeight: 700 as const,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#374151",
    margin: "14px 0 6px 0",
    paddingBottom: "4px",
    borderBottom: "1px solid #d1d5db",
  },
  footer: {
    marginTop: "14px",
    paddingTop: "8px",
    borderTop: "1px solid #d1d5db",
    fontSize: "7px",
    color: "#9ca3af",
    textAlign: "center" as const,
  },
  summaryRow: {
    border: "1px solid #d1d5db",
    padding: "5px 8px",
    fontSize: "8px",
    display: "flex" as const,
    justifyContent: "space-between" as const,
    backgroundColor: "#fafafa",
  },
};

export type SimpleBookReportPageProps = {
  companyName: string;
  logoSrc?: string | null;
  reportTitle: string;
  periodLine: string;
  generatedLine?: string;
  /** When false, omit `print-container` (e.g. voucher PDF only — avoids duplicate print roots). */
  printable?: boolean;
  children: React.ReactNode;
};

/** Root node uses `print-container` when printable (browser print + PDF). */
export const SimpleBookReportPage = forwardRef<HTMLDivElement, SimpleBookReportPageProps>(
  function SimpleBookReportPage(
    {
      companyName,
      logoSrc,
      reportTitle,
      periodLine,
      generatedLine,
      printable = true,
      children,
    },
    ref
  ) {
    return (
      <div
        ref={ref}
        className={printable ? "print-container" : undefined}
        style={book.wrap}
      >
        <div style={book.topRow}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            {logoSrc ? (
              <img
                src={logoSrc}
                alt=""
                style={{ width: 42, height: 42, objectFit: "contain" }}
              />
            ) : null}
            <div>
              <p style={book.company}>{companyName}</p>
              <p style={book.tag}>Internal business report</p>
            </div>
          </div>
          <div style={book.metaRight}>
            <div>{periodLine}</div>
            <div>{generatedLine ?? `Generated: ${new Date().toLocaleString()}`}</div>
          </div>
        </div>
        <h1 style={book.h1}>{reportTitle}</h1>
        {children}
        <p style={book.footer}>Spectrum Pro · For office records only.</p>
      </div>
    );
  }
);
