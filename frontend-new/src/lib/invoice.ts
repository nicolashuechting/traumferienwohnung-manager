import { doc, runTransaction, serverTimestamp, addDoc, collection } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, listAll, getMetadata } from "firebase/storage";
import { db, storage, auth } from "@/lib/firebase";
import { houseIdOf } from "@/lib/properties";
import { computeVat } from "@/lib/pdfConfirmation";
import type { Booking, BookingInvoice, HouseId } from "@/types";

// ── Rechnungsnummern ──────────────────────────────────────────────────────────
// Format AN-JJJJ-0001 (Haus Anne) bzw. UB-JJJJ-0001 (Hus Upstalsboom), JJJJ = Anreisejahr.
// Fortlaufend je Haus und Jahr über einen zentralen Zähler in Firestore, der per
// Transaktion hochgezählt wird — so bekommen auch zwei gleichzeitig erstellte Rechnungen
// garantiert verschiedene Nummern. Der Zähler liegt im Dokument der Haus-Konfiguration
// (houseSettings/{haus}.invoiceCounters → { "AN-2027": 41 }), weil die Sicherheitsregeln
// dort Schreibzugriff erlauben (eine eigene Collection wäre ohne Regel-Änderung gesperrt).
//
// Lokal (npm run dev) wird alles mit "TEST-" vorangestellt und in eigenen Ordnern
// abgelegt, damit Tests die echten Nummernreihen nicht verbrauchen.
export const INVOICE_TEST_MODE = import.meta.env.DEV;
const TEST_PREFIX = INVOICE_TEST_MODE ? "TEST-" : "";

export { houseIdOf };

function seriesOf(propertyId: string, checkIn: string): string {
  const prefix = houseIdOf(propertyId) === "haus-anne" ? "AN" : "UB";
  const year = Number((checkIn || "").slice(0, 4));
  if (!(year >= 2000 && year <= 2100)) throw new Error("Anreisedatum fehlt – Rechnungsnummer kann nicht vergeben werden.");
  return `${TEST_PREFIX}${prefix}-${year}`;
}

// true für Nummern im neuen, fortlaufenden Format (inkl. TEST-Nummern aus lokalen Tests).
// Alte Nummern (ANNE-/UPS-, zufällig) bleiben unverändert und laufen über die alte Bestätigung.
export function isInvoiceNumber(num: string): boolean {
  return /^(TEST-)?(AN|UB)-\d{4}-\d{4}$/.test(num);
}

// Lokales Datum – bewusst kein toISOString() (würde in Deutschland kurz nach
// Mitternacht noch den Vortag liefern).
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Ablage in Firebase Storage ────────────────────────────────────────────────
// rechnungen/<haus>/<JJJJ-MM des Rechnungsdatums>/<Nummer>.pdf  → monatlich für DATEV
// unterschrieben/<haus>/<Nummer>_unterschrieben.pdf            → NICHT für DATEV
const INVOICE_ROOT = INVOICE_TEST_MODE ? "rechnungen-test" : "rechnungen";
const SIGNED_ROOT = INVOICE_TEST_MODE ? "unterschrieben-test" : "unterschrieben";

function invoicePathFor(houseId: HouseId, date: string, number: string): string {
  return `${INVOICE_ROOT}/${houseId}/${date.slice(0, 7)}/${number}.pdf`;
}

/**
 * Vergibt die nächste Rechnungsnummer und schreibt Nummer + Rechnungsdatum fest an die
 * Buchung — beides in EINER Transaktion, damit nie eine Nummer verbraucht wird, ohne
 * bei einer Buchung zu landen. Hat die Buchung schon eine Rechnung, wird diese
 * unverändert zurückgegeben (z.B. bei Doppelklick).
 */
