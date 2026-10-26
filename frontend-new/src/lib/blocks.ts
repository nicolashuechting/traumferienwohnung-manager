import type { Booking, BookingFormData } from "@/types";

// ── Sperren ("Zeitraum sperren", z.B. wenn Familie kommt) ─────────────────────
// Eine Sperre ist technisch eine Buchung mit source "blocked": Sie belegt die Wohnung
// (Kollisionsprüfung, Kalender, An-/Abreise für die Reinigung), hat aber bewusst
// KEINEN Preis, KEINE Bestätigung/Rechnung (also auch keine Rechnungsnummer),
// KEIN Gast-Profil, keine Erinnerungen und zählt nicht in Umsatz/Statistik.
// Gespeichert werden nur Wohnung, Zeitraum, ein Name (ein Wort) und eine Notiz.

export const BLOCK_COLOR = "#475569"; // Schiefergrau – klar anders als alle Statusfarben
export const BLOCK_STRIPES =
  "repeating-linear-gradient(135deg, rgba(255,255,255,0.22) 0px, rgba(255,255,255,0.22) 4px, transparent 4px, transparent 9px)";

export function isBlocked(b: Pick<Booking, "source">): boolean {
  return b.source === "blocked";
}

// Ein Wort, z.B. "Familie" — Leerzeichen werden entfernt.
export function cleanBlockName(name: string): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function blockLabel(b: Pick<Booking, "guest_name">): string {
  return b.guest_name ? `Gesperrt · ${b.guest_name}` : "Gesperrt";
}

// Vollständiger Datensatz für eine neue Sperre — alle Buchungsfelder neutral belegt,
// damit nirgends ein Preis, eine Rechnungsnummer oder ein Gast-Profil entsteht.
export function newBlockData(f: { property_id: string; check_in: string; check_out: string; name: string; notes: string }): BookingFormData {
  const name = cleanBlockName(f.name);
  return {
    property_id: f.property_id,
    booking_number: "",
    status: "bestaetigt",
    guest_name: name,
    guest_title: "",
    guest_first_name: "",
    guest_last_name: name,
    contact_info: "",
    phone: "",
    landline: "",
    email: "",
    street: "",
    houseNumber: "",
    zip: "",
    city: "",
    country: "",
    check_in: f.check_in,
    check_out: f.check_out,
    ferry_time: "",
    ferry_time_departure: "",
    is_paid: false,
    adults: 0,
    children: 0,
    kinderAlter: [],
    dogCount: 0,
    kinderbett: false,
    babybett: false,
    rausfallschutz: false,
    kinderstuhl: false,
    price: 0,
    priceIsManual: true,
    cancellationFee: 0,
    status_changed_at: "",
    channel: "Sperre",
    ical_uid: "",
    notes: f.notes.trim(),
    source: "blocked",
  };
}
