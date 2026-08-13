import type { BookingStatus } from "@/types";

export interface StatusConfig {
  value: BookingStatus;
  label: string;
  barColor: string;   // Vollfarbe des Kalenderbalkens (Hex)
  badgeClass: string; // Tailwind-Klassen für Badges/Felder in Listen
  dotColor: string;   // kleiner Farbpunkt (Hex)
}

export const STATUS_CONFIG: Record<BookingStatus, StatusConfig> = {
  anfrage: {
    value: "anfrage",
    label: "Anfrage",
    barColor: "#9ca3af",
    badgeClass: "bg-gray-50 text-gray-500 border border-gray-200",
    dotColor: "#9ca3af",
  },
  reserviert: {
    value: "reserviert",
    label: "Reserviert",
    barColor: "#4b5563",
    badgeClass: "bg-gray-200 text-gray-800 border border-gray-300",
    dotColor: "#4b5563",
  },
  bestaetigt: {
    value: "bestaetigt",
    label: "Bestätigt",
    barColor: "#1d4ed8",
    badgeClass: "bg-blue-100 text-blue-700 border border-blue-200",
    dotColor: "#1d4ed8",
  },
  vertrag_unterschrieben: {
    value: "vertrag_unterschrieben",
    label: "Vertrag unterschrieben",
    barColor: "#0d9488",
    badgeClass: "bg-teal-100 text-teal-700 border border-teal-200",
    dotColor: "#0d9488",
  },
  bezahlt: {
    value: "bezahlt",
    label: "Bezahlt",
    barColor: "#16a34a",
    badgeClass: "bg-green-100 text-green-700 border border-green-200",
    dotColor: "#16a34a",
  },
  problem: {
    value: "problem",
    label: "Probleme",
    barColor: "#ca8a04",
    badgeClass: "bg-yellow-100 text-yellow-800 border border-yellow-200",
    dotColor: "#ca8a04",
  },
  abgeschlossen: {
    value: "abgeschlossen",
    label: "Abgeschlossen",
    barColor: "#166534",
    badgeClass: "bg-emerald-200 text-emerald-900 border border-emerald-300",
    dotColor: "#166534",
  },
  storniert: {
    value: "storniert",
    label: "Storniert",
    barColor: "#6b7280",
    badgeClass: "bg-gray-100 text-gray-500 border border-gray-300 line-through",
    dotColor: "#6b7280",
  },
};

// Reihenfolge im Workflow (für Auswahl/Anzeige). "storniert" steht bewusst ganz am
// Ende, nicht in der normalen Fortschritts-Kette — von überall aus stornierbar,
// gilt daher immer als "Vorwärtsschritt" (kein ungewollter Rückwärts-Dialog).
export const STATUS_ORDER: BookingStatus[] = [
  "anfrage", "reserviert", "bestaetigt", "vertrag_unterschrieben", "bezahlt", "problem", "abgeschlossen", "storniert",
];

// Status, bei denen ein Verschieben (Datumsänderung) eine Warnung auslöst
export const CONFIRMED_STATUSES: BookingStatus[] = [
  "bestaetigt", "vertrag_unterschrieben", "bezahlt", "abgeschlossen",
];

// Status, ab denen automatisch eine Buchungsnummer vergeben wird (sobald einer davon
// erstmals erreicht wird, unabhängig davon ob Zwischenschritte übersprungen wurden).
// Bewusst eine eigene Liste statt STATUS_ORDER-Position: "storniert" steht dort nur aus
// Vorwärts/Rückwärts-Gründen ganz hinten, das hat nichts mit dieser Frage zu tun.
export const NUMBERED_STATUSES: BookingStatus[] = [
  "bestaetigt", "vertrag_unterschrieben", "bezahlt", "problem", "abgeschlossen", "storniert",
];

export function statusConfig(status: BookingStatus | undefined): StatusConfig {
  return STATUS_CONFIG[status ?? "anfrage"] ?? STATUS_CONFIG.anfrage;
}
