import {
  PDFDocument, StandardFonts, rgb, PDFFont, PDFPage,
  PDFName, PDFString, PDFArray,
} from "pdf-lib";
import QRCode from "qrcode";
import { getArrivalTimes, getDepartureTimes } from "@/lib/ferry";
import { priceGroupOf } from "@/lib/priceGroups";
import type { Booking, HouseSettings } from "@/types";

// ── Layout-Konstanten ─────────────────────────────────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FONT_SIZE = 10;
const SMALL_SIZE = 8.5;
const SMALL_LINE_H = 11;
const LINE_H = 12;
const TITLE_SIZE = 20;
const HEADER_SIZE = 8;
const FOOTER_SIZE = 8;
const FOOTER_ZONE_H = 46; // reservierter Platz unten für die Fußzeile
const SIGNATURE_BLOCK_H = 55;
const CHECKBOX_SIZE = 9;

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
}
function fmtEUR(n: number): string {
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
// "Sehr geehrte Familie {Nachname}" — guest_name speichert i.d.R. Vor- und
// Nachname, die Referenz-PDFs verwenden aber nur den Nachnamen nach "Familie".
function surname(guestName: string): string {
  const parts = guestName.trim().split(/\s+/);
  return parts[parts.length - 1] || guestName;
}

function dateMinusDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - days);
  return fmtDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
}

// "…unsere Ferienwohnung Nr. 2 in Haus Anne verbindlich reserviert." (Anne) bzw.
// "…die Terrassenwohnung 3 in Hus Upstalsboom verbindlich für Sie reserviert."
// (Upstalsboom) — "Anne 2"/"Upstalsboom 3" sind nur unsere internen Systemnamen,
// im Gästetext lieber die Haus-übliche Bezeichnung verwenden.
function reservationSegments(booking: Booking): Segment[] {
  const num = booking.property_id.split("-").pop() ?? "";
  const group = priceGroupOf(booking.property_id);
  const dateSegments: Segment[] = [
    { text: "wir haben für Sie in der Zeit vom " },
    { text: fmtDate(booking.check_in), bold: true },
    { text: " bis zum " },
    { text: fmtDate(booking.check_out), bold: true },
  ];
  if (group === "kamin" || group === "terrasse") {
    const typeLabel = group === "kamin" ? "Kaminwohnung" : "Terrassenwohnung";
    return [
      ...dateSegments,
      { text: ` die ${typeLabel} ${num} in Hus Upstalsboom ` },
      { text: "verbindlich für Sie reserviert.", bold: true },
    ];
  }
  return [
    ...dateSegments,
    { text: ` unsere Ferienwohnung Nr. ${num} in Haus Anne ` },
    { text: "verbindlich reserviert.", bold: true },
  ];
}

// EPC-QR-Code ("GiroCode") — von Banking-Apps direkt scanbar, füllt Empfänger/
// IBAN/Betrag/Verwendungszweck automatisch aus. Format: EPC069-12, feste
// Zeilenreihenfolge, BIC-Zeile bewusst leer (seit SEPA-Migration für
// SEPA-Länder optional).
function buildEpcQrPayload(house: HouseSettings, booking: Booking): string {
  const amount = booking.price.toFixed(2);
  const lines = [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    house.kontoinhaber.slice(0, 70),
    house.iban.replace(/\s+/g, ""),
    `EUR${amount}`,
    "",
    "",
    (booking.booking_number || "").slice(0, 140),
  ];
  return lines.join("\n");
}

// Base64 → Bytes, sowohl in Node (Testskripte) als auch im Browser lauffähig.
function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface Fonts { regular: PDFFont; bold: PDFFont }

// ── Text-Umbruch ──────────────────────────────────────────────────────────────
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Segmente mit optional fettem Teil in einer Zeile mischen, z.B.
// [{text:"wir haben ... vom "}, {text:"14.08.2026", bold:true}, {text:" bis ..."}]
interface Segment { text: string; bold?: boolean }

