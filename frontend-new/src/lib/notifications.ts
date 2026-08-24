import type { Booking, BookingStatus, NotificationRuleKey, NotificationSettings, NotificationSnooze, NotificationUrgency } from "@/types";

// Keine dauerhaft gespeicherten Benachrichtigungs-Objekte — computeNotifications()
// leitet den kompletten Zustand bei jedem Aufruf live aus den Buchungen ab. Eine
// Benachrichtigung verschwindet dadurch automatisch, sobald sich die zugrunde
// liegende Bedingung ändert (z.B. is_paid wird true), ohne dass irgendwo ein
// zweiter Datensatz synchron gehalten werden müsste.

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  vertragOffenTage: 7,
  zahlungOffenTage: 14,
  reservierungOffenTage: 5,
  anfrageOffenTage: 5,
  anreiseBaldTage: 10,
};

export const RULE_LABELS: Record<NotificationRuleKey, string> = {
  vertrag_offen: "Vertrag nicht zurück",
  zahlung_offen: "Zahlung fehlt vor Anreise",
  reservierung_offen: "Reservierung unbestätigt",
  anfrage_offen: "Anfrage hängt",
  anreise_bald_unfertig: "Anreise bald, Buchung noch nicht fertig",
  preis_fehlt: "Preis fehlt",
};

export interface AppNotification {
  id: string; // `${bookingId}_${ruleKey}`
  bookingId: string;
  ruleKey: NotificationRuleKey;
  urgency: NotificationUrgency;
  reason: string;    // Klartext-Grund für die Detailansicht/Zeile
  sortValue: number; // höher = dringender — Sortierung innerhalb der Dringlichkeitsgruppe
}

function fmtDays(n: number): string {
  return `${n} Tag${n === 1 ? "" : "e"}`;
}

