import type { Booking } from "@/types";
import { properties } from "@/lib/properties";

// ─────────────────────────────────────────────────────────────────────────────
// HIER SPÄTER EIGENE DATEN EINTRAGEN
// Diese Platzhalter erscheinen im automatisch erzeugten Bestätigungstext.
// ─────────────────────────────────────────────────────────────────────────────
export const BANK_DETAILS = {
  vermieter: "[DEIN NAME]",
  kontoinhaber: "[KONTOINHABER]",
  iban: "[DE00 0000 0000 0000 0000 00]",
  bic: "[BICXXXXX]",
  bank: "[NAME DER BANK]",
  // Optional: Anrede / Grußformel
  grussformel: "Mit freundlichen Grüßen",
};

function fmtDate(iso: string): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function nights(ci: string, co: string): number {
  return Math.max(0, Math.round(
    (new Date(co + "T00:00:00").getTime() - new Date(ci + "T00:00:00").getTime()) / 86400000,
  ));
}

function propName(id: string): string {
  return properties.find((p) => p.id === id)?.name ?? id;
}

/** Erzeugt den fertigen Bestätigungstext zum Kopieren. */
export function buildConfirmationText(booking: Booking): string {
  const n = nights(booking.check_in, booking.check_out);
  const price = booking.price > 0
    ? `${booking.price.toLocaleString("de-DE")} €`
    : "[Betrag]";
  const nummer = booking.booking_number || "[Buchungsnummer]";

  return `Hallo ${booking.guest_name},

vielen Dank für Ihre Buchung. Hiermit bestätigen wir Ihren Aufenthalt:

  Buchungsnummer:   ${nummer}
  Wohnung:          ${propName(booking.property_id)}
  Anreise:          ${fmtDate(booking.check_in)}
  Abreise:          ${fmtDate(booking.check_out)}
  Nächte:           ${n}
  Gesamtpreis:      ${price}

Bitte überweisen Sie den Gesamtbetrag von ${price} auf folgendes Konto:

  Kontoinhaber:     ${BANK_DETAILS.kontoinhaber}
  IBAN:             ${BANK_DETAILS.iban}
  BIC:              ${BANK_DETAILS.bic}
  Bank:             ${BANK_DETAILS.bank}
  Verwendungszweck: ${nummer}

Bitte geben Sie unbedingt die Buchungsnummer ${nummer} als Verwendungszweck an,
damit wir Ihre Zahlung zuordnen können.

${BANK_DETAILS.grussformel}
${BANK_DETAILS.vermieter}`;
}
