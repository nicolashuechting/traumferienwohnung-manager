import { useMemo } from "react";
import { useBookings } from "@/hooks/useBookings";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useNotificationSnoozes } from "@/hooks/useNotificationSnoozes";
import { computeNotifications, DEFAULT_NOTIFICATION_SETTINGS, type AppNotification } from "@/lib/notifications";
import type { Booking } from "@/types";

// Kombiniert Buchungen + Schwellenwerte + Snoozes zur aktuellen Benachrichtigungsliste.
// Alle drei Quellen laufen über React Query — hier keine eigene Fetch-Logik, nur
// Zusammenführung, damit Sidebar-Badge und /notifications-Seite denselben,
// gecachten Stand nutzen statt getrennt zu berechnen.
export function useNotifications(): { notifications: AppNotification[]; bookingsById: Map<string, Booking>; isLoading: boolean } {
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings();
  const { data: settings = DEFAULT_NOTIFICATION_SETTINGS, isLoading: settingsLoading } = useNotificationSettings();
  const { data: snoozes = [], isLoading: snoozesLoading } = useNotificationSnoozes();

  const notifications = useMemo(
    () => computeNotifications(bookings, settings, snoozes),
    [bookings, settings, snoozes],
  );
  const bookingsById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);

  return { notifications, bookingsById, isLoading: bookingsLoading || settingsLoading || snoozesLoading };
}
