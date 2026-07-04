import { useMemo, useState } from "react";
import { Star, Mail, Phone, Search, X, ChevronDown, ChevronUp, Calendar, Moon, Home, Hash, Trash2 } from "lucide-react";
import { useBookings, useSoftDeleteBooking } from "@/hooks/useBookings";
import { BookingModal } from "@/components/BookingModal";
import { properties } from "@/lib/properties";
import { statusConfig } from "@/lib/bookingStatus";
import type { Booking } from "@/types";

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(iso: string) {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
function nights(ci: string, co: string) {
  return Math.max(0, Math.round(
    (new Date(co + "T00:00:00").getTime() - new Date(ci + "T00:00:00").getTime()) / 86400000
  ));
}
function propName(id: string) {
  return properties.find((p) => p.id === id)?.name ?? id;
}

/** Deduplizierungs-Key: Telefon oder E-Mail wenn vorhanden, sonst Name (lowercase) */
function guestKey(contact: string, name: string): string {
  const c = (contact ?? "").trim();
  if (c) return c.toLowerCase();
  return `__name__${name.toLowerCase().trim()}`;
}

interface GuestRecord {
  key: string;
  name: string;
  contact: string;
  totalBookings: number;
  lastStay: string; // ISO
  apartments: Set<string>;
  bookingList: Booking[];
}

// ── Buchungs-Detailzeile ──────────────────────────────────────────────────────
function BookingRow({ b, onOpen }: { b: Booking; onOpen: (b: Booking) => void }) {
  const n = nights(b.check_in, b.check_out);
  return (
    <div
      onClick={() => onOpen(b)}
      role="button"
      className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 text-sm -mx-2 px-2 rounded-lg cursor-pointer hover:bg-white transition"
    >
      <div className="flex items-center gap-1 w-36 flex-shrink-0">
        {b.booking_number
          ? <span className="font-mono text-xs font-semibold text-blue-700 truncate">{b.booking_number}</span>
          : <span className="text-xs text-gray-300">ohne Nr.</span>}
      </div>
      <div className="flex items-center gap-1.5 w-32 flex-shrink-0 text-gray-700">
        <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span>{fmt(b.check_in)}</span>
      </div>
      <div className="flex items-center gap-1 w-16 flex-shrink-0 text-gray-500">
        <Moon className="w-3.5 h-3.5 text-gray-400" />
        <span>{n} N.</span>
      </div>
      <div className="flex items-center gap-1 flex-1 min-w-0 text-gray-500 truncate">
        <Home className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span className="truncate">{propName(b.property_id)}</span>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        {b.price > 0 && (
          <span className="text-xs font-semibold text-gray-700">{b.price.toLocaleString("de-DE")} €</span>
        )}
        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${statusConfig(b.status).badgeClass}`}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusConfig(b.status).dotColor }} />
          {statusConfig(b.status).label}
        </span>
      </div>
    </div>
  );
}

// ── Gast-Karte ────────────────────────────────────────────────────────────────
function GuestCard({ g, onOpenBooking }: { g: GuestRecord; onOpenBooking: (b: Booking) => void }) {
  const [open, setOpen] = useState(false);
  const softDelete = useSoftDeleteBooking();
  const sorted = [...g.bookingList].sort((a, b) => b.check_in.localeCompare(a.check_in));
  const isReturning = g.totalBookings >= 2;
  const numbers = sorted.map((b) => b.booking_number).filter(Boolean);

  async function handleDeleteGuest(e: React.MouseEvent) {
    e.stopPropagation();
    const ok = window.confirm(
      `Alle ${g.totalBookings} Buchung${g.totalBookings !== 1 ? "en" : ""} von ${g.name} in den Papierkorb verschieben? Du kannst sie dort einzeln wiederherstellen.`,
    );
    if (!ok) return;
    await Promise.all(g.bookingList.map((b) => softDelete.mutateAsync(b.id)));
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-blue-200 transition overflow-hidden">
      {/* Header row — clickable */}
      <button
        className="w-full text-left p-5"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-sm font-semibold text-gray-900">{g.name}</h3>
              {isReturning && (
                <span title="Stammgast" className="flex items-center gap-0.5 text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />Stammgast
                </span>
              )}
            </div>

            {g.contact && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                {g.contact.includes("@")
                  ? <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                  : <Phone className="w-3.5 h-3.5 flex-shrink-0" />}
                <span className="truncate">{g.contact}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-1">
              <span>Wohnungen: {[...g.apartments].join(", ")}</span>
              <span>·</span>
              <span>Letzter Aufenthalt: {fmt(g.lastStay)}</span>
            </div>
            {numbers.length > 0 && (
              <div className="flex items-start gap-1.5 text-xs text-gray-500 mt-1 min-w-0">
                <Hash className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <span className="font-mono truncate">{numbers.join(", ")}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 ml-4 flex-shrink-0">
            <div className="text-right">
              <p className="text-2xl font-bold text-blue-600">{g.totalBookings}</p>
              <p className="text-xs text-gray-500">Buchung{g.totalBookings !== 1 ? "en" : ""}</p>
            </div>
            <button
              onClick={handleDeleteGuest}
              title="Alle Buchungen dieses Gasts in den Papierkorb verschieben"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {open
              ? <ChevronUp className="w-4 h-4 text-gray-400" />
              : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </div>
      </button>

      {/* Buchungs-Liste */}
      {open && (
        <div className="px-5 pb-4 border-t border-gray-100 bg-gray-50/50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">
            Buchungshistorie
          </p>
          {sorted.map((b) => <BookingRow key={b.id} b={b} onOpen={onOpenBooking} />)}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function Guests() {
  const { data: bookings = [], isLoading } = useBookings();
  const [search, setSearch] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  function openBooking(b: Booking) {
    setSelectedBooking(b);
    setModalOpen(true);
  }

  const guests: GuestRecord[] = useMemo(() => {
    const map = new Map<string, GuestRecord>();
    bookings.forEach((b) => {
      const key = guestKey(b.contact_info, b.guest_name);
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: b.guest_name,
          contact: b.contact_info ?? "",
          totalBookings: 0,
          lastStay: b.check_in,
          apartments: new Set(),
          bookingList: [],
        });
      }
      const g = map.get(key)!;
      g.totalBookings++;
      if (b.check_in > g.lastStay) g.lastStay = b.check_in;
      g.apartments.add(propName(b.property_id));
      g.bookingList.push(b);
    });
    return [...map.values()].sort((a, b) => b.totalBookings - a.totalBookings);
  }, [bookings]);

  const filtered = useMemo(() => {
    if (!search.trim()) return guests;
    const q = search.toLowerCase();
    return guests.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.contact.toLowerCase().includes(q) ||
        g.bookingList.some((b) => (b.booking_number ?? "").toLowerCase().includes(q)),
    );
  }, [guests, search]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Gäste</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {filtered.length} {search ? "gefunden" : "verschiedene Gäste"}
              {guests.filter((g) => g.totalBookings >= 2).length > 0 && !search && (
                <span className="ml-2 text-amber-600 font-medium">
                  · {guests.filter((g) => g.totalBookings >= 2).length} Stammgäste
                </span>
              )}
            </p>
          </div>

          {/* Suche */}
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, Buchungsnr. oder Kontakt suchen…"
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400">{search ? "Keine Gäste gefunden." : "Noch keine Gäste vorhanden."}</p>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {filtered.map((g) => <GuestCard key={g.key} g={g} onOpenBooking={openBooking} />)}
          </div>
        )}
      </div>

      <BookingModal
        open={modalOpen}
        booking={selectedBooking}
        onClose={() => { setModalOpen(false); setSelectedBooking(null); }}
      />
    </div>
  );
}
