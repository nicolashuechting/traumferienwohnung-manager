import { PDFDocument } from "pdf-lib";

const MAX_DIMENSION = 2000; // px — reicht für gute Lesbarkeit, hält die Datei klein
const JPEG_QUALITY = 0.8;
const MAX_PAGE_WIDTH = 1000; // pt

// Wandelt eine hochgeladene Datei in PDF-Bytes um: PDFs bleiben unverändert,
// Fotos/Bilder werden verkleinert, komprimiert und in eine einzelne PDF-Seite
// eingebettet. Andere Formate (Word etc.) werden abgelehnt.
export async function fileToPdfBytes(file: File): Promise<Uint8Array> {
  if (file.type === "application/pdf") {
    return new Uint8Array(await file.arrayBuffer());
  }
  if (file.type.startsWith("image/")) {
    return imageFileToPdfBytes(file);
  }
  throw new Error("Nicht unterstütztes Format – bitte als PDF oder Foto (JPG/PNG) hochladen.");
}

async function imageFileToPdfBytes(file: File): Promise<Uint8Array> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Bild konnte nicht gelesen werden (z.B. HEIC wird von manchen Browsern nicht unterstützt) – bitte als JPG/PNG oder PDF hochladen.");
  }
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bild konnte nicht verarbeitet werden.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const jpegBlob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht komprimiert werden."))), "image/jpeg", JPEG_QUALITY),
  );
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

  const pdfDoc = await PDFDocument.create();
  const jpgImage = await pdfDoc.embedJpg(jpegBytes);
  const pageW = Math.min(w, MAX_PAGE_WIDTH);
  const pageH = pageW * (h / w);
  const page = pdfDoc.addPage([pageW, pageH]);
  page.drawImage(jpgImage, { x: 0, y: 0, width: pageW, height: pageH });
  return pdfDoc.save();
}