// Bricht gemischte (fett/normal) Segmente in Zeilen um, die jeweils maxWidth einhalten.
function wrapSegments(segments: Segment[], fonts: Fonts, size: number, maxWidth: number): Segment[][] {
  const tokens: Segment[] = [];
  segments.forEach((seg) => {
    seg.text.split(" ").forEach((w, i, arr) => {
      tokens.push({ text: i < arr.length - 1 ? `${w} ` : w, bold: seg.bold });
    });
  });
  const lines: Segment[][] = [];
  let line: Segment[] = [];
  let lineWidth = 0;
  tokens.forEach((tok) => {
    const w = (tok.bold ? fonts.bold : fonts.regular).widthOfTextAtSize(tok.text, size);
    if (lineWidth + w > maxWidth && line.length) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    line.push(tok);
    lineWidth += w;
  });
  if (line.length) lines.push(line);
  return lines;
}

// ── Cursor: verwaltet Seiten + vertikale Fließposition ────────────────────────
class Cursor {
  doc: PDFDocument;
  fonts: Fonts;
  page: PDFPage;
  y: number;

  constructor(doc: PDFDocument, fonts: Fonts, page: PDFPage) {
    this.doc = doc;
    this.fonts = fonts;
    this.page = page;
    this.y = PAGE_H - MARGIN;
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  ensureSpace(needed: number) {
    if (this.y - needed < MARGIN + FOOTER_ZONE_H) this.addPage();
  }

  gap(h: number) {
    this.y -= h;
  }

  paragraph(text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; maxWidth?: number } = {}) {
    const size = opts.size ?? FONT_SIZE;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const maxWidth = opts.maxWidth ?? CONTENT_W;
    const lines = wrapText(text, font, size, maxWidth);
    lines.forEach((line) => {
      this.ensureSpace(LINE_H);
      this.page.drawText(line, {
        x: MARGIN, y: this.y - size, size, font,
        color: opts.color ? rgb(...opts.color) : rgb(0, 0, 0),
      });
      this.y -= LINE_H;
    });
  }

  mixedParagraph(segments: Segment[], opts: { size?: number; maxWidth?: number } = {}) {
    const size = opts.size ?? FONT_SIZE;
    const maxWidth = opts.maxWidth ?? CONTENT_W;
    const lines = wrapSegments(segments, this.fonts, size, maxWidth);
    lines.forEach((line) => {
      this.ensureSpace(LINE_H);
      let x = MARGIN;
      line.forEach((seg) => {
        const font = seg.bold ? this.fonts.bold : this.fonts.regular;
        this.page.drawText(seg.text, { x, y: this.y - size, size, font, color: rgb(0, 0, 0) });
        x += font.widthOfTextAtSize(seg.text, size);
      });
      this.y -= LINE_H;
    });
  }
}

// ── Checkbox-Helfer ────────────────────────────────────────────────────────────
// Statisch gedruckt (Kästchen + optional ×), NICHT antippbar — für Werte, die wir
// bereits aus der Buchung kennen. Bewusst kein PDFCheckBox-Formularfeld: Alles
// Gedruckte ist damit eindeutig "von uns", jede spätere Änderung durch den Gast
// zwangsläufig handschriftlich/per Freihand-Stift und dadurch klar unterscheidbar.
function drawStaticCheckbox(cursor: Cursor, x: number, yTop: number, checked: boolean) {
  cursor.page.drawRectangle({
    x, y: yTop - CHECKBOX_SIZE, width: CHECKBOX_SIZE, height: CHECKBOX_SIZE,
    borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 0.75,
  });
  if (checked) {
    cursor.page.drawText("×", {
      x: x + 1.5, y: yTop - CHECKBOX_SIZE - 0.5, size: 10, font: cursor.fonts.bold, color: rgb(0, 0, 0),
    });
  }
}

let fieldCounter = 0;
// Echtes antippbares Formularfeld (leer startend) — nur für Angaben, die wir NICHT
// bereits kennen und die der Gast selbst ausfüllen/ankreuzen soll.
function drawInteractiveCheckbox(cursor: Cursor, x: number, yTop: number) {
  const form = cursor.doc.getForm();
  const field = form.createCheckBox(`cb_${fieldCounter++}`);
  field.addToPage(cursor.page, { x, y: yTop - CHECKBOX_SIZE, width: CHECKBOX_SIZE, height: CHECKBOX_SIZE });
}

