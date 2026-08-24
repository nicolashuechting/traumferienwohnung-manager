import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, PartyPopper } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { useUserRole } from "@/hooks/useUserRole";
import { properties } from "@/lib/properties";
import { NotificationDetailPanel } from "@/components/NotificationDetailPanel";
import { RULE_LABELS, type BookingNotificationGroup } from "@/lib/notifications";
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
  group, booking, active, onClick,
}: {
  group: BookingNotificationGroup;
  booking: Booking;
  active: boolean;
  onClick: () => void;
}) {
  const prop = properties.find((p) => p.id === booking.property_id);
  const dotColor = group.urgency === "overdue" ? "#dc2626" : "#d97706";
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
      <p className="text-xs text-gray-700 mt-1 truncate">{group.primary.reason}</p>
      {group.others.length > 0 && (
        <p className="text-xs text-gray-400 mt-0.5">
          +{group.others.length} weitere{group.others.length === 1 ? "r Punkt" : " Punkte"}
          {" · "}{group.others.map((n) => RULE_LABELS[n.ruleKey]).join(", ")}
        </p>
      )}
    </button>
  );
}

export function Notifications() {
  const { groups, bookingsById, settings, isLoading } = useNotifications();
  const { isViewer } = useUserRole();
  const [houseFilter, setHouseFilter] = useState<HouseFilter>("Haus Anne");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const filtered = useMemo(() => {
    if (houseFilter === "all") return groups;
    return groups.filter((g) => {
      const b = bookingsById.get(g.bookingId);
      const house = properties.find((p) => p.id === b?.property_id)?.house;
      return house === houseFilter;
    });
  }, [groups, bookingsById, houseFilter]);

  const overdue = filtered.filter((g) => g.urgency === "overdue");
  const soon = filtered.filter((g) => g.urgency === "soon");

  // Bei erstem Laden bzw. sobald die ausgewählte Zeile verschwindet (Aktion erledigt,
  // Snooze gesetzt, Haus-Filter gewechselt) automatisch zur obersten (dringendsten)
  // Zeile springen, damit die rechte Spalte nie unnötig leer wirkt.
  useEffect(() => {
    if (selectedBookingId && filtered.some((g) => g.bookingId === selectedBookingId)) return;
    setSelectedBookingId(filtered[0]?.bookingId ?? null);
  }, [filtered, selectedBookingId]);

  const selectedGroup = filtered.find((g) => g.bookingId === selectedBookingId) ?? null;
  const selectedBooking = selectedGroup ? bookingsById.get(selectedGroup.bookingId) : undefined;

  const handleSelect = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setMobileDetailOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Benachrichtigungen</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {filtered.length} Buchung{filtered.length !== 1 ? "en" : ""} mit offenen Punkten
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
                {overdue.map((g) => {
                  const b = bookingsById.get(g.bookingId);
                  if (!b) return null;
                  return <NotificationRow key={g.bookingId} group={g} booking={b} active={g.bookingId === selectedBookingId} onClick={() => handleSelect(g.bookingId)} />;
                })}
              </div>
            )}
            {soon.length > 0 && (
              <div>
                <p className="px-4 py-2 text-xs font-semibold text-amber-600 uppercase tracking-wide bg-amber-50 sticky top-0">
                  Bald fällig ({soon.length})
                </p>
                {soon.map((g) => {
                  const b = bookingsById.get(g.bookingId);
                  if (!b) return null;
                  return <NotificationRow key={g.bookingId} group={g} booking={b} active={g.bookingId === selectedBookingId} onClick={() => handleSelect(g.bookingId)} />;
                })}
              </div>
            )}
          </div>

          {/* Detail */}
          <div className={`flex-1 min-w-0 bg-white overflow-hidden flex flex-col ${mobileDetailOpen ? "flex" : "hidden md:flex"}`}>
            {selectedGroup && selectedBooking ? (
              <>
                <button
                  onClick={() => setMobileDetailOpen(false)}
                  className="md:hidden flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-100"
                >
                  <ArrowLeft className="w-4 h-4" /> Zurück zur Liste
                </button>
                <NotificationDetailPanel
                  group={selectedGroup}
                  booking={selectedBooking}
                  isViewer={isViewer}
                  settings={settings}
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
    </div>
  );
}
