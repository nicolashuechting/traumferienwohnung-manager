import { useCallback, useMemo } from "react";
import { useBookings } from "@/hooks/useBookings";
import { useGuests } from "@/hooks/useGuests";
import { guestKey } from "@/lib/guestName";
import { houseIdOf } from "@/lib/properties";
import { isBlocked } from "@/lib/blocks";
import type { Booking } from "@/types";

// Zentrale "Stammgast"-Logik, wiederverwendet an allen Stellen, die den Stern zeigen
// (BookingModal, Buchungsliste, Kalenderbalken, Home, Benachrichtigungen) — bewusst
// nicht dupliziert wie zuvor nur in Guests.tsx. Ein Gast gilt als Stammgast, wenn
// entweder automatisch (≥2 Buchungen) ODER manuell (Guest.isRegularGuest) markiert —
// der manuelle Schalter kann den Stern nur zusätzlich AN-, nie AUSschalten.
// Gezählt wird je Haus: Buchungen in Haus Anne machen niemanden zum Upstalsboom-Stammgast.
export function useGuestStats(): { isStammgast: (b: Booking) => boolean; isLoading: boolean } {
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings();
  const { data: guestProfiles = [], isLoading: guestsLoading } = useGuests();

  const stammgastKeys = useMemo(() => {
    const keyOf = (b: Booking) => `${houseIdOf(b.property_id)}|${guestKey(b.email, b.phone, b.guest_name)}`;
    const counts = new Map<string, number>();
    bookings.forEach((b) => {
      if (isBlocked(b)) return; // Sperren zählen nicht als Aufenthalt
      const key = keyOf(b);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const manualEmails = new Set(
      guestProfiles.filter((g) => g.isRegularGuest).map((g) => `${g.house}|${g.email}`),
    );
    const result = new Set<string>();
    bookings.forEach((b) => {
      if (isBlocked(b)) return;
      const key = keyOf(b);
      const isManual = !!b.email && manualEmails.has(`${houseIdOf(b.property_id)}|${b.email.trim().toLowerCase()}`);
      if (isManual || (counts.get(key) ?? 0) >= 2) result.add(key);
    });
    return result;
  }, [bookings, guestProfiles]);

  const isStammgast = useCallback(
    (b: Booking) => stammgastKeys.has(`${houseIdOf(b.property_id)}|${guestKey(b.email, b.phone, b.guest_name)}`),
    [stammgastKeys],
  );

  return { isStammgast, isLoading: bookingsLoading || guestsLoading };
}
