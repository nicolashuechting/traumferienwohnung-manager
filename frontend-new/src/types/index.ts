export interface Property {
  id: string;
  name: string;
  house: "Upstalsboom" | "Haus Anne";
  allowsDogs: boolean;
}

// Workflow-Status einer Buchung
export type BookingStatus =
  | "anfrage"       // Hellgrau – eingegangen, unbestätigt
  | "reserviert"    // Dunkelgrau – Anfrage beim Mieter, wartet auf Rückmeldung
  | "bestaetigt"    // Blau  – bestätigt, Bestätigung verschickt
  | "bezahlt"       // Grün  – Zahlung eingegangen
  | "problem"       // Gelb  – z.B. falscher Betrag
  | "abgeschlossen"; // Dunkelgrün – ausgecheckt

export interface Booking {
  id: string;
  property_id: string;
  booking_number: string; // z.B. "UPS-2026-0001", "" für Altbestand/iCal ohne Nummer
  status: BookingStatus;
  guest_name: string;
  contact_info: string;
  check_in: string;   // "YYYY-MM-DD"
  check_out: string;  // "YYYY-MM-DD"
  ferry_time: string;            // Anreise-Fähre (Neßmersiel → Baltrum)
  ferry_time_departure: string;  // Abreise-Fähre (Baltrum → Neßmersiel)
  is_paid: boolean;
  adults: number;
  children: number;
  kinderAlter: number[]; // Alter pro Kind, z.B. [3, 7, 10]
  dog: boolean;
  kinderbett: boolean;
  rausfallschutz: boolean;
  kinderstuhl: boolean;
  price: number;       // EUR, 0 = nicht angegeben
  channel: string;     // "Manuell" | "Ferienwohnungen.de" | "Baltrumdirekt.de" | …
  ical_uid: string;    // iCal UID for deduplication, "" for manual bookings
  notes: string;
  source: "manual" | "blocked" | "ical";
  userId: string;
  created_at: string;
  updated_at: string;
  deletedAt: string | null; // Soft-Delete-Zeitstempel (ISO), null = aktiv
}

export type BookingFormData = Omit<Booking, "id" | "userId" | "created_at" | "updated_at" | "deletedAt">;

// ── Änderungshistorie ────────────────────────────────────────────────────────
export interface FieldChange {
  field: string;                       // Feldname, z.B. "check_in"
  from: string | number | boolean;     // Rohwert vorher
  to: string | number | boolean;       // Rohwert nachher
}

export interface BookingHistoryEntry {
  id: string;
  changes: FieldChange[];
  note?: string;                       // z.B. "Buchung erstellt" / "Wiederhergestellt …"
  userId?: string;
  created_at: unknown;                 // Firestore Timestamp
}

// iCal feed stored in Firestore
export interface IcalFeed {
  id: string;
  userId: string;
  property_id: string;
  name: string;       // e.g. "Ferienwohnungen.de"
  url: string;        // the .ics URL
  last_synced: string; // ISO timestamp or ""
}
