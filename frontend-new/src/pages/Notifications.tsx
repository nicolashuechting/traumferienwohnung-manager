import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, PartyPopper } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { useTrashedBookings } from "@/hooks/useBookings";
import { useUserRole } from "@/hooks/useUserRole";
import { properties } from "@/lib/properties";
import { NotificationDetailPanel } from "@/components/NotificationDetailPanel";
import { BookingModal } from "@/components/BookingModal";
import type { AppNotification } from "@/lib/notifications";
import type { Booking } from "@/types";

// Bewusst andere Reihenfolge/Vorauswahl als bei Kalender/Analysen (dort "Alle"
// zuerst) — hier ist "Haus Anne" Standard, explizit so gewünscht.
type HouseFilter = "Haus Anne" | "Upstalsboom" | "all";
const HOUSE_OPTIONS: HouseFilter[] = ["Haus Anne", "Upstalsboom", "all"];

function fmtDate(iso: string): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

function NotificationRow({
  n, booking, active, onClick,
}: {
  n: AppNotification;
  booking: Booking;
  active: boolean;
  onClick: () => void;
}) {
  const prop = properties.find((p) => p.id === booking.property_id);
  const dotColor = n.urgency === "overdue" ? "#dc2626" : "#d97706";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-l-4 transition
        ${active ? "bg-blue-50 border-l-blue-600" : "border-l-transparent hover:bg-gray-50"}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
        <span className="text-sm font-semibold text-gray-900 truncate">{booking.guest_name || "Unbekannter Gast"}</span>
      </div>
      <p className="text-xs text-gray-500 mt-0.5 truncate">
        {prop?.name ?? booking.property_id} · {fmtDate(booking.check_in)} – {fmtDate(booking.check_out)}
      </p>
      <p className="text-xs text-gray-700 mt-1">{n.reason}</p>
    </button>
  );
}

export function Notifications() {
  const { notifications, bookingsById, isLoading } = useNotifications();
  const { data: trashedBookings = [] } = useTrashedBookings();
  const { isViewer } = useUserRole();
  const [houseFilter, setHouseFilter] = useState<HouseFilter>("Haus Anne");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [fullEditBooking, setFullEditBooking] = useState<Booking | null>(null);

  const filtered = useMemo(() => {
    if (houseFilter === "all") return notifications;
    return notifications.filter((n) => {
      const b = bookingsById.get(n.bookingId);
      const house = properties.find((p) => p.id === b?.property_id)?.house;
      return house === houseFilter;
    });
  }, [notifications, bookingsById, houseFilter]);

  const overdue = filtered.filter((n) => n.urgency === "overdue");
  const soon = filtered.filter((n) => n.urgency === "soon");

  // Bei erstem Laden bzw. sobald die ausgewählte Zeile verschwindet (Aktion erledigt,
  // Snooze gesetzt, Haus-Filter gewechselt) automatisch zur obersten (dringendsten)
  // Zeile springen, damit die rechte Spalte nie unnötig leer wirkt.
  useEffect(() => {
    if (selectedId && filtered.some((n) => n.id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);

  const selected = filtered.find((n) => n.id === selectedId) ?? null;
  const selectedBooking = selected ? bookingsById.get(selected.bookingId) : undefined;
  const otherForSameBooking = selected
    ? filtered.filter((n) => n.bookingId === selected.bookingId && n.id !== selected.id)
    : [];

  const existingNumbers = useMemo(
    () => new Set([...bookingsById.values(), ...trashedBookings].map((b) => b.booking_number).filter(Boolean)),
    [bookingsById, trashedBookings],
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setMobileDetailOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Benachrichtigungen</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {filtered.length} offene Punkt{filtered.length !== 1 ? "e" : ""}
          </p>
        </div>
        <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
          {HOUSE_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setHouseFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap
                ${houseFilter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {f === "all" ? "Alle" : f}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <PartyPopper className="w-10 h-10 text-emerald-400 mb-3" />
          <p className="text-lg font-semibold text-gray-700">Keine offenen Punkte 🎉</p>
          <p className="text-sm text-gray-400 mt-1">Aktuell gibt es nichts, worum du dich kümmern musst.</p>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Liste */}
          <div className={`w-full md:w-[380px] md:flex-shrink-0 border-r border-gray-200 overflow-y-auto bg-white
            ${mobileDetailOpen ? "hidden md:block" : "block"}`}>
            {overdue.length > 0 && (
              <div>
                <p className="px-4 py-2 text-xs font-semibold text-red-600 uppercase tracking-wide bg-red-50 sticky top-0">
                  Überfällig ({overdue.length})
                </p>
                {overdue.map((n) => {
                  const b = bookingsById.get(n.bookingId);
                  if (!b) return null;
                  return <NotificationRow key={n.id} n={n} booking={b} active={n.id === selectedId} onClick={() => handleSelect(n.id)} />;
                })}
              </div>
            )}
            {soon.length > 0 && (
              <div>
                <p className="px-4 py-2 text-xs font-semibold text-amber-600 uppercase tracking-wide bg-amber-50 sticky top-0">
                  Bald fällig ({soon.length})
                </p>
                {soon.map((n) => {
                  const b = bookingsById.get(n.bookingId);
                  if (!b) return null;
                  return <NotificationRow key={n.id} n={n} booking={b} active={n.id === selectedId} onClick={() => handleSelect(n.id)} />;
                })}
              </div>
            )}
          </div>

          {/* Detail */}
          <div className={`flex-1 min-w-0 bg-white overflow-hidden flex flex-col ${mobileDetailOpen ? "flex" : "hidden md:flex"}`}>
            {selected && selectedBooking ? (
              <>
                <button
                  onClick={() => setMobileDetailOpen(false)}
                  className="md:hidden flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-100"
                >
                  <ArrowLeft className="w-4 h-4" /> Zurück zur Liste
                </button>
                <NotificationDetailPanel
                  notification={selected}
                  booking={selectedBooking}
                  otherNotifications={otherForSameBooking}
                  isViewer={isViewer}
                  existingNumbers={existingNumbers}
                  onOpenFull={() => setFullEditBooking(selectedBooking)}
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                Wähle links einen Eintrag aus.
              </div>
            )}
          </div>
        </div>
      )}

      <BookingModal
        open={!!fullEditBooking}
        booking={fullEditBooking}
        onClose={() => setFullEditBooking(null)}
      />
    </div>
  );
}
