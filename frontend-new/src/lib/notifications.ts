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
