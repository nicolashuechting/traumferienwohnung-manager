import scheduleRaw from "@/data/ferry-schedule.json";

// ── Datenstruktur (siehe README-ferry-schedule) ──────────────────────────────
export interface FerryDeparture {
  nessmersielToBaltrum: string | null; // Anreise zur Insel, z.B. "10:15"
  baltrumToNessmersiel: string | null; // Abreise von der Insel, z.B. "09:15"
  noBusConnection?: boolean;           // kein Busanschluss nach Norden (* im Original)
}
export interface FerryDay {
  date: string;          // "YYYY-MM-DD"
  departures: FerryDeparture[];
}

const schedule = scheduleRaw as FerryDay[];
const byDate = new Map<string, FerryDay>(schedule.map((d) => [d.date, d]));

// Schiff-Fahrzeit (Minuten) – für Putzfenster-Berechnung
export const SHIP_MINUTES = 30;

export type FerryDirection = "arrival" | "departure";

export function getFerryDay(dateISO: string): FerryDay | null {
  return dateISO ? byDate.get(dateISO) ?? null : null;
}

export function hasFerryData(dateISO: string): boolean {
  return !!dateISO && byDate.has(dateISO);
}

function uniqSorted(times: string[]): string[] {
  return [...new Set(times)].sort();
}

/** Anreisezeiten (Neßmersiel → Baltrum) für ein Datum. */
export function getArrivalTimes(dateISO: string): string[] {
  const day = getFerryDay(dateISO);
  if (!day) return [];
  return uniqSorted(day.departures.map((d) => d.nessmersielToBaltrum).filter((t): t is string => !!t));
}

/** Abreisezeiten (Baltrum → Neßmersiel) für ein Datum. */
export function getDepartureTimes(dateISO: string): string[] {
  const day = getFerryDay(dateISO);
  if (!day) return [];
  return uniqSorted(day.departures.map((d) => d.baltrumToNessmersiel).filter((t): t is string => !!t));
}

export function getTimes(dateISO: string, direction: FerryDirection): string[] {
  return direction === "arrival" ? getArrivalTimes(dateISO) : getDepartureTimes(dateISO);
}

/** Hat die gewählte Verbindung keinen Busanschluss? */
export function isNoBus(dateISO: string, time: string, direction: FerryDirection): boolean {
  const day = getFerryDay(dateISO);
  if (!day || !time) return false;
  return day.departures.some(
    (d) => (direction === "arrival" ? d.nessmersielToBaltrum : d.baltrumToNessmersiel) === time && d.noBusConnection,
  );
}

// ── Zeit-Mathematik ──────────────────────────────────────────────────────────
function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let total = h * 60 + m + mins;
  total = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Putzfenster zwischen einer Abreise-Fähre und der nächsten Anreise-Fähre.
 * Beispiel: Abreise 10:00 + nächste Anreise 14:30 → { start: "10:30", end: "14:00" }
 * (Start = Abreise + Schiffszeit, Ende = nächste Anreise − Schiffszeit)
 */
export function cleaningWindow(departureFerry: string, nextArrivalFerry: string): { start: string; end: string } | null {
  if (!departureFerry || !nextArrivalFerry) return null;
  return {
    start: addMinutes(departureFerry, SHIP_MINUTES),
    end: addMinutes(nextArrivalFerry, -SHIP_MINUTES),
  };
}
