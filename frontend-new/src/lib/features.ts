// Abgeschaltete (aber nicht gelöschte) Funktionen. Zum Wiedereinschalten nur den
// Schalter auf true setzen — der Code dahinter ist vollständig erhalten.

// Import von Buchungen aus externen Portalen per iCal-Feed (Einstellungen → Kalender-
// Synchronisierung, "Sync"-Knopf in der Buchungsliste). Seit Okt. 2026 abgeschaltet:
// Buchungen werden nur noch manuell angelegt, nicht mehr über iCal importiert.
export const ICAL_IMPORT_ENABLED = false;

// Kalenderbalken beginnen/enden je nach gewählter Fähre in einem von 5 Tagesabschnitten.
// Seit Okt. 2026 abgeschaltet: Anreise immer ab 15:00, Abreise immer bis 10:00 —
// die Fährzeit ändert die Balkenlänge nicht mehr (Fährzeiten bleiben in Buchung/PDF erhalten).
export const FERRY_TIMES_IN_CALENDAR = false;
export const FIXED_CHECK_IN_HOUR = 15;
export const FIXED_CHECK_OUT_HOUR = 10;
