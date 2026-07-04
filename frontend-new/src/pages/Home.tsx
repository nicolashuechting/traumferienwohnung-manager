import { useState, useMemo } from "react";
import {
  LogIn, LogOut, Home as HomeIcon, Users, Moon,
  ChevronRight, Clock, Ship,
} from "lucide-react";
import { useBookings } from "@/hooks/useBookings";
import { BookingModal } from "@/components/BookingModal";
import { properties } from "@/lib/properties";
import { statusConfig } from "@/lib/bookingStatus";
import type { Booking } from "@/types";

function StatusChip({ status }: { status: Booking["status"] }) {
  const cfg = statusConfig(status);
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badgeClass}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dotColor }} />
      {cfg.label}
    </span>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────
const TODAY_ISO = new Date().toISOString().split("T")[0];
const IN_30_ISO = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

function propName(id: string) {
  return properties.find((p) => p.id === id)?.name ?? id;
}
function propHouse(id: string) {
  return properties.find((p) => p.id === id)?.house ?? "";
}
function fmt(iso: string) {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
function fmtDay(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("de-DE", { weekday: "short" });
}
function nights(ci: string, co: string) {
  return Math.round(
    (new Date(co + "T00:00:00").getTime() - new Date(ci + "T00:00:00").getTime()) / 86400000,
  );
}
function timeAgo(raw: unknown): string {
  const secs =
    typeof raw === "object" && raw !== null && "seconds" in raw
      ? (raw as { seconds: number }).seconds
      : typeof raw === "string" && raw
        ? Math.floor(new Date(raw).getTime() / 1000)
        : 0;
  if (!secs) return "";
  const diff = Math.floor(Date.now() / 1000) - secs;
  if (diff < 60)   return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  return `vor ${Math.floor(diff / 86400)} Tag${Math.floor(diff / 86400) !== 1 ? "en" : ""}`;
}

// ── event card ────────────────────────────────────────────────────────────────
type EventType = "checkin" | "checkout" | "active";

interface CalEvent {
  type: EventType;
  date: string;
  booking: Booking;
}

function EventCard({ ev, onClick }: { ev: CalEvent; onClick: () => void }) {
  const n = nights(ev.booking.check_in, ev.booking.check_out);
  const persons = ev.booking.adults + ev.booking.children;
  // Relevante Fähre: Anreise → Anreise-Fähre, Abreise/Aktiv → Abreise-Fähre
  const ferryTime = ev.type === "checkin" ? ev.booking.ferry_time : ev.booking.ferry_time_departure;

  const badge =
    ev.type === "checkin"
      ? { label: "Check-in",  cls: "bg-emerald-100 text-emerald-700 border-emerald-200" }
      : ev.type === "checkout"
        ? { label: "Check-out", cls: "bg-gray-100 text-gray-600 border-gray-200" }
        : { label: "Aktiv",     cls: "bg-blue-100 text-blue-700 border-blue-200" };

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${badge.cls}`}>
            {badge.label}
          </span>
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            {ev.type === "checkin"
              ? <LogIn className="w-3.5 h-3.5 text-emerald-500" />
              : <LogOut className="w-3.5 h-3.5 text-gray-400" />}
            <span className="font-medium text-gray-500">{fmtDay(ev.date)}</span>
            <span className="font-semibold text-gray-800">{fmt(ev.date)}</span>
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{persons}</span>
          <span className="flex items-center gap-1"><Moon className="w-3 h-3" />{n}</span>
          <ChevronRight className="w-3.5 h-3.5 group-hover:text-blue-500 transition" />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-4 text-sm flex-wrap">
        <span className="flex items-center gap-1.5 text-gray-700 font-medium">
          <span className="text-gray-400">👤</span> {ev.booking.guest_name}
        </span>
        <span className="flex items-center gap-1.5 text-gray-500">
          <HomeIcon className="w-3.5 h-3.5 text-gray-400" /> {propName(ev.booking.property_id)}
        </span>
        {ferryTime && (
          <span className="flex items-center gap-1.5 text-sky-700 font-medium">
            <Ship className="w-3.5 h-3.5 text-sky-500" /> Fähre {ferryTime} Uhr
          </span>
        )}
        <StatusChip status={ev.booking.status} />
      </div>
    </button>
  );
}

// ── activity item ─────────────────────────────────────────────────────────────
function ActivityItem({ booking, onClick }: { booking: Booking; onClick: () => void }) {
  const ago = timeAgo(booking.created_at);
  const channelInitial = (booking.channel ?? "M")[0].toUpperCase();
  const channelColor =
    booking.channel === "Ferienwohnungen.de" ? "bg-amber-500"
    : booking.channel === "Baltrumdirekt.de"   ? "bg-teal-500"
    : booking.channel === "Airbnb"             ? "bg-rose-500"
    : booking.channel === "Booking.com"        ? "bg-blue-500"
    : "bg-gray-400";

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition group"
    >
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${channelColor}`}>
          {channelInitial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
              Neue Buchung
            </span>
            <StatusChip status={booking.status} />
            <span className="text-xs text-gray-400">{ago}</span>
          </div>
          <p className="text-sm font-medium text-gray-900 mt-1 truncate">{booking.guest_name}</p>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
            <span className="flex items-center gap-1">
              <LogIn className="w-3 h-3" />
              {fmtDay(booking.check_in)} {fmt(booking.check_in)}
            </span>
            <span className="flex items-center gap-1">
              <HomeIcon className="w-3 h-3" />
              {propName(booking.property_id)}
            </span>
            <span className="flex items-center gap-1">
              <Moon className="w-3 h-3" />
              {nights(booking.check_in, booking.check_out)}
            </span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition flex-shrink-0 mt-1" />
      </div>
    </button>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
type HouseFilter = "all" | "Upstalsboom" | "Haus Anne";

export function Home() {
  const { data: bookings = [], isLoading } = useBookings();
  const [houseFilter, setHouseFilter] = useState<HouseFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  function openBooking(b: Booking) {
    setSelectedBooking(b);
    setModalOpen(true);
  }

  // Upcoming events: check-ins and check-outs in next 30 days
  const upcomingEvents = useMemo(() => {
    const events: CalEvent[] = [];
    bookings.forEach((b) => {
      if (houseFilter !== "all" && propHouse(b.property_id) !== houseFilter) return;

      // Check-in in next 30 days
      if (b.check_in >= TODAY_ISO && b.check_in <= IN_30_ISO) {
        events.push({ type: "checkin", date: b.check_in, booking: b });
      }
      // Check-out in next 30 days (but don't double-count same-day check-in/out)
      if (b.check_out >= TODAY_ISO && b.check_out <= IN_30_ISO && b.check_out !== b.check_in) {
        events.push({ type: "checkout", date: b.check_out, booking: b });
      }
      // Currently active (checked in, not yet checked out)
      if (b.check_in < TODAY_ISO && b.check_out > TODAY_ISO) {
        events.push({ type: "active", date: b.check_in, booking: b });
      }
    });
    // Sort: active first, then by date asc
    events.sort((a, b) => {
      if (a.type === "active" && b.type !== "active") return -1;
      if (b.type === "active" && a.type !== "active") return  1;
      return a.date.localeCompare(b.date);
    });
    return events;
  }, [bookings, houseFilter]);

  // Activity feed: last 15 bookings sorted by created_at desc
  const recentActivity = useMemo(() => {
    return [...bookings]
      .sort((a, b) => {
        const ta = typeof a.created_at === "object" && a.created_at !== null
          ? (a.created_at as { seconds: number }).seconds : 0;
        const tb = typeof b.created_at === "object" && b.created_at !== null
          ? (b.created_at as { seconds: number }).seconds : 0;
        return tb - ta;
      })
      .slice(0, 15);
  }, [bookings]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Summary counts
  const checkinCount  = upcomingEvents.filter((e) => e.type === "checkin").length;
  const checkoutCount = upcomingEvents.filter((e) => e.type === "checkout").length;
  const activeCount   = upcomingEvents.filter((e) => e.type === "active").length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Startseite</h2>
          <p className="text-xs text-gray-500 mt-0.5">Übersicht der nächsten 30 Tage</p>
        </div>
        {/* House filter */}
        <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
          {(["all", "Upstalsboom", "Haus Anne"] as HouseFilter[]).map((h) => (
            <button
              key={h}
              onClick={() => setHouseFilter(h)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap
                ${houseFilter === h ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {h === "all" ? "Alle Häuser" : h}
            </button>
          ))}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">

        {/* ── Left: Upcoming events ─────────────────────────────────────────── */}
        <div className="flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
            <h3 className="text-base font-semibold text-gray-900">Nächste Gäste</h3>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {activeCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  {activeCount} aktiv
                </span>
              )}
              <span className="flex items-center gap-1">
                <LogIn className="w-3 h-3 text-emerald-500" />
                {checkinCount} Check-in{checkinCount !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <LogOut className="w-3 h-3 text-gray-400" />
                {checkoutCount} Check-out{checkoutCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {upcomingEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
                <Clock className="w-8 h-8 text-gray-300" />
                <p className="text-sm font-medium">Keine anstehenden Gäste</p>
                <p className="text-xs">in den nächsten 30 Tagen</p>
              </div>
            ) : (
              upcomingEvents.map((ev, i) => (
                <EventCard key={`${ev.booking.id}-${ev.type}-${i}`} ev={ev} onClick={() => openBooking(ev.booking)} />
              ))
            )}
          </div>
        </div>

        {/* ── Right: Activity feed ──────────────────────────────────────────── */}
        <div className="flex flex-col overflow-hidden bg-white">
          <div className="px-4 py-4 border-b border-gray-100 flex-shrink-0">
            <h3 className="text-base font-semibold text-gray-900">Letzte Aktivitäten</h3>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {recentActivity.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                Noch keine Buchungen
              </div>
            ) : (
              recentActivity.map((b) => (
                <ActivityItem key={b.id} booking={b} onClick={() => openBooking(b)} />
              ))
            )}
          </div>
        </div>
      </div>

      <BookingModal
        open={modalOpen}
        booking={selectedBooking}
        onClose={() => { setModalOpen(false); setSelectedBooking(null); }}
      />
    </div>
  );
}
