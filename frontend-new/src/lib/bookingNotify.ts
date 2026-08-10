import type { Booking, BookingFormData, FieldChange } from "@/types";
import { diffBooking } from "@/lib/bookingHistory";

// Felder, bei deren Änderung eine Benachrichtigung ausgelöst werden soll
// (bewusst NICHT: Gästenotizen/personNotes — die sind personenbezogen, nicht buchungsbezogen)
export const NOTIFY_FIELDS = [
  "check_in",
  "check_out",
  "ferry_time",
  "ferry_time_departure",
  "adults",
  "children",
  "kinderAlter",
  "dogCount",
  "notes",
];

const NOTIFY_WINDOW_DAYS = 10;

// Überschneidet sich [check_in, check_out) mit [heute, heute + 10 Tage]?
export function isInNotifyWindow(checkIn: string, checkOut: string): boolean {
  if (!checkIn || !checkOut) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowStart = today.getTime();
  const windowEnd = windowStart + NOTIFY_WINDOW_DAYS * 86400000;
  const bStart = new Date(checkIn + "T00:00:00").getTime();
  const bEnd = new Date(checkOut + "T00:00:00").getTime();
  return bStart < windowEnd && bEnd > windowStart;
}

export function shouldNotify(
  old: Booking | null,
  newData: Partial<BookingFormData> | null,
  kind: "create" | "update" | "cancel",
): { should: boolean; changes: FieldChange[] } {
  if (kind === "create") {
    const checkIn = newData?.check_in ?? "";
    const checkOut = newData?.check_out ?? "";
    return { should: isInNotifyWindow(checkIn, checkOut), changes: [] };
  }

  if (kind === "cancel") {
    if (!old) return { should: false, changes: [] };
    return { should: isInNotifyWindow(old.check_in, old.check_out), changes: [] };
  }

  // update
  if (!old || !newData) return { should: false, changes: [] };
  const changes = diffBooking(old, newData).filter((c) => NOTIFY_FIELDS.includes(c.field));
  if (changes.length === 0) return { should: false, changes: [] };
  const newCheckIn = newData.check_in ?? old.check_in;
  const newCheckOut = newData.check_out ?? old.check_out;
  const relevant = isInNotifyWindow(old.check_in, old.check_out) || isInNotifyWindow(newCheckIn, newCheckOut);
  return { should: relevant, changes };
}