export async function finalizeInvoice(booking: Booking, includeNewsletter: boolean): Promise<BookingInvoice> {
  const series = seriesOf(booking.property_id, booking.check_in);
  const counterRef = doc(db, "houseSettings", houseIdOf(booking.property_id));
  const counterField = INVOICE_TEST_MODE ? "invoiceCountersTest" : "invoiceCounters";
  const bookingRef = doc(db, "bookings", booking.id);
  const date = todayLocalISO();

  const invoice = await runTransaction(db, async (tx) => {
    const [counterSnap, bookingSnap] = await Promise.all([tx.get(counterRef), tx.get(bookingRef)]);
    const existing = bookingSnap.data()?.invoice as BookingInvoice | undefined;
    if (existing) return existing;

    const counters = (counterSnap.data()?.[counterField] ?? {}) as Record<string, number>;
    const next = Number(counters[series] ?? 0) + 1;
    const number = `${series}-${String(next).padStart(4, "0")}`;
    // Betrag aus dem gespeicherten Stand der Buchung (nicht aus dem Formular)
    const gross = Number(bookingSnap.data()?.price ?? booking.price);
    const { net, vat } = computeVat(gross);
    const inv: BookingInvoice = {
      number,
      date,
      storagePath: invoicePathFor(houseIdOf(booking.property_id), date, number),
      includeNewsletter,
      gross,
      net,
      vat,
      created_at: new Date().toISOString(),
      created_by: auth.currentUser?.email ?? "",
    };
    tx.set(counterRef, { [counterField]: { [series]: next } }, { merge: true });
    tx.update(bookingRef, { booking_number: number, invoice: inv, updated_at: serverTimestamp() });
    return inv;
  });

  // Historien-Eintrag (best-effort, wie bei allen anderen Änderungen)
  try {
    await addDoc(collection(db, "bookings", booking.id, "history"), {
      changes: [{ field: "booking_number", from: booking.booking_number || "", to: invoice.number }],
      note: `Rechnung ${invoice.number} endgültig erstellt (Rechnungsdatum ${invoice.date.split("-").reverse().join(".")})`,
      userId: auth.currentUser?.uid ?? "",
      userEmail: auth.currentUser?.email ?? "",
      created_at: serverTimestamp(),
    });
  } catch (e) {
    console.warn("Historien-Eintrag konnte nicht geschrieben werden:", e);
  }
  return invoice;
}

export async function uploadInvoicePdf(invoice: BookingInvoice, bytes: Uint8Array): Promise<string> {
  const storageRef = ref(storage, invoice.storagePath);
  await uploadBytes(storageRef, bytes, {
    contentType: "application/pdf",
    contentDisposition: `inline; filename="${invoice.number}.pdf"`,
  });
  return getDownloadURL(storageRef);
}

// URL der gespeicherten Rechnung; "missing" = Datei existiert nicht (Hochladen hat
// nicht geklappt), "unreachable" = Speicher nicht erreichbar (z.B. Netz blockiert
// firebasestorage.googleapis.com — die Anfrage hängt dann, statt zu scheitern).
export async function getInvoiceUrl(invoice: BookingInvoice): Promise<string | "missing" | "unreachable"> {
  const timeout = new Promise<"unreachable">((resolve) => setTimeout(() => resolve("unreachable"), 12000));
  const lookup = getDownloadURL(ref(storage, invoice.storagePath)).catch((e: { code?: string }) =>
    e?.code === "storage/object-not-found" ? "missing" as const : "unreachable" as const,
  );
  return Promise.race([lookup, timeout]);
}

// Unterschriebene Bestätigung: <Nummer>_unterschrieben.pdf, bei weiteren Uploads _2, _3 …
// (nichts wird überschrieben).
export async function uploadSignedInvoice(propertyId: string, number: string, bytes: Uint8Array): Promise<{ url: string; timestamp: number }> {
  const folder = `${SIGNED_ROOT}/${houseIdOf(propertyId)}`;
  const existing = (await listAll(ref(storage, folder))).items.map((i) => i.name);
  const base = `${number}_unterschrieben`;
  let name = `${base}.pdf`;
  for (let n = 2; existing.includes(name); n++) name = `${base}_${n}.pdf`;
  const storageRef = ref(storage, `${folder}/${name}`);
  await uploadBytes(storageRef, bytes, {
    contentType: "application/pdf",
    contentDisposition: `inline; filename="${name}"`,
  });
  return { url: await getDownloadURL(storageRef), timestamp: Date.now() };
}

export async function getLatestSignedInvoice(propertyId: string, number: string): Promise<{ url: string; timestamp: number } | null> {
  const folder = `${SIGNED_ROOT}/${houseIdOf(propertyId)}`;
  const items = (await listAll(ref(storage, folder))).items.filter((i) => i.name.startsWith(`${number}_unterschrieben`));
  if (items.length === 0) return null;
  // _unterschrieben.pdf < _unterschrieben_2.pdf < _3 … → die höchste Nummer ist die neueste
  const rank = (name: string) => Number(name.match(/_(\d+)\.pdf$/)?.[1] ?? 1);
  const latest = items.reduce((a, b) => (rank(b.name) > rank(a.name) ? b : a));
  const [url, meta] = await Promise.all([getDownloadURL(latest), getMetadata(latest)]);
  return { url, timestamp: Date.parse(meta.timeCreated) || 0 };
}
