import { useState, useMemo, useRef, useEffect } from "react";
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  Plus, SlidersHorizontal, X, Home, CalendarRange, ChevronDown as ChevDown,
  RefreshCw, Mail,
} from "lucide-react";
import { useBookings } from "@/hooks/useBookings";
import { useIcalFeeds, useSyncIcalFeeds } from "@/hooks/useIcalFeeds";
import { useGuests } from "@/hooks/useGuests";
import { useUserRole } from "@/hooks/useUserRole";
import { BookingModal } from "@/components/BookingModal";
import { properties } from "@/lib/properties";
import { statusConfig } from "@/lib/bookingStatus";
import type { Booking } from "@/types";

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Booking["status"] }) {
  const cfg = statusConfig(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.badgeClass}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dotColor }} />
      {cfg.label}
    </span>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────
type SortKey = "check_in" | "check_out" | "guest_name" | "property_id" | "price";
type SortDir = "asc" | "desc";
interface Sort { key: SortKey; dir: SortDir }
interface Filters { paid: "all" | "paid" | "unpaid"; search: string }

// ── Helpers ────────────────────────────────────────────────────────────────────
function propName(id: string) {
  return properties.find((p) => p.id === id)?.name ?? id;
}
function fmt(dateStr: string) {
  if (!dateStr) return "–";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}
function toISO(d: Date) { return d.toISOString().split("T")[0]; }
function nights(ci: string, co: string) {
  return Math.round((new Date(co + "T00:00:00").getTime() - new Date(ci + "T00:00:00").getTime()) / 86400000);
}

// Default date range: today → today + 30 days
const todayISO = toISO(new Date());
const plusMonthISO = toISO(new Date(Date.now() + 30 * 86400000));

// ── Reusable pill dropdown wrapper ─────────────────────────────────────────────
function PillDropdown({
  label, icon, active, children,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition whitespace-nowrap
          ${active || open
            ? "border-blue-500 bg-blue-50 text-blue-700"
            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
          }`}
      >
        {icon}
        {label}
        <ChevDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[220px]">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// ── Checkbox cell ──────────────────────────────────────────────────────────────
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded border-2 flex-shrink-0
      ${checked ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300 bg-white"}`}>
      {checked && (
        <svg viewBox="0 0 10 8" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1,4 4,7 9,1" />
        </svg>
      )}
    </span>
  );
}

// ── Sort icon ──────────────────────────────────────────────────────────────────
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400" />;
  return dir === "asc"
    ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" />
    : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />;
}

