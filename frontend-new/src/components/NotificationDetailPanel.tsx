import { useState } from "react";
import { Clock, Mail, Lightbulb } from "lucide-react";
import { useSetNotificationSnooze } from "@/hooks/useNotificationSnoozes";
import { BookingModal } from "@/components/BookingModal";
import {
  RULE_LABELS, RULE_DIAGNOSIS, RULE_RECOMMENDATION, contextualTips,
  type BookingNotificationGroup,
} from "@/lib/notifications";
import type { Booking, NotificationSettings } from "@/types";

// Bewusst großzügig: booking.email/phone sind bereits die bestmöglich aufgelösten
// Felder (siehe splitContact() in useBookings.ts, contact_info ist nur noch ein
// Altfeld-Fallback dafür) — hier nur noch eine leichte Formatprüfung, kein Neuraten.
function isLikelyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

interface Props {
  group: BookingNotificationGroup;
  booking: Booking;
  isViewer: boolean;
  settings: NotificationSettings;
}

export function NotificationDetailPanel({ group, booking, isViewer, settings }: Props) {
  const snooze = useSetNotificationSnooze();
  const [error, setError] = useState("");

  const { primary, others } = group;
  const tips = contextualTips(group, booking, settings);
  const email = booking.email.trim();
  const hasEmail = isLikelyEmail(email);

  // Snoozt alle aktuell zutreffenden Regeln dieser Buchung gemeinsam — bei nur einer
  // Zeile pro Buchung (statt pro Regel) würde ein Snooze nur der Hauptdiagnose sonst
  // sofort eine der anderen Regeln als neue Hauptdiagnose nach vorne holen und die
  // Zeile bliebe unverändert sichtbar, was sich wie ein wirkungsloser Klick anfühlen würde.
  const handleSnooze = async (days: number) => {
    if (isViewer) return;
    setError("");
    const ruleKeys = [primary.ruleKey, ...others.map((o) => o.ruleKey)];
    try {
      await Promise.all(ruleKeys.map((ruleKey) => snooze.mutateAsync({ bookingId: booking.id, ruleKey, days })));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-5 pb-4 space-y-3 border-b border-gray-100 flex-shrink-0 overflow-y-auto max-h-[45%]">
        {/* Diagnose + Handlungsempfehlung */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1.5">
          <p className="text-sm font-semibold text-amber-900">{RULE_DIAGNOSIS[primary.ruleKey]}</p>
          <p className="text-xs text-amber-700">{primary.reason}</p>
          <p className="text-sm text-amber-800 pt-0.5">
            <span className="font-medium">Empfehlung:</span> {RULE_RECOMMENDATION[primary.ruleKey]}
          </p>
          {others.length > 0 && (
            <ul className="pt-1.5 mt-1 border-t border-amber-200/70 space-y-0.5">
              {others.map((n) => (
                <li key={n.id} className="text-xs text-amber-700">
                  + {RULE_LABELS[n.ruleKey]}: {n.reason}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Kontakt */}
        {hasEmail && (
          <div className="flex flex-wrap gap-2">
            <a
              href={`mailto:${email}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition"
            >
              <Mail className="w-3.5 h-3.5" /> E-Mail schreiben
            </a>
          </div>
        )}

        {/* Tipps */}
        {tips.length > 0 && (
          <div className="space-y-1">
            {tips.map((t, i) => (
              <p key={i} className="flex items-start gap-1.5 text-xs text-gray-500">
                <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
                <span>{t}</span>
              </p>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>
        )}

        {!isViewer && (
          <div className="flex items-center gap-2 pt-1">
            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500 mr-1">Später erinnern:</span>
            <button
              type="button" disabled={snooze.isPending} onClick={() => handleSnooze(3)}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition disabled:opacity-50"
            >
              In 3 Tagen
            </button>
            <button
              type="button" disabled={snooze.isPending} onClick={() => handleSnooze(7)}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition disabled:opacity-50"
            >
              In 7 Tagen
            </button>
          </div>
        )}
      </div>

      {/* Dieselbe Bearbeitungsansicht wie beim Klick auf einen Kalenderbalken — nur
          eingebettet statt als zentriertes Overlay (siehe BookingModal variant="embedded"). */}
      <div className="flex-1 min-h-0">
        <BookingModal variant="embedded" open booking={booking} onClose={() => {}} />
      </div>
    </div>
  );
}
