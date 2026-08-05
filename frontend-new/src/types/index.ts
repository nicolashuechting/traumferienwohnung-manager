export interface Property {
  id: string;
  name: string;
  house: "Upstalsboom" | "Haus Anne";
  allowsDogs: boolean;
}

// ── Haus-Konfiguration (für Buchungsbestätigungs-PDF) ─────────────────────────
// Ein Dokument pro Haus in Firestore (Collection "houseSettings", ID = Property["house"]
// slug), damit u.a. echte Bankdaten NICHT im Quellcode/Git stehen, sondern nur in Firestore.
export type HouseId = "haus-anne" | "upstalsboom";

export interface HouseSettings {
  id: HouseId;
  name: string;              // "Haus Anne" / "Hus Upstalsboom" — wie im PDF-Kopf verwendet
  address: string;
  logoAssetPath: string;     // Pfad zum statischen Logo-Asset im Frontend (kein Firestore-Binärdaten)
  kontoinhaber: string;
  iban: string;
  bank: string;
  contactEmail: string;
  phone: string;
  website: string;
  footerName: string;        // z.B. "Familien Rothengaß und Hüchting"
  kurtaxeSuchname: string;   // z.B. "Andreas Hüchting Haus Anne GbR"
  checkInTime: string;       // "15:00"
  checkOutTime: string;      // "10:00"
  stornoText: string[];      // Bullet-Liste, z.B. ["bis zu drei Monate vor Buchungsbeginn: kostenfrei", ...]
}

// ── Preise ───────────────────────────────────────────────────────────────────
export type PriceGroupId = "kamin" | "terrasse" | "anne-1" | "anne-2" | "anne-3" | "anne-4" | "anne-5";

export interface PriceSeason {
  id: string;                                  // z.B. "haupt", "neben", "winter", "erste_woche"
  label: string;                                // z.B. "Hauptsaison"
  dateRanges: { start: string; end: string }[]; // ISO, mehrere Zeiträume möglich
  pricePerPerson: Record<number, number>;       // Personenzahl → Preis, z.B. {1: 92, 2: 102, ...}
}

export interface PriceYear {
  year: number;
  seasons: PriceSeason[];
}

export interface PriceGroupSettings {
  id: PriceGroupId;
  maxPersons: number;              // 4 oder 5 (Terrasse: 4, Kamin/Anne: 5)
  flatRate: boolean;                // true bei Anne: Preis unabhängig von Personenzahl
  cleaningFee: number;              // Servicegebühr (Kamin/Terrasse) bzw. Endreinigung (Anne)
  extraFees: { label: string; amount: number; perPerson?: boolean }[]; // z.B. Wäschepaket bei Anne (10€/Person)
  dogFee: number;                   // pro Hund
  years: PriceYear[];               // additiv, nach Jahr aufsteigend
}

export interface PriceBreakdownNight {
  date: string;
  seasonLabel: string;
  price: number;           // aktuell gültiger Preis (ggf. per Übernachtungspreis-Override angepasst)
  originalPrice?: number;  // automatisch berechneter Saison-Preis, falls abweichend vom aktuellen
}

export interface PriceBreakdown {
  nights: PriceBreakdownNight[];
  cleaningFee: number;
  extraFees: { label: string; amount: number }[];
  dogFee: number;
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
  contact_info: string; // Altfeld, nur noch lesend als Fallback für phone/email genutzt (siehe normaliseBooking)
  phone: string;
  email: string;
  check_in: string;   // "YYYY-MM-DD"
  check_out: string;  // "YYYY-MM-DD"
  ferry_time: string;            // Anreise-Fähre (Neßmersiel → Baltrum)
  ferry_time_departure: string;  // Abreise-Fähre (Baltrum → Neßmersiel)
  is_paid: boolean;
  adults: number;
  children: number;
  kinderAlter: number[]; // Alter pro Kind, z.B. [3, 7, 10]
  dogCount: number;    // Anzahl Hunde, 0–3
  kinderbett: boolean;
  rausfallschutz: boolean;
  kinderstuhl: boolean;
  price: number;        // EUR, finaler Betrag (auch 0 ist ein gültiger, bewusster Preis)
  priceIsManual: boolean;        // false = automatisch berechnet, true = von Hand überschrieben
  priceBreakdown?: PriceBreakdown; // nur gesetzt wenn automatisch berechnet
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
