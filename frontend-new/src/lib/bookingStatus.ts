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
    barColor: "#6b7280",
    badgeClass: "bg-gray-100 text-gray-700 border border-gray-200",
    dotColor: "#6b7280",
  },
  bestaetigt: {
    value: "bestaetigt",
    label: "Bestätigt",
    barColor: "#1d4ed8",
    badgeClass: "bg-blue-100 text-blue-700 border border-blue-200",
    dotColor: "#1d4ed8",
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
};

// Reihenfolge im Workflow (für Auswahl/Anzeige)
export const STATUS_ORDER: BookingStatus[] = [
  "anfrage", "bestaetigt", "bezahlt", "problem", "abgeschlossen",
];

// Status, bei denen ein Verschieben (Datumsänderung) eine Warnung auslöst
export const CONFIRMED_STATUSES: BookingStatus[] = [
  "bestaetigt", "bezahlt", "abgeschlossen",
];

export function statusConfig(status: BookingStatus | undefined): StatusConfig {
  return STATUS_CONFIG[status ?? "anfrage"] ?? STATUS_CONFIG.anfrage;
}
