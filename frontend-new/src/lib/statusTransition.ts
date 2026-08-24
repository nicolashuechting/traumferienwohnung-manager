import { STATUS_ORDER, NUMBERED_STATUSES } from "@/lib/bookingStatus";
import { generateBookingNumber } from "@/lib/bookingNumber";
import type { BookingStatus } from "@/types";

// Zentrale Rückfrage-Logik für Statuswechsel — jede Stelle, die den Status einer
// Buchung ändert (BookingModal, Benachrichtigungs-Detailansicht, ...), ruft dieselbe
// Funktion auf, damit die Warnungen unabhängig vom gewählten Weg konsistent
// erscheinen (nicht nur bei einem von mehreren möglichen Klickpfaden zum selben Ziel).
// Gibt false zurück, wenn der Nutzer abgebrochen hat — der Wechsel soll dann NICHT
// erfolgen.
export function confirmStatusTransition(from: BookingStatus, to: BookingStatus): boolean {
  const isBackward = STATUS_ORDER.indexOf(to) < STATUS_ORDER.indexOf(from);
  if (isBackward && !window.confirm("Status zurücksetzen?")) return false;
  // Zwischenschritt "Vertrag unterschrieben" übersprungen (von anfrage/reserviert/
  // bestaetigt/problem direkt auf bezahlt): kurz nachfragen.
  if (to === "bezahlt" && STATUS_ORDER.indexOf(from) < STATUS_ORDER.indexOf("vertrag_unterschrieben") &&
      !window.confirm("Der Vertrag wurde noch nicht als unterschrieben markiert. Trotzdem als bezahlt markieren?")) return false;
  if (to === "storniert" && from !== "storniert") {
    window.alert('Buchung wird als storniert markiert. Falls laut Stornobedingungen eine Stornogebühr fällig ist, trage sie direkt im Feld "Stornogebühren" ein.');
  }
  if (to === "bestaetigt" && from !== "bestaetigt") {
    window.alert('Buchung wird bestätigt. Jetzt ist der richtige Zeitpunkt, die Buchungsbestätigung per E-Mail zu verschicken. Falls du dafür gerade keine Zeit hast, lass die Buchung lieber auf "Reserviert" stehen.');
  }
  return true;
}

// Vergibt eine Buchungsnummer, sobald `to` einen Status aus NUMBERED_STATUSES
// erreicht und noch keine Nummer existiert — sonst bleibt die vorhandene erhalten.
export function ensureBookingNumberFor(
  currentNumber: string,
  propertyId: string,
  checkIn: string,
  toStatus: BookingStatus,
  existingNumbers: Iterable<string>,
): string {
  if (currentNumber) return currentNumber;
  if (!NUMBERED_STATUSES.includes(toStatus)) return "";
  return generateBookingNumber(propertyId, checkIn, existingNumbers);
}
