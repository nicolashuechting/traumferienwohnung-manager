import { useMemo } from "react";
import { useBookings } from "@/hooks/useBookings";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useNotificationSnoozes } from "@/hooks/useNotificationSnoozes";
import {
  computeNotifications, groupNotificationsByBooking, DEFAULT_NOTIFICATION_SETTINGS,
  type AppNotification, type BookingNotificationGroup,
} from "@/lib/notifications";
import type { Booking, NotificationSettings } from "@/types";

// Kombiniert Buchungen + Schwellenwerte + Snoozes zur aktuellen Benachrichtigungsliste.
// Alle drei Quellen laufen über React Query — hier keine eigene Fetch-Logik, nur
// Zusammenführung, damit Sidebar-Badge und /notifications-Seite denselben,
// gecachten Stand nutzen statt getrennt zu berechnen. `groups` fasst mehrere
// gleichzeitig zutreffende Regeln derselben Buchung zu einer Zeile zusammen (siehe
// groupNotificationsByBooking) — Sidebar-Badge und Listen-Header zählen bewusst
// Buchungen (Gruppen), nicht einzelne Regeln, damit die Zahl zur Zeilenanzahl passt.
export function useNotifications(): {
  notifications: AppNotification[];
  groups: BookingNotificationGroup[];
  bookingsById: Map<string, Booking>;
  settings: NotificationSettings;
  isLoading: boolean;
} {
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings();
  const { data: settings = DEFAULT_NOTIFICATION_SETTINGS, isLoading: settingsLoading } = useNotificationSettings();
  const { data: snoozes = [], isLoading: snoozesLoading } = useNotificationSnoozes();

  const notifications = useMemo(
    () => computeNotifications(bookings, settings, snoozes),
    [bookings, settings, snoozes],
  );
  const groups = useMemo(() => groupNotificationsByBooking(notifications), [notifications]);
  const bookingsById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);

  return { notifications, groups, bookingsById, settings, isLoading: bookingsLoading || settingsLoading || snoozesLoading };
}
