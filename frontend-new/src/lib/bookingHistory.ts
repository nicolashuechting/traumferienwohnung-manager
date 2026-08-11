import { properties } from "@/lib/properties";
import { statusConfig } from "@/lib/bookingStatus";
import type { Booking, BookingFormData, BookingStatus, FieldChange } from "@/types";

type Primitive = string | number | boolean;

interface FieldDef {
  label: string;
  format: (v: Primitive) => string;
}

function fmtDate(v: Primitive): string {
  const s = String(v ?? "");
  if (!s) return "–";
  const [y, m, d] = s.split("-");
  return d && m && y ? `${d}.${m}.${y}` : s;
}
function propName(id: Primitive): string {
  return properties.find((p) => p.id === id)?.name ?? String(id);
}

// Felder, die in der Historie verfolgt werden (Reihenfolge = Anzeige-Reihenfolge)
export const HISTORY_FIELDS: Record<string, FieldDef> = {
  property_id:    { label: "Wohnung",      format: (v) => propName(v) },
  status:         { label: "Status",       format: (v) => statusConfig(v as BookingStatus).label },
  guest_name:     { label: "Gast",         format: (v) => String(v || "–") },
  guest_first_name: { label: "Vorname",    format: (v) => String(v || "–") },
  guest_last_name:  { label: "Nachname",   format: (v) => String(v || "–") },
  phone:          { label: "Telefon",      format: (v) => String(v || "–") },
  email:          { label: "E-Mail",       format: (v) => String(v || "–") },
  street:         { label: "Straße",       format: (v) => String(v || "–") },
  houseNumber:    { label: "Hausnummer",   format: (v) => String(v || "–") },
  zip:            { label: "PLZ",          format: (v) => String(v || "–") },
  city:           { label: "Ort",          format: (v) => String(v || "–") },
  country:        { label: "Land",         format: (v) => String(v || "–") },
  check_in:       { label: "Anreise",      format: fmtDate },
  check_out:      { label: "Abreise",      format: fmtDate },
  ferry_time:           { label: "Fähre Anreise", format: (v) => String(v || "–") },
  ferry_time_departure: { label: "Fähre Abreise", format: (v) => String(v || "–") },
  is_paid:        { label: "Bezahlt",      format: (v) => (v ? "Ja" : "Nein") },
  adults:         { label: "Erwachsene",   format: (v) => String(v) },
  children:       { label: "Kinder",       format: (v) => String(v) },
  kinderAlter:    { label: "Kinderalter",  format: (v) => {
    const s = String(v ?? "");
    return s ? `${s.split(",").join(", ")} Jahre` : "–";
  } },
  dogCount:       { label: "Hunde",        format: (v) => (Number(v) > 0 ? String(v) : "Nein") },
  kinderbett:     { label: "Kinderbett",       format: (v) => (v ? "Ja" : "Nein") },
  rausfallschutz: { label: "Rausfallschutz",   format: (v) => (v ? "Ja" : "Nein") },
  kinderstuhl:    { label: "Kinderstuhl",      format: (v) => (v ? "Ja" : "Nein") },
  price:          { label: "Preis",        format: (v) => `${Number(v).toLocaleString("de-DE")} €` },
  cancellationFee: { label: "Kulanzbetrag", format: (v) => `${Number(v).toLocaleString("de-DE")} €` },
  channel:        { label: "Kanal",        format: (v) => String(v || "–") },
  notes:          { label: "Notizen",      format: (v) => String(v || "–") },
  booking_number: { label: "Buchungsnr.",  format: (v) => String(v || "–") },
};

const TRACKED = Object.keys(HISTORY_FIELDS);

export function fieldLabel(field: string): string {
  return HISTORY_FIELDS[field]?.label ?? field;
}
export function formatFieldValue(field: string, v: Primitive): string {
  const def = HISTORY_FIELDS[field];
  return def ? def.format(v) : String(v);
}
export function describeChange(c: FieldChange): string {
  return `${fieldLabel(c.field)}: ${formatFieldValue(c.field, c.from)} → ${formatFieldValue(c.field, c.to)}`;
}

// Unterschiede zwischen altem Stand und neuen (Teil-)Daten ermitteln
export function diffBooking(
  oldB: Partial<Booking>,
  newData: Partial<BookingFormData>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const f of TRACKED) {
    if (!(f in newData)) continue;
    let from: unknown = (oldB as Record<string, unknown>)[f];
    let to: unknown = (newData as Record<string, unknown>)[f];
    // Arrays (z.B. kinderAlter) als String vergleichen/speichern statt per Referenz
    if (Array.isArray(from)) from = from.join(",");
    if (Array.isArray(to)) to = to.join(",");
    if (from === to) continue;
    changes.push({ field: f, from: (from ?? "") as Primitive, to: (to ?? "") as Primitive });
  }
  return changes;
}

// Firestore-Timestamp → "17.06.2026, 14:32"
export function formatHistoryTime(ts: unknown): string {
  let ms = 0;
  if (ts && typeof ts === "object" && "seconds" in (ts as Record<string, unknown>)) {
    ms = (ts as { seconds: number }).seconds * 1000;
  } else if (typeof ts === "string" && ts) {
    ms = new Date(ts).getTime();
  } else if (typeof ts === "number") {
    ms = ts;
  }
  if (!ms || Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Kurzes Datum (für "Stand vom …")
export function formatHistoryDate(ts: unknown): string {
  const full = formatHistoryTime(ts);
  return full === "—" ? full : full.split(",")[0];
}
