import { createPortal } from "react-dom";

/**
 * Renders printable report roots under #print-mount (sibling of #root) so @media print
 * can hide the app and show only the voucher. Avoids WebView/Electron bugs with
 * visibility:hidden on ancestors of .print-container.
 */
export default function PrintMountPortal({
  children,
}: {
  children: React.ReactNode;
}) {
  if (typeof document === "undefined") return null;
  const el = document.getElementById("print-mount");
  if (!el) return null;
  return createPortal(
    <div className="spectrum-offscreen-print-source">{children}</div>,
    el
  );
}