// Tage seit einem ISO-Zeitstempel (nicht nur Datum) — für status_changed_at.
function daysSince(iso: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

// Lokale Tagesdifferenz zu einem "YYYY-MM-DD"-Datum (z.B. check_in) — bewusst kein
// toISOString(), das verschiebt in Zeitzonen mit positivem UTC-Offset (Deutschland)
// um einen Tag (siehe bookingDrag.ts). Positiv = liegt in der Zukunft.
function daysUntil(dateISO: string): number | null {
  if (!dateISO) return null;
  const target = new Date(dateISO + "T00:00:00").getTime();
  if (!Number.isFinite(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86400000);
}

// ── Regeln ────────────────────────────────────────────────────────────────────
// Jede Regel: Buchung + Settings → Benachrichtigung oder null. Regeln 1/3/4 haben
// als Grundbedingung bereits die harte Tagesschwelle — sobald sie erscheinen, sind
// sie also per Definition "überfällig" (rot), es gibt für sie keine Vorwarnstufe.
// Regeln 2/5/6 haben ein breiteres Zeitfenster (Tage vor Anreise) und splitten sich
// darin selbst in "bald fällig" vs. "überfällig".

function ruleVertragOffen(b: Booking, s: NotificationSettings): AppNotification | null {
  if (b.status !== "bestaetigt") return null;
  const days = daysSince(b.status_changed_at);
  if (days === null || days < s.vertragOffenTage) return null;
  return {
    id: `${b.id}_vertrag_offen`, bookingId: b.id, ruleKey: "vertrag_offen",
    urgency: "overdue", reason: `Vertrag seit ${fmtDays(days)} nicht zurück`, sortValue: days,
  };
}

function ruleReservierungOffen(b: Booking, s: NotificationSettings): AppNotification | null {
  if (b.status !== "reserviert") return null;
  const days = daysSince(b.status_changed_at);
  if (days === null || days < s.reservierungOffenTage) return null;
  return {
    id: `${b.id}_reservierung_offen`, bookingId: b.id, ruleKey: "reservierung_offen",
    urgency: "overdue", reason: `Reservierung seit ${fmtDays(days)} unbeantwortet`, sortValue: days,
  };
}

function ruleAnfrageOffen(b: Booking, s: NotificationSettings): AppNotification | null {
  if (b.status !== "anfrage") return null;
  const days = daysSince(b.status_changed_at);
  if (days === null || days < s.anfrageOffenTage) return null;
  return {
    id: `${b.id}_anfrage_offen`, bookingId: b.id, ruleKey: "anfrage_offen",
    urgency: "overdue", reason: `Anfrage seit ${fmtDays(days)} unbeantwortet`, sortValue: days,
  };
}

function ruleZahlungOffen(b: Booking, s: NotificationSettings): AppNotification | null {
  if (b.is_paid || b.status === "storniert" || b.status === "abgeschlossen") return null;
  const days = daysUntil(b.check_in);
  if (days === null || days > s.zahlungOffenTage) return null;
  const urgency: NotificationUrgency = days <= Math.floor(s.zahlungOffenTage / 2) ? "overdue" : "soon";
  const reason = days < 0 ? `Zahlung fehlt, Anreise war vor ${fmtDays(-days)}`
    : days === 0 ? "Zahlung fehlt, Anreise ist heute"
    : `Zahlung fehlt, Anreise in ${fmtDays(days)}`;
  return { id: `${b.id}_zahlung_offen`, bookingId: b.id, ruleKey: "zahlung_offen", urgency, reason, sortValue: -days };
}

const SAFE_STATUSES_FOR_ANREISE: BookingStatus[] = ["vertrag_unterschrieben", "bezahlt", "abgeschlossen", "storniert"];

function ruleAnreiseBaldUnfertig(b: Booking, s: NotificationSettings): AppNotification | null {
  if (SAFE_STATUSES_FOR_ANREISE.includes(b.status)) return null;
  const days = daysUntil(b.check_in);
  if (days === null || days > s.anreiseBaldTage) return null;
  const urgency: NotificationUrgency = days <= 3 ? "overdue" : "soon";
  const reason = days < 0 ? `Anreise war vor ${fmtDays(-days)}, Buchung noch nicht abgeschlossen`
    : days === 0 ? "Anreise ist heute, Buchung noch nicht abgeschlossen"
    : `Anreise in ${fmtDays(days)}, Buchung noch nicht abgeschlossen`;
  return { id: `${b.id}_anreise_bald_unfertig`, bookingId: b.id, ruleKey: "anreise_bald_unfertig", urgency, reason, sortValue: -days };
}

const PRICE_OK_STATUSES: BookingStatus[] = ["bestaetigt", "vertrag_unterschrieben", "bezahlt", "abgeschlossen"];

function rulePreisFehlt(b: Booking): AppNotification | null {
  if (b.price > 0 || !PRICE_OK_STATUSES.includes(b.status)) return null;
  // Kein eigener Zeitbezug in der Regel selbst — Dringlichkeit richtet sich, wie bei
  // der Anreise-Regel, danach wie nah der Check-in ist.
  const days = daysUntil(b.check_in);
  const urgency: NotificationUrgency = days !== null && days <= 3 ? "overdue" : "soon";
  return { id: `${b.id}_preis_fehlt`, bookingId: b.id, ruleKey: "preis_fehlt", urgency, reason: "Preis fehlt trotz bestätigter Buchung", sortValue: days !== null ? -days : 0 };
}

const RULES: Array<(b: Booking, s: NotificationSettings) => AppNotification | null> = [
  ruleVertragOffen, ruleZahlungOffen, ruleReservierungOffen, ruleAnfrageOffen, ruleAnreiseBaldUnfertig, rulePreisFehlt,
];

export function computeNotifications(
  bookings: Booking[],
  settings: NotificationSettings,
  snoozes: NotificationSnooze[],
): AppNotification[] {
  const snoozeMap = new Map(snoozes.map((s) => [`${s.bookingId}_${s.ruleKey}`, s]));
  const now = Date.now();

  const result: AppNotification[] = [];
  for (const b of bookings) {
    if (b.status === "storniert") continue;
    for (const rule of RULES) {
      const n = rule(b, settings);
      if (!n) continue;
      const snooze = snoozeMap.get(n.id);
      if (snooze && new Date(snooze.snoozedUntil).getTime() > now) continue;
      result.push(n);
    }
  }

  result.sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency === "overdue" ? -1 : 1;
    return b.sortValue - a.sortValue;
  });
  return result;
}

// ── Regel-Priorität für die Hauptdiagnose einer Buchung ────────────────────────
// Niedrigere Zahl = ursächlicher/aussagekräftiger. anreise_bald_unfertig ist bewusst
// immer letzte Stelle: es ist nur eine Eskalationsstufe/Verstärkung eines der anderen
// Probleme (die Anreise rückt näher), nie selbst die eigentliche Ursache. Die übrigen
// fünf Regeln folgen grob dem natürlichen Buchungsablauf (anfrage → reserviert →
// bestätigt/vertrag_offen → zahlung_offen) — je früher im Ablauf das Problem hängt,
// desto ursächlicher ist es für alles, was danach (scheinbar) noch dranhängt.
export const RULE_PRIORITY: Record<NotificationRuleKey, number> = {
  anfrage_offen: 1,
  reservierung_offen: 2,
  vertrag_offen: 3,
  zahlung_offen: 4,
  preis_fehlt: 5,
  anreise_bald_unfertig: 6,
};

