import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Clock } from "lucide-react";
import { properties } from "@/lib/properties";
import { STATUS_ORDER, statusConfig } from "@/lib/bookingStatus";
import { confirmStatusTransition, ensureBookingNumberFor } from "@/lib/statusTransition";
import { diffBooking } from "@/lib/bookingHistory";
import { useUpdateBooking } from "@/hooks/useBookings";
import { useSetNotificationSnooze } from "@/hooks/useNotificationSnoozes";
import { RULE_LABELS, type AppNotification } from "@/lib/notifications";
import type { Booking, BookingFormData, BookingStatus } from "@/types";

function fmtDate(iso: string): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

interface Props {
  notification: AppNotification;
  booking: Booking;
  otherNotifications: AppNotification[]; // andere Regeln, die für dieselbe Buchung gerade zutreffen
  isViewer: boolean;
  existingNumbers: Set<string>;
  onOpenFull: () => void;
}

export function NotificationDetailPanel({ notification, booking, otherNotifications, isViewer, existingNumbers, onOpenFull }: Props) {
  const update = useUpdateBooking();
  const snooze = useSetNotificationSnooze();
  const [priceInput, setPriceInput] = useState(String(booking.price || ""));
  const [error, setError] = useState("");

  useEffect(() => {
    setPriceInput(String(booking.price || ""));
    setError("");
  }, [booking.id, booking.price]);

  const prop = properties.find((p) => p.id === booking.property_id);
  const persons = booking.adults + booking.children;
  const busy = update.isPending || snooze.isPending;

  const handleStatusChange = async (s: BookingStatus) => {
    if (isViewer || s === booking.status) return;
    if (!confirmStatusTransition(booking.status, s)) return;
    const booking_number = ensureBookingNumberFor(booking.booking_number, booking.property_id, booking.check_in, s, existingNumbers);
    const data: Partial<BookingFormData> = { status: s, booking_number };
    setError("");
    try {
      await update.mutateAsync({ id: booking.id, data, history: { changes: diffBooking(booking, data) } });
    } catch (e) { setError((e as Error).message); }
  };

  const handleMarkPaid = async () => {
    if (isViewer) return;
    const data: Partial<BookingFormData> = { is_paid: true };
    setError("");
    try {
      await update.mutateAsync({ id: booking.id, data, history: { changes: diffBooking(booking, data) } });
    } catch (e) { setError((e as Error).message); }
  };

  const handleSavePrice = async () => {
    if (isViewer) return;
    const price = parseFloat(priceInput.replace(",", ".")) || 0;
    if (price <= 0) { setError("Bitte einen Preis größer 0 eintragen."); return; }
    const data: Partial<BookingFormData> = { price, priceIsManual: true };
    setError("");
    try {
      await update.mutateAsync({ id: booking.id, data, history: { changes: diffBooking(booking, data) } });
    } catch (e) { setError((e as Error).message); }
  };

  const handleSnooze = (days: number) => {
    if (isViewer) return;
    setError("");
    snooze.mutate(
      { bookingId: booking.id, ruleKey: notification.ruleKey, days },
      { onError: (e) => setError((e as Error).message) },
    );
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-5">
      {/* Kopf: Gast, Wohnung, Zeitraum, Status */}
      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-lg font-bold text-gray-900">{booking.guest_name || "Unbekannter Gast"}</h3>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${statusConfig(booking.status).badgeClass}`}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusConfig(booking.status).dotColor }} />
            {statusConfig(booking.status).label}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {prop?.name ?? booking.property_id} · {fmtDate(booking.check_in)} – {fmtDate(booking.check_out)} · {persons} Pers.
          {booking.booking_number && <> · <span className="font-mono">{booking.booking_number}</span></>}
        </p>
      </div>

      {/* Grund */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <p className="text-sm text-amber-800">{notification.reason}</p>
        {otherNotifications.length > 0 && (
          <p className="text-xs text-amber-700 mt-1.5">
            Betrifft außerdem: {otherNotifications.map((n) => RULE_LABELS[n.ruleKey]).join(", ")}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {isViewer && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Nur Ansicht — du kannst hier nichts bearbeiten.
        </p>
      )}

      {/* Aktionen */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ORDER.map((s) => {
              const cfg = statusConfig(s);
              const active = booking.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={isViewer || busy}
                  onClick={() => handleStatusChange(s)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-50
                    ${active ? cfg.badgeClass : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"}`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.dotColor }} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {notification.ruleKey === "zahlung_offen" && !booking.is_paid && (
          <button
            type="button"
            disabled={isViewer || busy}
            onClick={handleMarkPaid}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" /> Als bezahlt markieren
          </button>
        )}

        {notification.ruleKey === "preis_fehlt" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preis (€)</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} step="0.01" disabled={isViewer || busy}
                value={priceInput} onChange={(e) => setPriceInput(e.target.value)}
                className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 disabled:bg-gray-100"
              />
              <button
                type="button" disabled={isViewer || busy} onClick={handleSavePrice}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
              >
                Speichern
              </button>
            </div>
          </div>
        )}

        {!isViewer && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500 mr-1">Später erinnern:</span>
            <button
              type="button" disabled={busy} onClick={() => handleSnooze(3)}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition disabled:opacity-50"
            >
              In 3 Tagen
            </button>
            <button
              type="button" disabled={busy} onClick={() => handleSnooze(7)}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition disabled:opacity-50"
            >
              In 7 Tagen
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenFull}
        className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 pt-2"
      >
        <ExternalLink className="w-3.5 h-3.5" /> Vollständig bearbeiten
      </button>
    </div>
  );
}
