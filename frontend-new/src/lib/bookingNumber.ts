import { properties } from "@/lib/properties";

// Präfix je Haus: ups-* → "UPS", anne-* → "ANNE"
export function housePrefix(propertyId: string): string {
  const house = properties.find((p) => p.id === propertyId)?.house;
  if (house === "Haus Anne") return "ANNE";
  if (house === "Upstalsboom") return "UPS";
  // Fallback anhand der ID
  if (propertyId.startsWith("anne")) return "ANNE";
  return "UPS";
}

// Jahr aus check_in (YYYY-MM-DD), sonst aktuelles Jahr
function yearOf(checkIn: string): number {
  const y = Number((checkIn || "").slice(0, 4));
  return y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
}

/**
 * Erzeugt eine eindeutige Buchungsnummer im Format PREFIX-JAHR-NNNN.
 * Die hinteren 4 Stellen sind zufällig (1000–9999, bewusst nicht ab 0001 — sonst
 * ließe sich aus einer niedrigen Nummer wie 0050 ablesen, dass es erst die 50.
 * Buchung im Jahr war) und kollisionsfrei gegenüber `existingNumbers`.
 */
export function generateBookingNumber(
  propertyId: string,
  checkIn: string,
  existingNumbers: Iterable<string>,
): string {
  const prefix = housePrefix(propertyId);
  const year = yearOf(checkIn);
  const used = new Set<string>(existingNumbers);

  const base = `${prefix}-${year}-`;
  const MIN = 1000, MAX = 9999;
  // bis zu 9000 zufällige Versuche, dann linearer Fallback
  for (let i = 0; i < MAX - MIN + 1; i++) {
    const n = MIN + Math.floor(Math.random() * (MAX - MIN + 1));
    const candidate = base + String(n).padStart(4, "0");
    if (!used.has(candidate)) return candidate;
  }
  // Fallback: erste freie Nummer linear suchen
  for (let n = MIN; n <= MAX; n++) {
    const candidate = base + String(n).padStart(4, "0");
    if (!used.has(candidate)) return candidate;
  }
  // Sollte praktisch nie passieren
  return base + Date.now().toString().slice(-4);
}
