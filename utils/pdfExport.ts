import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Captures a DOM node to a multi-page A4 PDF. Temporarily moves the node on-screen
 * so html2canvas paints correctly (off-screen / -9999px often yields blank output in WebView).
 */
export async function exportElementToPdf(
  element: HTMLElement,
  fileName: string,
  options?: { scale?: number; backgroundColor?: string }
): Promise<void> {
  const scale = options?.scale ?? 2;
  const bg = options?.backgroundColor ?? "#ffffff";

  const backup = {
    position: element.style.position,
    left: element.style.left,
    top: element.style.top,
    zIndex: element.style.zIndex,
    opacity: element.style.opacity,
    pointerEvents: element.style.pointerEvents,
    width: element.style.width,
    maxWidth: element.style.maxWidth,
    visibility: element.style.visibility,
    height: element.style.height,
    overflow: element.style.overflow,
    transform: element.style.transform,
    backgroundColor: element.style.backgroundColor,
  };

  const w = Math.max(794, element.scrollWidth, element.offsetWidth || 0);

  element.style.position = "fixed";
  element.style.left = "0";
  element.style.top = "0";
  element.style.zIndex = "2147483646";
  element.style.opacity = "1";
  element.style.pointerEvents = "none";
  element.style.width = `${w}px`;
  element.style.maxWidth = `${w}px`;
  element.style.visibility = "visible";
  element.style.height = "auto";
  element.style.overflow = "visible";
  element.style.transform = "none";
  element.style.backgroundColor = bg;

  await document.fonts.ready.catch(() => {});
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );

  try {
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: bg,
      logging: false,
      width: w,
      height: element.scrollHeight,
      windowWidth: w,
      windowHeight: element.scrollHeight,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF({
      unit: "mm",
      format: "a4",
      orientation: "portrait",
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let remaining = imgHeight;
    let y = 0;
    pdf.addImage(imgData, "JPEG", 0, y, imgWidth, imgHeight);
    remaining -= pageHeight;

    while (remaining > 2) {
      y = remaining - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, y, imgWidth, imgHeight);
      remaining -= pageHeight;
    }

    const name = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
    pdf.save(name);
  } finally {
    Object.assign(element.style, backup);
  }
}