export const RULE_DIAGNOSIS: Record<NotificationRuleKey, string> = {
  anfrage_offen: "Diese Anfrage wurde nie beantwortet.",
  reservierung_offen: "Die Reservierung wartet noch auf eine Rückmeldung des Gasts.",
  vertrag_offen: "Der Vertrag wurde verschickt, ist aber noch nicht unterschrieben zurück.",
  zahlung_offen: "Die Zahlung für diese Buchung fehlt noch.",
  preis_fehlt: "Für diese Buchung wurde noch kein Preis hinterlegt.",
  anreise_bald_unfertig: "Die Anreise rückt näher, aber die Buchung ist noch nicht abgeschlossen.",
};

export const RULE_RECOMMENDATION: Record<NotificationRuleKey, string> = {
  anfrage_offen: "Jetzt antworten oder die Anfrage abschließen, falls sie erledigt ist.",
  reservierung_offen: "Beim Gast nachfragen, ob noch Interesse an der Buchung besteht.",
  vertrag_offen: "Beim Gast nachfassen, ob der Vertrag unterschrieben zurückkommt.",
  zahlung_offen: "Zahlungseingang prüfen oder den Gast an die Zahlung erinnern.",
  preis_fehlt: "Preis eintragen, damit die Buchung vollständig ist.",
  anreise_bald_unfertig: "Prüfen, was vor der Anreise noch erledigt werden muss.",
};

// Eine Zeile pro Buchung statt pro Regel: mehrere gleichzeitig zutreffende Regeln
// für dieselbe Buchung werden zu einer Gruppe zusammengefasst. `primary` ist die laut
// RULE_PRIORITY ursächlichste Regel (nicht die zufällig zuerst gefundene) und liefert
// die Hauptdiagnose; `others` sind die übrigen, als Zusatzpunkte gezeigten Regeln. Die
// Dringlichkeit der Gruppe richtet sich nach der dringendsten zutreffenden Regel, nicht
// nur nach der Hauptdiagnose.
export interface BookingNotificationGroup {
  bookingId: string;
  primary: AppNotification;
  others: AppNotification[];
  urgency: NotificationUrgency;
  sortValue: number;
}

export function groupNotificationsByBooking(notifications: AppNotification[]): BookingNotificationGroup[] {
  const byBooking = new Map<string, AppNotification[]>();
  for (const n of notifications) {
    const list = byBooking.get(n.bookingId);
    if (list) list.push(n);
    else byBooking.set(n.bookingId, [n]);
  }

  const groups: BookingNotificationGroup[] = [];
  for (const [bookingId, list] of byBooking) {
    const sorted = [...list].sort((a, b) => RULE_PRIORITY[a.ruleKey] - RULE_PRIORITY[b.ruleKey]);
    groups.push({
      bookingId,
      primary: sorted[0],
      others: sorted.slice(1),
      urgency: list.some((n) => n.urgency === "overdue") ? "overdue" : "soon",
      sortValue: Math.max(...list.map((n) => n.sortValue)),
    });
  }

  groups.sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency === "overdue" ? -1 : 1;
    return b.sortValue - a.sortValue;
  });
  return groups;
}

// Kurze, kombinationsabhängige Einordnungshilfen (reiner Text, keine Aktionen) — max. 2,
// damit die Detailansicht nicht überladen wirkt. `daysUntil` hier bewusst dupliziert statt
// exportiert: bleibt eine private Detailrechnung dieser Datei, wie auch bei den Regeln oben.
export function contextualTips(group: BookingNotificationGroup, booking: Booking, settings: NotificationSettings): string[] {
  const ruleKeys = new Set([group.primary.ruleKey, ...group.others.map((o) => o.ruleKey)]);
  const days = daysUntil(booking.check_in);
  const tips: string[] = [];

  if ((ruleKeys.has("anfrage_offen") || ruleKeys.has("reservierung_offen")) && days !== null && days < 0) {
    tips.push("Diese Buchung kam vermutlich nie zustande — prüfen, ob sie storniert oder gelöscht werden kann.");
  }
  if (ruleKeys.has("vertrag_offen") && days !== null && days > settings.anreiseBaldTage) {
    tips.push("Kurz beim Gast nachfragen, ob noch Interesse an der Buchung besteht.");
  }
  if (ruleKeys.has("zahlung_offen") && days !== null && days >= 0 && days <= 3) {
    tips.push("Die Anreise ist nah — die Zahlung sollte dringend geklärt werden.");
  }

  return tips.slice(0, 2);
}