// ── Detail drawer ──────────────────────────────────────────────────────────────
function DetailRow({ booking, onEdit, onClose }: { booking: Booking; onEdit: () => void; onClose: () => void }) {
  const n = nights(booking.check_in, booking.check_out);
  return (
    <tr className="bg-blue-50 border-b border-blue-200">
      <td colSpan={11} className="px-6 py-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Buchungsnr.</p>
            <p className="text-gray-900 font-mono">{booking.booking_number || "–"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Telefon</p>
            <p className="text-gray-900">{booking.phone || "–"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">E-Mail</p>
            <p className="text-gray-900">{booking.email || "–"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Nächte</p>
            <p className="text-gray-900">{n > 0 ? `${n}` : "–"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Fähre Anreise</p>
            <p className="text-gray-900">{booking.ferry_time ? `${booking.ferry_time} Uhr` : "–"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Fähre Abreise</p>
            <p className="text-gray-900">{booking.ferry_time_departure ? `${booking.ferry_time_departure} Uhr` : "–"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Quelle</p>
            <p className="text-gray-900 capitalize">{booking.source}</p>
          </div>
          {booking.notes && (
            <div className="flex-1 min-w-[180px]">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Notizen</p>
              <p className="text-gray-900 whitespace-pre-wrap">{booking.notes}</p>
            </div>
          )}
          <div className="flex items-end gap-2 ml-auto">
            <button onClick={onEdit}
              className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">
              Bearbeiten
            </button>
            <button onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
// Channel badge colours
const CHANNEL_COLORS: Record<string, string> = {
  "Manuell":               "bg-gray-100 text-gray-600",
  "BaltrumDirekt":         "bg-teal-100 text-teal-700",
  "Traumferienwohnungen":  "bg-amber-100 text-amber-700",
  "Webseite":              "bg-blue-100 text-blue-700",
};
function channelColor(ch: string) {
  return CHANNEL_COLORS[ch] ?? "bg-purple-100 text-purple-700";
}

export function Bookings() {
  const { isViewer } = useUserRole();
  const { data: bookings = [], isLoading } = useBookings();
  const { data: guests = [] } = useGuests();
  const consentEmails = useMemo(
    () => new Set(guests.filter((g) => g.marketingConsent).map((g) => g.email.toLowerCase())),
    [guests],
  );
  const { data: feeds = [] } = useIcalFeeds();
  const syncFeeds = useSyncIcalFeeds();
  const [syncMsg, setSyncMsg] = useState("");

  // Top-bar state
  const [selectedPropertyId, setSelectedPropertyId] = useState(""); // "" = alle
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo]     = useState(plusMonthISO);

  // Filter / sort
  const [sort, setSort]       = useState<Sort>({ key: "check_in", dir: "desc" });
  const [filters, setFilters] = useState<Filters>({ paid: "all", search: "" });
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Table interaction
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);

  async function handleSync() {
    setSyncMsg("");
    const results = await syncFeeds.mutateAsync(feeds);
    const imp = results.reduce((s, r) => s + r.imported, 0);
    const upd = results.reduce((s, r) => s + r.updated, 0);
    const errs = results.flatMap((r) => r.errors);
    if (errs.length) setSyncMsg(`⚠ Fehler: ${errs[0]}`);
    else setSyncMsg(`✓ ${imp} importiert, ${upd} aktualisiert`);
    setTimeout(() => setSyncMsg(""), 6000);
  }

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  // ── Filtered + sorted rows ──────────────────────────────────────────────────
  const rows = useMemo(() => {
    let list = [...bookings];

    // Property filter
    if (selectedPropertyId) list = list.filter((b) => b.property_id === selectedPropertyId);

    // Date range filter: show bookings that overlap [dateFrom, dateTo]
    if (dateFrom) list = list.filter((b) => b.check_out > dateFrom);
    if (dateTo)   list = list.filter((b) => b.check_in  <= dateTo);

    // Paid filter
    if (filters.paid === "paid")   list = list.filter((b) => b.is_paid);
    if (filters.paid === "unpaid") list = list.filter((b) => !b.is_paid);

    // Search
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      list = list.filter((b) =>
        b.guest_name.toLowerCase().includes(q) ||
        b.phone.toLowerCase().includes(q) ||
        b.email.toLowerCase().includes(q) ||
        (b.booking_number ?? "").toLowerCase().includes(q) ||
        propName(b.property_id).toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      let av: string | number = a[sort.key] ?? "";
      let bv: string | number = b[sort.key] ?? "";
      if (sort.key === "property_id") { av = propName(a.property_id); bv = propName(b.property_id); }
      if (sort.key === "price") { av = a.price ?? 0; bv = b.price ?? 0; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [bookings, selectedPropertyId, dateFrom, dateTo, filters, sort]);

  const activeFilters = (filters.paid !== "all" ? 1 : 0) + (filters.search.trim() ? 1 : 0);

  const selectedProp = properties.find((p) => p.id === selectedPropertyId);

  // Date range label
  const dateLabel = dateFrom && dateTo
    ? `${fmt(dateFrom)} – ${fmt(dateTo)}`
    : dateFrom ? `ab ${fmt(dateFrom)}`
    : dateTo   ? `bis ${fmt(dateTo)}`
    : "Zeitraum wählen";

  function openEdit(b: Booking) { setEditBooking(b); setModalOpen(true); }
  function openNew()             { setEditBooking(null); setModalOpen(true); }

  function Th({ label, sortKey, className = "" }: { label: string; sortKey?: SortKey; className?: string }) {
    const active = !!sortKey && sort.key === sortKey;
    return (
      <th
        onClick={sortKey ? () => toggleSort(sortKey) : undefined}
        className={`px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap select-none
          ${sortKey ? "cursor-pointer hover:text-gray-800" : ""} ${className}`}
      >
        <span className="flex items-center gap-1">
          {label}
          {sortKey && <SortIcon active={active} dir={sort.dir} />}
        </span>
      </th>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Page header ── */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-200 bg-white space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Buchungen</h2>
          <div className="flex items-center gap-2">
            {syncMsg && (
              <span className={`text-sm font-medium px-3 py-1.5 rounded-lg
                ${syncMsg.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {syncMsg}
              </span>
            )}
            {feeds.length > 0 && !isViewer && (
              <button
                onClick={handleSync}
                disabled={syncFeeds.isPending}
                className="flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${syncFeeds.isPending ? "animate-spin" : ""}`} />
                {syncFeeds.isPending ? "Sync…" : "Sync"}
              </button>
            )}
            {!isViewer && (
              <button onClick={openNew}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
                <Plus className="w-4 h-4" /> Neue Buchung
              </button>
            )}
          </div>
        </div>

        {/* ── Top-bar pills ── */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Property pill */}
          <PillDropdown
            label={selectedProp ? selectedProp.name : "Alle Wohnungen"}
            icon={<Home className="w-4 h-4" />}
            active={!!selectedPropertyId}
          >
            {(close) => (
              <div className="py-1">
                <button
                  onClick={() => { setSelectedPropertyId(""); close(); }}
                  className={`w-full text-left px-4 py-2 text-sm transition hover:bg-gray-50
                    ${!selectedPropertyId ? "font-semibold text-blue-700" : "text-gray-700"}`}
                >
                  Alle Wohnungen
                </button>
                <div className="my-1 border-t border-gray-100" />
                {["Upstalsboom", "Haus Anne"].map((house) => (
                  <div key={house}>
                    <p className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">{house}</p>
                    {properties.filter((p) => p.house === house).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedPropertyId(p.id); close(); }}
                        className={`w-full text-left px-4 py-2 text-sm transition hover:bg-gray-50
                          ${selectedPropertyId === p.id ? "font-semibold text-blue-700 bg-blue-50" : "text-gray-700"}`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </PillDropdown>

          {/* Date range pill */}
          <PillDropdown
            label={dateLabel}
            icon={<CalendarRange className="w-4 h-4" />}
            active={dateFrom !== todayISO || dateTo !== plusMonthISO}
          >
            {(close) => (
              <div className="p-4 space-y-3 w-72">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Von</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Bis</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  {[
                    { label: "Diesen Monat", from: toISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: toISO(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)) },
                    { label: "Nächste 30 T.", from: todayISO, to: toISO(new Date(Date.now() + 30 * 86400000)) },
                    { label: "Dieses Jahr",  from: toISO(new Date(new Date().getFullYear(), 0, 1)), to: toISO(new Date(new Date().getFullYear(), 11, 31)) },
                  ].map(({ label, from, to }) => (
                    <button
                      key={label}
                      onClick={() => { setDateFrom(from); setDateTo(to); }}
                      className="flex-1 px-2 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition whitespace-nowrap"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); close(); }}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 text-center py-1 transition"
                >
                  Zeitraum aufheben
                </button>
              </div>
            )}
          </PillDropdown>

          {/* Filter pill */}
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition
              ${filtersOpen || activeFilters > 0
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
              }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filter
            {activeFilters > 0 && (
              <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">
                {activeFilters}
              </span>
            )}
          </button>

          {/* Search */}
          <input
            type="text"
            placeholder="Name, Buchungsnr., Kontakt oder Wohnung…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="border border-gray-300 rounded-full px-4 py-2 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />

          {/* Result count */}
          <span className="ml-auto text-sm text-gray-500">
            {rows.length} Buchung{rows.length !== 1 ? "en" : ""}
          </span>
        </div>

        {/* ── Expandable filter panel ── */}
        {filtersOpen && (
          <div className="flex flex-wrap gap-4 items-end pt-1">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Bezahlstatus</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                {(["all", "paid", "unpaid"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setFilters((f) => ({ ...f, paid: v }))}
                    className={`px-3 py-1.5 text-sm font-medium transition
                      ${filters.paid === v ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}
                  >
                    {v === "all" ? "Alle" : v === "paid" ? "✓ Bezahlt" : "€? Offen"}
                  </button>
                ))}
              </div>
            </div>
            {activeFilters > 0 && (
              <button
                onClick={() => setFilters({ paid: "all", search: "" })}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition"
              >
                <X className="w-3.5 h-3.5" /> Zurücksetzen
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <p className="text-base font-medium">Keine Buchungen gefunden</p>
            <p className="text-sm">Zeitraum oder Filter anpassen</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <Th label="Ankunft"   sortKey="check_in"    />
                <Th label="Abfahrt"   sortKey="check_out"   />
                <Th label="Wohnung"   sortKey="property_id" className="min-w-[160px]" />
                <Th label="Kanal"     />
                <Th label="Gast"      sortKey="guest_name"  className="min-w-[140px]" />
                <Th label="Personen"  />
                <Th label="Hund"      />
                <Th label="Preis"     sortKey="price"       />
                <Th label="Status"    />
                <Th label="Bezahlt"   />
                <th className="px-3 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const isExpanded = expandedId === b.id;
                return (
                  <>
                    <tr
                      key={b.id}
                      onClick={() => setExpandedId(isExpanded ? null : b.id)}
                      className={`border-b cursor-pointer transition
                        ${isExpanded
                          ? "bg-blue-50 border-blue-200"
                          : "border-gray-100 hover:bg-gray-50"}`}
                    >
                      <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{fmt(b.check_in)}</td>
                      <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{fmt(b.check_out)}</td>
                      <td className="px-3 py-3 text-gray-800 whitespace-nowrap min-w-[160px]">{propName(b.property_id)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${channelColor(b.channel)}`}>
                          {b.channel || "Manuell"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-900 font-medium min-w-[140px]">
                        <span className="inline-flex items-center gap-1.5">
                          {b.guest_name}
                          {b.email && consentEmails.has(b.email.toLowerCase()) && (
                            <span title="Hat der Werbemail-Zusendung zugestimmt">
                              <Mail className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-700 text-center">
                        <span className="inline-flex items-center gap-1">
                          {b.adults + b.children}
                          {b.children > 0 && <span className="text-xs text-gray-400">({b.adults}+{b.children})</span>}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-gray-700">{b.dogCount > 0 ? b.dogCount : "–"}</td>
                      <td className="px-3 py-3 text-gray-800 whitespace-nowrap text-right font-medium">
                        {b.price > 0 ? `${b.price.toLocaleString("de-DE")} €` : "–"}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap"><StatusBadge status={b.status} /></td>
                      <td className="px-3 py-3 text-center"><Checkbox checked={b.is_paid} /></td>
                      <td className="px-3 py-3 text-gray-400">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <DetailRow
                        key={`${b.id}-detail`}
                        booking={b}
                        onEdit={() => openEdit(b)}
                        onClose={() => setExpandedId(null)}
                      />
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <BookingModal
        open={modalOpen}
        booking={editBooking}
        onClose={() => { setModalOpen(false); setEditBooking(null); }}
      />
    </div>
  );
}
