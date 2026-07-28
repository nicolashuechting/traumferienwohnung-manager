import { addDaysISO } from "@/lib/bookingDrag";
import type { PriceGroupSettings, PriceBreakdownNight } from "@/types";

export interface PriceResult {
  nights: PriceBreakdownNight[];
  subtotal: number;
  cleaningFee: number;
  extraFees: { label: string; amount: number }[];
  dogFee: number;
  total: number;
}

// Findet für ein einzelnes Datum Saison-Label + Preis über alle Jahrgänge hinweg
// (Saisons können über den Jahreswechsel laufen, z.B. "Winter 26/27").
function priceForNight(iso: string, persons: number, settings: PriceGroupSettings): { label: string; price: number } {
  for (const year of settings.years) {
    for (const season of year.seasons) {
      const inRange = season.dateRanges.some((r) => iso >= r.start && iso <= r.end);
      if (!inRange) continue;
      const capped = Math.min(persons, settings.maxPersons);
      const price = season.pricePerPerson[capped] ?? 0;
      return { label: season.label, price };
    }
  }
  return { label: "–", price: 0 };
}

/**
 * Reine Preisberechnung ohne Rabatte/Aufpreise: Summe aller Nächte je nach
 * Saison + feste Pauschalen (Reinigung, Zusatzgebühren, Hundegebühr).
 */
export function calculatePrice(
  checkIn: string,
  checkOut: string,
  adults: number,
  children: number,
  dogCount: number,
  settings: PriceGroupSettings,
): PriceResult {
  const persons = adults + children;
  const nights: PriceBreakdownNight[] = [];
  let cursor = checkIn;
  while (cursor < checkOut) {
    const { label, price } = priceForNight(cursor, persons, settings);
    nights.push({ date: cursor, seasonLabel: label, price });
    cursor = addDaysISO(cursor, 1);
  }

  const subtotal = nights.reduce((s, n) => s + n.price, 0);
  const dogFee = settings.dogFee * Math.max(0, dogCount);
  // Zusatzgebühren pro Person (z.B. Wäschepaket bei Anne) auf den tatsächlichen
  // Betrag auflösen, damit die gespeicherte Aufschlüsselung den Endbetrag zeigt.
  const extraFees = settings.extraFees.map((f) => ({
    label: f.label,
    amount: f.perPerson ? f.amount * persons : f.amount,
  }));
  const extraFeesTotal = extraFees.reduce((s, f) => s + f.amount, 0);
  const total = subtotal + settings.cleaningFee + extraFeesTotal + dogFee;

  return { nights, subtotal, cleaningFee: settings.cleaningFee, extraFees, dogFee, total };
}
