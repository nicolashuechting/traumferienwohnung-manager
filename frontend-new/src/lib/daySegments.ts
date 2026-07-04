// Zeit-Segmente für die visuelle An-/Abreise-Darstellung im Kalender.
// Jeder Tag wird optisch in 5 Segmente unterteilt; eine Buchung beginnt/endet
// in dem Segment, in das ihre Fährzeit fällt (nicht auf die Minute genau).
export const SEGMENT_START_HOUR = [0, 9, 12, 15, 18] as const; // Segment 1..5, je 0-indiziert
export const SEGMENT_COUNT = SEGMENT_START_HOUR.length;

// Fallback ohne hinterlegte Fährzeit: Segment 2 (09:00) — Index 1.
const FALLBACK_SEGMENT_INDEX = 1;

/** Segment-Index (0..4) für eine Fährzeit "HH:MM". Fallback Segment 2, wenn keine Zeit hinterlegt ist. */
export function segmentIndexOf(hhmm: string | null | undefined): number {
  if (!hhmm) return FALLBACK_SEGMENT_INDEX;
  const h = Number(hhmm.split(":")[0]);
  if (Number.isNaN(h)) return FALLBACK_SEGMENT_INDEX;
  let idx = 0;
  for (let i = 0; i < SEGMENT_START_HOUR.length; i++) {
    if (h >= SEGMENT_START_HOUR[i]) idx = i;
  }
  return idx;
}

/** Bruchteil des Tages (0..1), an dem ein Segment beginnt. */
export function segmentFraction(segmentIndex: number): number {
  return SEGMENT_START_HOUR[segmentIndex] / 24;
}

/** Bruchteil des Tages, an dem eine Buchung anhand ihrer Anreise-Fährzeit visuell beginnt. */
export function arrivalFraction(ferryTime: string | null | undefined): number {
  return segmentFraction(segmentIndexOf(ferryTime));
}

/** Bruchteil des Tages, an dem eine Buchung anhand ihrer Abreise-Fährzeit visuell endet. */
export function departureFraction(ferryTimeDeparture: string | null | undefined): number {
  return segmentFraction(segmentIndexOf(ferryTimeDeparture));
}