function drawInteractiveTextField(cursor: Cursor, x: number, yTop: number, width: number, height = 12) {
  const form = cursor.doc.getForm();
  const field = form.createTextField(`tf_${fieldCounter++}`);
  // addToPage() erzeugt zuerst das Widget (inkl. eines Standard-/DA-Eintrags) —
  // erst DANACH kann setFontSize() sicher darauf aufbauen (sonst MissingDAEntryError).
  field.addToPage(cursor.page, { x, y: yTop - height, width, height, borderWidth: 0, font: cursor.fonts.regular });
  field.setFontSize(FONT_SIZE);
  return field;
}

// Sichtbarer Linktext + echte klickbare Link-Annotation (pdf-lib bietet dafür
// keine High-Level-API, daher direkt eine /Annots-Annotation vom Typ Link).
function drawLink(cursor: Cursor, text: string, url: string, x: number, yTop: number, size = FONT_SIZE) {
  cursor.page.drawText(text, { x, y: yTop - size, size, font: cursor.fonts.regular, color: rgb(0.1, 0.3, 0.75) });
  const width = cursor.fonts.regular.widthOfTextAtSize(text, size);
  const rect = [x, yTop - size - 2, x + width, yTop + 1];
  const linkAnnot = cursor.doc.context.register(
    cursor.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: rect,
      Border: [0, 0, 0],
      A: cursor.doc.context.obj({ Type: "Action", S: "URI", URI: PDFString.of(url) }),
    }),
  );
  const existing = cursor.page.node.lookup(PDFName.of("Annots"), PDFArray);
  if (existing) existing.push(linkAnnot);
  else cursor.page.node.set(PDFName.of("Annots"), cursor.doc.context.obj([linkAnnot]));
  return width;
}

// ── Preis-Posten ───────────────────────────────────────────────────────────────
function priceLines(booking: Booking): { label: string; amount: string }[] {
  const bd = booking.priceBreakdown;
  if (!bd) return [{ label: "Gesamtpreis", amount: fmtEUR(booking.price) }];

  const lines: { label: string; amount: string }[] = [];
  // Nächte nach Preis gruppieren (Reihenfolge = erstes Vorkommen), damit
  // Saisonwechsel innerhalb der Buchung als eigene Zeile erscheinen.
  const groups: { price: number; count: number }[] = [];
  bd.nights.forEach((n) => {
    const g = groups.find((x) => x.price === n.price);
    if (g) g.count++; else groups.push({ price: n.price, count: 1 });
  });
  groups.forEach((g) => {
    lines.push({ label: "Preis pro Übernachtung", amount: `${fmtEUR(g.price)} x ${g.count} = ${fmtEUR(g.price * g.count)}` });
  });
  bd.extraFees.forEach((f) => lines.push({ label: f.label, amount: fmtEUR(f.amount) }));
  if (bd.cleaningFee > 0) lines.push({ label: "Endreinigung", amount: fmtEUR(bd.cleaningFee) });
  if (bd.dogFee > 0) lines.push({ label: `Hundegebühr (${booking.dogCount} Hund${booking.dogCount === 1 ? "" : "e"})`, amount: fmtEUR(bd.dogFee) });
  return lines;
}

// ── Hauptfunktion ────────────────────────────────────────────────────────────
export interface GenerateOptions {
  includeNewsletter: boolean;
}

