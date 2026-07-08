import type { Booking } from "@/types";
import { segmentIndexOf } from "@/lib/daySegments";

// ── Datums-Helfer ────────────────────────────────────────────────────────────
// WICHTIG: niemals über toISOString() formatieren — das konvertiert nach UTC und
// verschiebt das Datum in jeder Zeitzone mit positivem UTC-Offset (z.B. Deutschland)
// um einen Tag zurück. Stattdessen lokale Datumsfelder direkt auslesen.
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Vorzeichenbehaftete Tagesdifferenz zwischen zwei ISO-Daten (b - a).
export function daysDiffISO(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000,
  );
}

// ── Move: gesamten Zeitraum um `dayDelta` Tage verschieben (Länge bleibt) ─────
export function shiftDates(check_in: string, check_out: string, dayDelta: number) {
  return {
    check_in:  addDaysISO(check_in,  dayDelta),
    check_out: addDaysISO(check_out, dayDelta),
  };
}

// ── Resize: nur Anreise bzw. nur Abreise verschieben ─────────────────────────
export function resizeStart(check_in: string, check_out: string, dayDelta: number) {
  let ci = addDaysISO(check_in, dayDelta);
  // mindestens 1 Nacht: Anreise muss vor Abreise bleiben
  if (ci >= check_out) ci = addDaysISO(check_out, -1);
  return { check_in: ci, check_out };
}

export function resizeEnd(check_in: string, check_out: string, dayDelta: number) {
  let co = addDaysISO(check_out, dayDelta);
  if (co <= check_in) co = addDaysISO(check_in, 1);
  return { check_in, check_out: co };
}

// ── Resize per Drop auf einen Tag (Monatsraster) ─────────────────────────────
// Anreise auf einen konkreten Tag setzen (muss vor Abreise bleiben)
export function setStartDate(_check_in: string, check_out: string, newStartISO: string) {
  let ci = newStartISO;
  if (ci >= check_out) ci = addDaysISO(check_out, -1);
  return { check_in: ci, check_out };
}

// checkOutISO ist der Abreisetag selbst (die Zelle unter dem Zeiger = d <= checkOut im Raster).
// KEIN +1: Rendering benutzt d <= checkOut (inklusiv), checkOut ist der Abreisetag, nicht der Tag danach.
export function setEndDate(check_in: string, _check_out: string, checkOutISO: string) {
  let co = checkOutISO;
  if (co <= check_in) co = addDaysISO(check_in, 1);
  return { check_in, check_out: co };
}

// ── Kollisionsprüfung ─────────────────────────────────────────────────────────
interface StaySpan {
  check_in: string;
  check_out: string;
  ferry_time?: string;
  ferry_time_departure?: string;
}

// Überschneiden sich zwei Zeiträume [check_in, check_out)? Bei einem gemeinsamen
// Übergangstag (eine Buchung reist ab, am selben Tag reist die andere an) zählt
// das NUR als Kollision, wenn die Abreise NACH der Anreise-Fährzeit liegt
// (gleiches oder früheres Segment = saubere Übergabe, keine Kollision).
export function spansOverlap(a: StaySpan, b: StaySpan): boolean {
  if (a.check_in < b.check_out && a.check_out > b.check_in) return true;
  if (a.check_out === b.check_in) {
    return segmentIndexOf(a.ferry_time_departure) > segmentIndexOf(b.ferry_time);
  }
  if (b.check_out === a.check_in) {
    return segmentIndexOf(b.ferry_time_departure) > segmentIndexOf(a.ferry_time);
  }
  return false;
}

// Findet die erste Buchung derselben Wohnung, die sich mit [check_in, check_out) überschneidet.
export function findCollision(
  bookings: Booking[],
  propertyId: string,
  excludeId: string,
  check_in: string,
  check_out: string,
  ferry_time?: string,
  ferry_time_departure?: string,
): Booking | undefined {
  return bookings.find((b) =>
    b.id !== excludeId &&
    b.property_id === propertyId &&
    b.check_in && b.check_out &&
    spansOverlap({ check_in, check_out, ferry_time, ferry_time_departure }, b)
  );
}

// Überschneidet sich [check_in, check_out) mit einer anderen Buchung derselben Wohnung?
export function hasCollision(
  bookings: Booking[],
  propertyId: string,
  excludeId: string,
  check_in: string,
  check_out: string,
  ferry_time?: string,
  ferry_time_departure?: string,
): boolean {
  return !!findCollision(bookings, propertyId, excludeId, check_in, check_out, ferry_time, ferry_time_departure);
}