export async function generateConfirmationPdf(
  booking: Booking,
  house: HouseSettings,
  logoBytes: Uint8Array | ArrayBuffer | null,
  options: GenerateOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  fieldCounter = 0;

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const cursor = new Cursor(doc, fonts, page);

  // Logo einbetten (Bytes werden vom Aufrufer geladen — hier kein Laufzeit-Fetch/
  // Vite-Asset-Import, damit diese Funktion auch außerhalb des Browsers, z.B. in
  // einem Node-Testskript, ohne Anpassung nutzbar ist).
  let logoDims: { width: number; height: number } | null = null;
  let logoImage: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  if (logoBytes) {
    try {
      logoImage = await doc.embedPng(logoBytes);
      const maxLogoW = 170;
      const scale = maxLogoW / logoImage.width;
      logoDims = { width: maxLogoW, height: logoImage.height * scale };
    } catch {
      logoDims = null; // Logo optional — Fehler blockiert die PDF-Erzeugung nicht
    }
  }

  // QR-Code für die Überweisung (GiroCode/EPC) erzeugen und einbetten.
  let qrImage: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  try {
    const qrDataUrl = await QRCode.toDataURL(buildEpcQrPayload(house, booking), { margin: 1, width: 300 });
    const qrBase64 = qrDataUrl.split(",")[1] ?? "";
    qrImage = await doc.embedPng(base64ToBytes(qrBase64));
  } catch {
    qrImage = null; // QR-Code optional — Fehler blockiert die PDF-Erzeugung nicht
  }

  // 1. Kopfzeile
  cursor.page.drawText(`${house.name}, ${house.address}`, {
    x: MARGIN, y: cursor.y - HEADER_SIZE, size: HEADER_SIZE, font: fonts.regular, color: rgb(0.4, 0.4, 0.4),
  });
  cursor.y -= HEADER_SIZE + 10;

  // 2. Titelblock + Logo oben rechts
  const titleTop = cursor.y;
  cursor.page.drawText("Buchungsbestätigung", { x: MARGIN, y: cursor.y - TITLE_SIZE, size: TITLE_SIZE, font: fonts.bold });
  cursor.y -= TITLE_SIZE + 10;
  cursor.mixedParagraph([{ text: "Buchungsnummer: " }, { text: booking.booking_number || "–", bold: true }]);
  if (logoImage && logoDims) {
    cursor.page.drawImage(logoImage, {
      x: PAGE_W - MARGIN - logoDims.width, y: titleTop - logoDims.height,
      width: logoDims.width, height: logoDims.height,
    });
  }
  cursor.gap(LINE_H * 2);

  // 3+4. Anrede + Zeitraum-Satz — laufen links neben dem Logo (schmalere Spalte),
  // damit kein unnötig großer Leerraum unter dem Logo entsteht.
  const logoBottom = logoDims ? titleTop - logoDims.height : null;
  const besideLogoW = logoDims ? CONTENT_W - logoDims.width - 16 : CONTENT_W;
  cursor.paragraph(`Sehr geehrte Familie ${surname(booking.guest_name)}`, { maxWidth: besideLogoW });
  cursor.gap(4);
  cursor.mixedParagraph(reservationSegments(booking), { maxWidth: besideLogoW });
  // Falls das Logo tiefer reicht als der Text daneben, erst ab Logo-Unterkante weitermachen.
  if (logoBottom !== null) cursor.y = Math.min(cursor.y, logoBottom - 10);
  cursor.gap(4);

  // 5. Rücksendehinweis
  cursor.mixedParagraph([{ text: "Rücksendung des unterschriebenen Dokuments bitte an: " }, { text: house.contactEmail, bold: true }]);
  cursor.gap(4);

  // 6. Gesamtpreis + Preis-Posten (bei manuellem Preis ohne Aufschlüsselung: nur der Satz)
  if (booking.priceBreakdown) {
    cursor.mixedParagraph([{ text: "Der Gesamtpreis beträgt " }, { text: fmtEUR(booking.price), bold: true }, { text: " und setzt sich wie folgt zusammen:" }]);
    cursor.gap(4);
    const lines = priceLines(booking);
    lines.forEach(({ label, amount }) => {
      cursor.ensureSpace(SMALL_LINE_H);
      cursor.page.drawText(`${label}:`, { x: MARGIN, y: cursor.y - SMALL_SIZE, size: SMALL_SIZE, font: fonts.regular, color: rgb(0.3, 0.3, 0.3) });
      cursor.page.drawText(amount, { x: MARGIN + 260, y: cursor.y - SMALL_SIZE, size: SMALL_SIZE, font: fonts.regular, color: rgb(0.3, 0.3, 0.3) });
      cursor.y -= SMALL_LINE_H;
    });
  } else {
    cursor.mixedParagraph([{ text: "Der Gesamtpreis beträgt " }, { text: `${fmtEUR(booking.price)}.`, bold: true }]);
  }
  // Größerer Absatz — danach beginnt ein neuer Bereich (Gästeinfos).
  cursor.gap(16);

  // 7. Kundendaten-Block
  cursor.ensureSpace(LINE_H + 4);
  {
    const label = "Ihre Anschrift:";
    cursor.page.drawText(label, { x: MARGIN, y: cursor.y - FONT_SIZE, size: FONT_SIZE, font: fonts.regular });
    const labelW = fonts.regular.widthOfTextAtSize(label, FONT_SIZE);
    const fieldX = MARGIN + labelW + 6;
    drawInteractiveTextField(cursor, fieldX, cursor.y, CONTENT_W - labelW - 6, 13);
    cursor.page.drawLine({
      start: { x: fieldX, y: cursor.y - 14 }, end: { x: PAGE_W - MARGIN, y: cursor.y - 14 },
      thickness: 0.5, color: rgb(0.5, 0.5, 0.5),
    });
    cursor.y -= LINE_H;
  }
  cursor.gap(4);
  cursor.paragraph(`Telefonnummer: ${booking.phone || ""}`);
  if (!booking.email) {
    cursor.ensureSpace(LINE_H + 4);
    const label = "E-Mail:";
    cursor.page.drawText(label, { x: MARGIN, y: cursor.y - FONT_SIZE, size: FONT_SIZE, font: fonts.regular });
    const labelW = fonts.regular.widthOfTextAtSize(label, FONT_SIZE);
    const fieldX = MARGIN + labelW + 6;
    drawInteractiveTextField(cursor, fieldX, cursor.y, 220, 13);
    cursor.page.drawLine({
      start: { x: fieldX, y: cursor.y - 14 }, end: { x: fieldX + 220, y: cursor.y - 14 },
      thickness: 0.5, color: rgb(0.5, 0.5, 0.5),
    });
    cursor.y -= LINE_H;
  } else {
    cursor.paragraph(`E-Mail: ${booking.email}`);
  }
  cursor.gap(4);
  cursor.paragraph(`Anreisende Personen: ${booking.adults + booking.children}    Erwachsene: ${booking.adults}    Kinder: ${booking.children}`);
  cursor.paragraph(`Anzahl Hunde: ${booking.dogCount}`);
  cursor.gap(4);
  cursor.paragraph("Besondere Wünsche:", { bold: true });
  cursor.gap(4);
  {
    const items: { label: string; checked: boolean }[] = [
      { label: "Kinderbett", checked: booking.kinderbett },
      { label: "Rausfallschutz", checked: booking.rausfallschutz },
      { label: "Kinderstuhl", checked: booking.kinderstuhl },
    ];
    cursor.ensureSpace(CHECKBOX_SIZE + 4);
    const colW = CONTENT_W / 3;
    items.forEach((item, i) => {
      const x = MARGIN + i * colW;
      drawStaticCheckbox(cursor, x, cursor.y, item.checked);
      cursor.page.drawText(item.label, {
        x: x + CHECKBOX_SIZE + 5, y: cursor.y - CHECKBOX_SIZE + 1, size: FONT_SIZE, font: fonts.regular,
      });
    });
    cursor.y -= CHECKBOX_SIZE + 5;
  }
  {
    const label = "Sonstiges:";
    cursor.ensureSpace(LINE_H + 4);
    cursor.page.drawText(label, { x: MARGIN, y: cursor.y - FONT_SIZE, size: FONT_SIZE, font: fonts.regular });
    const labelW = fonts.regular.widthOfTextAtSize(label, FONT_SIZE);
    const fieldX = MARGIN + labelW + 6;
    drawInteractiveTextField(cursor, fieldX, cursor.y, CONTENT_W - labelW - 6, 13);
    cursor.page.drawLine({
      start: { x: fieldX, y: cursor.y - 14 }, end: { x: PAGE_W - MARGIN, y: cursor.y - 14 },
      thickness: 0.5, color: rgb(0.5, 0.5, 0.5),
    });
    cursor.y -= LINE_H;
  }
  // Größerer Absatz — Gästeinfos sind abgeschlossen, danach kommen die Stornobedingungen.
  cursor.gap(16);

  // 8. Storno + Reiserücktrittsversicherung (nur die 3 Stichpunkte kleiner — Kleingedrucktes)
  cursor.paragraph(
    "Sollten Sie aus Gründen, die der Vermieter nicht verschuldet hat, Ihre Buchung zurückziehen oder vorzeitig abreisen, berechnen wir:",
  );
  cursor.gap(2);
  house.stornoText.forEach((line) => {
    cursor.ensureSpace(SMALL_LINE_H);
    cursor.page.drawText("•", { x: MARGIN, y: cursor.y - SMALL_SIZE, size: SMALL_SIZE, font: fonts.regular });
    const wrapped = wrapText(line, fonts.regular, SMALL_SIZE, CONTENT_W - 14);
    wrapped.forEach((wline, i) => {
      if (i > 0) cursor.ensureSpace(SMALL_LINE_H);
      cursor.page.drawText(wline, { x: MARGIN + 14, y: cursor.y - SMALL_SIZE, size: SMALL_SIZE, font: fonts.regular });
      cursor.y -= SMALL_LINE_H;
    });
  });
  cursor.gap(4);
  cursor.mixedParagraph([{ text: "Wir empfehlen Ihnen, eine " }, { text: "Reiserücktrittsversicherung", bold: true }, { text: " abzuschließen." }]);
  cursor.gap(8);

  // 9. Überweisung: Hinweistext, dann Kontodaten (eingerückt) | Hinweis | QR-Code
  cursor.mixedParagraph([
    { text: "Bitte überweisen Sie den Gesamtbetrag bis mind. 14 Tage vor Ihrer Ankunft (" },
    { text: dateMinusDays(booking.check_in, 14), bold: true },
    { text: ") auf folgendes Konto:" },
  ]);
  cursor.gap(8);
  {
    const qrSize = 85;
    const qrX = PAGE_W - MARGIN - qrSize;
    const captionW = 90;
    const captionGap = 12;
    const captionX = qrX - captionGap - captionW;
    const bankIndent = 12;
    const bankX = MARGIN + bankIndent;

    const bankLines = [
      house.kontoinhaber,
      `IBAN ${house.iban}`,
      house.bank,
      `Verwendungszweck: ${booking.booking_number || "–"}`,
      `Betrag: ${fmtEUR(booking.price)}`,
    ];
    const bankBlockH = bankLines.length * LINE_H;
    const captionLines = wrapText("Mit der Banking-App scannen zum Überweisen", fonts.regular, SMALL_SIZE, captionW);
    const captionH = captionLines.length * (SMALL_SIZE + 2);

    cursor.ensureSpace(Math.max(bankBlockH, qrSize, captionH));
    const rowTop = cursor.y;
    const rowH = qrSize; // QR-Code ist das höchste Element der Zeile

    // Kontodaten-Block: vertikal mittig zur QR-Code-Höhe ausgerichtet.
    let by = rowTop - (rowH - bankBlockH) / 2;
    bankLines.forEach((line) => {
      cursor.page.drawText(line, { x: bankX, y: by - FONT_SIZE, size: FONT_SIZE, font: fonts.bold });
      by -= LINE_H;
    });

    // Hinweistext links neben dem QR-Code, ebenfalls vertikal mittig.
    let cy = rowTop - (rowH - captionH) / 2;
    captionLines.forEach((line) => {
      cursor.page.drawText(line, { x: captionX, y: cy - SMALL_SIZE, size: SMALL_SIZE, font: fonts.regular, color: rgb(0.45, 0.45, 0.45) });
      cy -= SMALL_SIZE + 2;
    });

    if (qrImage) {
      cursor.page.drawImage(qrImage, { x: qrX, y: rowTop - qrSize, width: qrSize, height: qrSize });
    }
    cursor.y = rowTop - rowH;
  }
  // Kleiner Absatz nach dem Überweisungsblock.
  cursor.gap(8);

  // 10. Check-in/-out
  cursor.mixedParagraph([
    { text: "Die Wohnung ist am Anreisetag frühestens ab " },
    { text: `${house.checkInTime} Uhr`, bold: true },
    { text: " bezugsfertig und am Abreisetag bis spätestens " },
    { text: `${house.checkOutTime} Uhr`, bold: true },
    { text: " besenrein zu übergeben." },
  ]);
  cursor.gap(4);

  // 11. Kurkarten-Hinweis
  cursor.ensureSpace(LINE_H);
  {
    const pre = "Bitte denken Sie an Ihre Kurkarten (";
    cursor.page.drawText(pre, { x: MARGIN, y: cursor.y - FONT_SIZE, size: FONT_SIZE, font: fonts.regular });
    const preW = fonts.regular.widthOfTextAtSize(pre, FONT_SIZE);
    const linkW = drawLink(cursor, "www.baltrum.de", "https://www.baltrum.de", MARGIN + preW, cursor.y);
    cursor.page.drawText(").", { x: MARGIN + preW + linkW, y: cursor.y - FONT_SIZE, size: FONT_SIZE, font: fonts.regular });
    cursor.y -= LINE_H;
  }
  cursor.mixedParagraph([{ text: "Bei Vermieter bitte nach „" }, { text: house.kurtaxeSuchname, bold: true }, { text: "“ suchen." }]);
  cursor.gap(8);

  // 12. Fährzeiten, zweispaltig
  {
    const colW = CONTENT_W / 2 - 10;
    const leftX = MARGIN;
    const rightX = MARGIN + CONTENT_W / 2 + 10;

    const arrivalTimes = getArrivalTimes(booking.check_in);
    const departureTimes = getDepartureTimes(booking.check_out);
    const arrivalKnown = !!booking.ferry_time && arrivalTimes.includes(booking.ferry_time);
    const departureKnown = !!booking.ferry_time_departure && departureTimes.includes(booking.ferry_time_departure);

    const rows = Math.max(arrivalTimes.length, departureTimes.length) + 1; // +1 für "Andere Zeit"
    // Überschrift + Tabelle als Ganzes reservieren, damit weder die Tabelle
    // mitten drin umbricht noch die Überschrift ohne Tabelle allein zurückbleibt.
    cursor.ensureSpace(LINE_H * (rows + 2));

    cursor.page.drawText("Fährzeiten (bitte ankreuzen oder eigene Zeit angeben):", { x: MARGIN, y: cursor.y - FONT_SIZE, size: FONT_SIZE, font: fonts.bold });
    cursor.y -= LINE_H + 4;

    cursor.page.drawText("Anreise:", { x: leftX, y: cursor.y - FONT_SIZE, size: FONT_SIZE, font: fonts.bold });
    cursor.page.drawText("Abreise:", { x: rightX, y: cursor.y - FONT_SIZE, size: FONT_SIZE, font: fonts.bold });
    cursor.y -= LINE_H;

    for (let i = 0; i < rows; i++) {
      const rowY = cursor.y;
      // Anreise-Spalte
      if (i < arrivalTimes.length) {
        const time = arrivalTimes[i];
        if (arrivalKnown) drawStaticCheckbox(cursor, leftX, rowY, time === booking.ferry_time);
        else drawInteractiveCheckbox(cursor, leftX, rowY);
        cursor.page.drawText(`${time} Uhr`, { x: leftX + CHECKBOX_SIZE + 5, y: rowY - CHECKBOX_SIZE + 1, size: FONT_SIZE, font: fonts.regular });
      } else if (i === arrivalTimes.length && !arrivalKnown) {
        cursor.page.drawText("Andere Zeit:", { x: leftX, y: rowY - FONT_SIZE, size: FONT_SIZE, font: fonts.regular });
        drawInteractiveTextField(cursor, leftX + 62, rowY, colW - 62, 13);
      }
      // Abreise-Spalte
      if (i < departureTimes.length) {
        const time = departureTimes[i];
        if (departureKnown) drawStaticCheckbox(cursor, rightX, rowY, time === booking.ferry_time_departure);
        else drawInteractiveCheckbox(cursor, rightX, rowY);
        cursor.page.drawText(`${time} Uhr`, { x: rightX + CHECKBOX_SIZE + 5, y: rowY - CHECKBOX_SIZE + 1, size: FONT_SIZE, font: fonts.regular });
      } else if (i === departureTimes.length && !departureKnown) {
        cursor.page.drawText("Andere Zeit:", { x: rightX, y: rowY - FONT_SIZE, size: FONT_SIZE, font: fonts.regular });
        drawInteractiveTextField(cursor, rightX + 62, rowY, colW - 62, 13);
      }
      cursor.y -= LINE_H;
    }
  }
  // Größerer Absatz vor der Grußmail-Frage.
  cursor.gap(14);

  // 13. Newsletter-Opt-in
  if (options.includeNewsletter) {
    cursor.ensureSpace(LINE_H * 2);
    const rowY = cursor.y;
    drawInteractiveCheckbox(cursor, MARGIN, rowY);
    const text = `Ja, ich freue mich 1–2 Mal im Jahr über eine kleine Grußmail von ${house.name} – als Erinnerung an die Insel und rechtzeitigen Buchungshinweis.`;
    const wrapped = wrapText(text, fonts.regular, FONT_SIZE, CONTENT_W - (CHECKBOX_SIZE + 5));
    wrapped.forEach((line, i) => {
      if (i > 0) cursor.ensureSpace(LINE_H);
      cursor.page.drawText(line, { x: MARGIN + CHECKBOX_SIZE + 5, y: cursor.y - FONT_SIZE, size: FONT_SIZE, font: fonts.regular });
      cursor.y -= LINE_H;
    });
    cursor.gap(16);
  }

  // 14. Abschiedssatz
  cursor.paragraph("Schon heute wünschen wir Ihnen eine gute Anreise und einen schönen Aufenthalt auf Baltrum.");

  // 15. Unterschriftsblock — kleiner fester Abstand (~3 Zeilen), sonst neue Seite
  const footerTopLimit = MARGIN + FOOTER_ZONE_H;
  const remaining = cursor.y - footerTopLimit;
  const signatureGap = LINE_H * 3;
  if (remaining < signatureGap + SIGNATURE_BLOCK_H) {
    cursor.addPage();
  } else {
    cursor.gap(signatureGap);
  }
  {
    const lineY = cursor.y - 30;
    const colW = CONTENT_W / 2 - 20;
    cursor.page.drawLine({ start: { x: MARGIN, y: lineY }, end: { x: MARGIN + colW, y: lineY }, thickness: 0.75, color: rgb(0, 0, 0) });
    cursor.page.drawLine({ start: { x: MARGIN + CONTENT_W / 2 + 20, y: lineY }, end: { x: PAGE_W - MARGIN, y: lineY }, thickness: 0.75, color: rgb(0, 0, 0) });
    cursor.page.drawText("Datum, Ort", { x: MARGIN, y: lineY - 12, size: FONT_SIZE, font: fonts.bold });
    cursor.page.drawText("Unterschrift", { x: MARGIN + CONTENT_W / 2 + 20, y: lineY - 12, size: FONT_SIZE, font: fonts.bold });
    cursor.y = lineY - 12;
  }

  // 16. Fußzeile auf jeder Seite
  const footerLines = [
    `${house.footerName}, ${house.name}, ${house.address}`,
    `${house.phone} · ${house.contactEmail}`,
    house.website,
  ];
  doc.getPages().forEach((p) => {
    let fy = MARGIN + FOOTER_SIZE * 2 + 4;
    footerLines.forEach((line) => {
      const w = fonts.regular.widthOfTextAtSize(line, FOOTER_SIZE);
      p.drawText(line, { x: (PAGE_W - w) / 2, y: fy, size: FOOTER_SIZE, font: fonts.regular, color: rgb(0.45, 0.45, 0.45) });
      fy -= FOOTER_SIZE + 3;
    });
  });

  // Erzeugt die Erscheinungsbild-Streams für alle Formularfelder (Text + Checkbox).
  // Ohne diesen Aufruf fehlt manchen Feldern das /DA-Eintrag und pdf-lib wirft beim
  // Speichern "No /DA (default appearance) entry found".
  doc.getForm().updateFieldAppearances(fonts.regular);

  return doc.save();
}
