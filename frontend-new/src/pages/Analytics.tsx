import { useState, useMemo } from "react";
import {
  Calendar, Euro, Moon, TrendingUp, Clock, BarChart2, ArrowUp, ArrowDown, Minus,
  Dog, Baby, ShieldCheck, Armchair,
} from "lucide-react";
import { useBookings } from "@/hooks/useBookings";
import { properties } from "@/lib/properties";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, ComposedChart, AreaChart, Area,
} from "recharts";
import type { Booking } from "@/types";

// ── Blaue Farbpalette ─────────────────────────────────────────────────────────
const BLUE_SHADES = ["#1d4ed8","#2563eb","#3b82f6","#60a5fa","#93c5fd","#1e3a8a","#1e40af","#bfdbfe","#dbeafe","#eff6ff","#172554"];

// ── helpers ───────────────────────────────────────────────────────────────────
function isoMonth(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}
function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
}
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

function nightsInMonth(b: Booking, y: number, m: number): number {
  const mStart = new Date(y, m - 1, 1).getTime();
  const mEnd   = new Date(y, m, 1).getTime();
  const bStart = new Date(b.check_in  + "T00:00:00").getTime();
  const bEnd   = new Date(b.check_out + "T00:00:00").getTime();
  const lo = Math.max(mStart, bStart); const hi = Math.min(mEnd, bEnd);
  return lo < hi ? Math.round((hi - lo) / 86400000) : 0;
}
function nightsInYear(b: Booking, y: number): number {
  const yStart = new Date(y, 0, 1).getTime(); const yEnd = new Date(y + 1, 0, 1).getTime();
  const bStart = new Date(b.check_in  + "T00:00:00").getTime();
  const bEnd   = new Date(b.check_out + "T00:00:00").getTime();
  const lo = Math.max(yStart, bStart); const hi = Math.min(yEnd, bEnd);
  return lo < hi ? Math.round((hi - lo) / 86400000) : 0;
}
function bookingInMonth(b: Booking, y: number, m: number) { return b.check_in.startsWith(isoMonth(y, m)); }
function bookingInYear(b: Booking, y: number)             { return b.check_in.startsWith(`${y}-`); }
function totalNightsB(b: Booking) {
  return Math.max(0, Math.round(
    (new Date(b.check_out + "T00:00:00").getTime() - new Date(b.check_in + "T00:00:00").getTime()) / 86400000
  ));
}

// Nur tatsächlich eingegangenes/abgeschlossenes Geld zählt als Umsatz —
// Anfragen, Reservierungen und offene Bestätigungen bleiben außen vor.
const REVENUE_STATUSES: Booking["status"][] = ["bezahlt", "abgeschlossen"];

// Auslastung nur aus Buchungen, die tatsächlich stehen — reine Anfragen/
// Reservierungen/Probleme sollen die Belegungsquote nicht künstlich aufblähen.
const OCCUPANCY_STATUSES: Booking["status"][] = ["bestaetigt", "bezahlt", "abgeschlossen"];

function calcStats(bookings: Booking[], filteredProps: typeof properties, y: number, m?: number) {
  const inPeriod = bookings.filter((b) => m ? bookingInMonth(b, y, m) : bookingInYear(b, y));
  const allNights = bookings.reduce((s, b) => s + (m ? nightsInMonth(b, y, m) : nightsInYear(b, y)), 0);
  const occupancyNights = bookings
    .filter((b) => OCCUPANCY_STATUSES.includes(b.status))
    .reduce((s, b) => s + (m ? nightsInMonth(b, y, m) : nightsInYear(b, y)), 0);
  const available = (m ? daysInMonth(y, m) : 365) * filteredProps.length;
  const occupancy = available > 0 ? (occupancyNights / available) * 100 : 0;
  return {
    bookings: inPeriod.length,
    nights:   allNights,
    revenue:  inPeriod
      .filter((b) => REVENUE_STATUSES.includes(b.status))
      .reduce((s, b) => s + (b.price ?? 0), 0),
    occupancy: Math.round(occupancy * 10) / 10,
  };
}

function delta(curr: number, prev: number) {
  if (prev === 0) return null;
  const pct = ((curr - prev) / prev) * 100;
  return { pct: Math.abs(pct), dir: pct > 1 ? "up" : pct < -1 ? "down" : "same" as const };
}

// ── Umsatz-Kategorien ─────────────────────────────────────────────────────────
type RevenueCategory = "nights" | "cleaning" | "dog" | "laundry" | "manual";

const CATEGORY_LABELS: Record<RevenueCategory, string> = {
  nights:   "Übernachtungen",
  cleaning: "Reinigung",
  dog:      "Hund",
  laundry:  "Wäsche",
  manual:   "Manuell",
};
const CATEGORY_COLORS: Record<RevenueCategory, string> = {
  nights:   "#1d4ed8",
  cleaning: "#0d9488",
  dog:      "#d97706",
  laundry:  "#7c3aed",
  manual:   "#6b7280",
};
const ALL_CATEGORIES: RevenueCategory[] = ["nights", "cleaning", "dog", "laundry", "manual"];
// Flache Top-Level-Keys fürs Chart-Stacking — Recharts berechnet die Achsen-Domain
// bei gestapelten Bars über den dataKey-String; ein Funktions-Accessor auf ein
// verschachteltes Objekt wird dabei nicht korrekt für die Skalierung ausgewertet.
const CATEGORY_DATA_KEY: Record<RevenueCategory, string> = {
  nights: "cat_nights", cleaning: "cat_cleaning", dog: "cat_dog", laundry: "cat_laundry", manual: "cat_manual",
};

// Zerlegt eine Buchung in Umsatz-Kategorien. Nur wenn die gespeicherte
// Aufschlüsselung rechnerisch noch exakt zum aktuellen `price` summiert (Toleranz
// 0,01 € für Rundung), wird aufgeteilt — sonst zählt der volle Betrag als
// "Manuell" (deckt sowohl echte Freitext-Preise als auch nachträglich über den
// Gesamtpreis überschriebene, dadurch veraltete Aufschlüsselungen ab).
function revenueBreakdownOf(b: Booking): Record<RevenueCategory, number> {
  const zero: Record<RevenueCategory, number> = { nights: 0, cleaning: 0, dog: 0, laundry: 0, manual: 0 };
  const bd = b.priceBreakdown;
  if (!bd) return { ...zero, manual: b.price ?? 0 };
  const nightsSum = bd.nights.reduce((s, n) => s + n.price, 0);
  const extraFeesSum = bd.extraFees.reduce((s, f) => s + f.amount, 0);
  const breakdownSum = nightsSum + bd.cleaningFee + bd.dogFee + extraFeesSum;
  const consistent = Math.abs(breakdownSum - (b.price ?? 0)) < 0.01;
  if (!consistent) return { ...zero, manual: b.price ?? 0 };
  return { nights: nightsSum, cleaning: bd.cleaningFee, dog: bd.dogFee, laundry: extraFeesSum, manual: 0 };
}

function calcRevenueByCategory(bookings: Booking[], y: number, m?: number) {
  const inPeriod = bookings.filter((b) =>
    (m ? bookingInMonth(b, y, m) : bookingInYear(b, y)) && REVENUE_STATUSES.includes(b.status));
  const revenueByCategory: Record<RevenueCategory, number> = { nights: 0, cleaning: 0, dog: 0, laundry: 0, manual: 0 };
  const countByCategory:   Record<RevenueCategory, number> = { nights: 0, cleaning: 0, dog: 0, laundry: 0, manual: 0 };
  inPeriod.forEach((b) => {
    const bd = revenueBreakdownOf(b);
    (Object.keys(bd) as RevenueCategory[]).forEach((cat) => {
      if (bd[cat] > 0) {
        revenueByCategory[cat] += bd[cat];
        countByCategory[cat] += 1;
      }
    });
  });
  return { revenueByCategory, countByCategory };
}

// Anklickbare Kategorie-Legende — steuert Sichtbarkeit in beiden Umsatz-Charts.
function CategoryLegend({
  categories, totals, visible, onToggle,
}: {
  categories: RevenueCategory[];
  totals: Record<RevenueCategory, number>;
  visible: Set<RevenueCategory>;
  onToggle: (cat: RevenueCategory) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((cat) => {
        const active = visible.has(cat);
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onToggle(cat)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
              active ? "text-white border-transparent" : "text-gray-400 bg-gray-50 border-gray-200 hover:bg-gray-100"
            }`}
            style={active ? { backgroundColor: CATEGORY_COLORS[cat] } : undefined}
          >
            {CATEGORY_LABELS[cat]}
            <span className={active ? "opacity-90" : ""}>· {totals[cat].toLocaleString("de-DE")} €</span>
          </button>
        );
      })}
    </div>
  );
}

// Tooltip für ein einzelnes Kategorie-Mini-Chart: Periode, Betrag, Anzahl Buchungen.
function CategoryMiniTooltip({ active, payload, label, cat }: {
  active?: boolean;
  payload?: Array<{ payload: { revenueByCategory: Record<RevenueCategory, number>; countByCategory: Record<RevenueCategory, number> } }>;
  label?: string;
  cat: RevenueCategory;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const value = point.revenueByCategory[cat];
  const count = point.countByCategory[cat];
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{label}</p>
      <p className="text-gray-600 whitespace-nowrap">
        {value.toLocaleString("de-DE")} € · {count} Buchung{count === 1 ? "" : "en"}
      </p>
    </div>
  );
}

// Ein Mini-Chart pro Kategorie mit eigener, automatisch skalierter Y-Achse —
// so bleiben kleine Beträge (z.B. Hund) lesbar, unabhängig von großen (Manuell).
function CategoryMiniChart({ cat, data, full }: {
  cat: RevenueCategory;
  data: Array<{ label: string; revenueByCategory: Record<RevenueCategory, number>; countByCategory: Record<RevenueCategory, number> } & Record<string, unknown>>;
  full: boolean;
}) {
  const color = CATEGORY_COLORS[cat];
  const gradId = `rev-grad-${cat}`;
  const total = data.reduce((s, p) => s + p.revenueByCategory[cat], 0);
  return (
    <div className={`bg-gray-50 rounded-lg p-4 ${full ? "col-span-full" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          {CATEGORY_LABELS[cat]}
        </span>
        <span className="text-xs font-bold text-gray-800">{total.toLocaleString("de-DE")} €</span>
      </div>
      <ResponsiveContainer width="100%" height={full ? 260 : 160}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} width={44} />
          <Tooltip content={<CategoryMiniTooltip cat={cat} />} />
          <Area type="monotone" dataKey={CATEGORY_DATA_KEY[cat]} stroke={color} strokeWidth={2}
            fill={`url(#${gradId})`} dot={{ r: 2 }} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Gauge ─────────────────────────────────────────────────────────────────────
function Gauge({ pct }: { pct: number }) {
  const r = 72; const cx = 100; const cy = 90;
  const clamped = Math.max(0, Math.min(100, pct));
  const angle   = Math.PI + (clamped / 100) * Math.PI;
  const arc = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  const bg1 = arc(Math.PI); const bg2 = arc(2 * Math.PI); const fg2 = arc(angle);
  const nx = cx + (r - 10) * Math.cos(angle); const ny = cy + (r - 10) * Math.sin(angle);
  const fillColor = clamped < 35 ? "#10b981" : clamped < 70 ? "#3b82f6" : "#1d4ed8";
  return (
    <svg viewBox="0 0 200 108" className="w-full max-w-[200px]">
      <path d={`M ${bg1.x} ${bg1.y} A ${r} ${r} 0 0 1 ${bg2.x} ${bg2.y}`} fill="none" stroke="#e5e7eb" strokeWidth="14" strokeLinecap="round" />
      {clamped > 0 && <path d={`M ${bg1.x} ${bg1.y} A ${r} ${r} 0 ${clamped > 50 ? 1 : 0} 1 ${fg2.x} ${fg2.y}`} fill="none" stroke={fillColor} strokeWidth="14" strokeLinecap="round" />}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#111827" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill="#111827" />
      <text x="20"  y="100" fontSize="9" fill="#9ca3af">0%</text>
      <text x="95"  y="18"  fontSize="9" fill="#9ca3af" textAnchor="middle">50%</text>
      <text x="176" y="100" fontSize="9" fill="#9ca3af" textAnchor="end">100%</text>
    </svg>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={44}>
      <LineChart data={data.map((v) => ({ v }))}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Vergleichs-Zeile ──────────────────────────────────────────────────────────
function CompareRow({ curr, prev, formatVal }: { curr: number; prev: number; formatVal: (n: number) => string }) {
  const d = delta(curr, prev);
  if (!d) return <span className="text-xs text-gray-400">kein Vorjahr</span>;
  const { pct, dir } = d;
  const isUp = dir === "up"; const isSame = dir === "same";
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-gray-500">
        Vorjahr: <span className="font-semibold text-gray-700">{formatVal(prev)}</span>
      </span>
      {!isSame && (
        <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${isUp ? "text-emerald-600" : "text-red-500"}`}>
          {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {pct.toFixed(1)} %
        </span>
      )}
      {isSame && <span className="inline-flex items-center gap-0.5 text-xs text-gray-400"><Minus className="w-3 h-3" />±0</span>}
    </div>
  );
}

// ── Pickers ───────────────────────────────────────────────────────────────────
function MonthPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [y, m] = value.split("-").map(Number);
  const now = new Date();
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400 mr-1">{label}</span>
      <select value={m} onChange={(e) => onChange(isoMonth(y, Number(e.target.value)))}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => (
          <option key={mo} value={mo}>{new Date(2000, mo - 1, 1).toLocaleDateString("de-DE", { month: "short" })}</option>
        ))}
      </select>
      <select value={y} onChange={(e) => onChange(isoMonth(Number(e.target.value), m))}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
        {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </div>
  );
}

function YearPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const now = new Date();
  const years = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 4 + i);
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400 mr-1">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
        {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
type Mode = "monthly" | "yearly";
type PropFilter = "all" | "Upstalsboom" | "Haus Anne";

const now = new Date();
const DEFAULT_FROM = isoMonth(now.getFullYear(), Math.max(1, now.getMonth() - 4));
const DEFAULT_TO   = isoMonth(now.getFullYear(), now.getMonth() + 1);

export function Analytics() {
  const { data: allBookings = [], isLoading } = useBookings();

  const [mode, setMode]             = useState<Mode>("monthly");
  const [fromMonth, setFromMonth]   = useState(DEFAULT_FROM);
  const [toMonth, setToMonth]       = useState(DEFAULT_TO);
  const [fromYear, setFromYear]     = useState(now.getFullYear() - 1);
  const [toYear, setToYear]         = useState(now.getFullYear());
  const [propFilter, setPropFilter] = useState<PropFilter>("all");
  const [visibleCategories, setVisibleCategories] = useState<Set<RevenueCategory>>(new Set(ALL_CATEGORIES));

  const bookings = useMemo(() =>
    propFilter === "all" ? allBookings
      : allBookings.filter((b) => properties.find((p) => p.id === b.property_id)?.house === propFilter),
    [allBookings, propFilter]
  );
  const filteredProps = useMemo(() =>
    propFilter === "all" ? properties : properties.filter((p) => p.house === propFilter),
    [propFilter]
  );

  // Bei Upstalsboom-Filter gibt es strukturell kein Wäschepaket — Kategorie ganz weglassen.
  const availableCategories = useMemo(
    () => propFilter === "Upstalsboom" ? ALL_CATEGORIES.filter((c) => c !== "laundry") : ALL_CATEGORIES,
    [propFilter]
  );
  const effectiveVisible = useMemo(
    () => new Set([...visibleCategories].filter((c) => availableCategories.includes(c))),
    [visibleCategories, availableCategories]
  );
  const toggleCategory = (cat: RevenueCategory) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const periods: Array<{ key: string; label: string; y: number; m?: number }> = useMemo(() => {
    if (mode === "monthly") {
      const [fy, fm] = fromMonth.split("-").map(Number);
      const [ty, tm] = toMonth.split("-").map(Number);
      const result = []; let cy = fy, cm = fm;
      while (cy < ty || (cy === ty && cm <= tm)) {
        result.push({ key: isoMonth(cy, cm), label: monthLabel(isoMonth(cy, cm)), y: cy, m: cm });
        cm++; if (cm > 12) { cm = 1; cy++; }
        if (result.length > 60) break;
      }
      return result;
    }
    return Array.from({ length: toYear - fromYear + 1 }, (_, i) => ({
      key: `${fromYear + i}`, label: `${fromYear + i}`, y: fromYear + i,
    }));
  }, [mode, fromMonth, toMonth, fromYear, toYear]);

  const periodStats = useMemo(() =>
    periods.map(({ key, label, y, m }) => {
      const { revenueByCategory, countByCategory } = calcRevenueByCategory(bookings, y, m);
      return {
        key, label,
        ...calcStats(bookings, filteredProps, y, m),
        revenueByCategory, countByCategory,
        cat_nights:   revenueByCategory.nights,
        cat_cleaning: revenueByCategory.cleaning,
        cat_dog:      revenueByCategory.dog,
        cat_laundry:  revenueByCategory.laundry,
        cat_manual:   revenueByCategory.manual,
      };
    }),
    [periods, bookings, filteredProps]
  );
  const prevPeriodStats = useMemo(() =>
    periods.map(({ y, m }) => calcStats(bookings, filteredProps, y - 1, m)),
    [periods, bookings, filteredProps]
  );
  const chartData = useMemo(() =>
    periodStats.map((p, i) => ({
      ...p,
      prevBookings:  prevPeriodStats[i].bookings,
      prevNights:    prevPeriodStats[i].nights,
      prevRevenue:   prevPeriodStats[i].revenue,
      prevOccupancy: prevPeriodStats[i].occupancy,
    })),
    [periodStats, prevPeriodStats]
  );

  const categoryTotals = useMemo(() => {
    const totals: Record<RevenueCategory, number> = { nights: 0, cleaning: 0, dog: 0, laundry: 0, manual: 0 };
    periodStats.forEach((p) => {
      ALL_CATEGORIES.forEach((cat) => { totals[cat] += p.revenueByCategory[cat]; });
    });
    return totals;
  }, [periodStats]);

  // Buchungen, deren Anreise im gewählten Zeitraum liegt — Grundgesamtheit für
  // Vorlaufzeit/Aufenthaltsdauer (oben) sowie Hunde-/Ausstattungsstatistik (unten).
  const periodBks = useMemo(() => bookings.filter((b) => {
    const ci = b.check_in;
    return mode === "monthly"
      ? ci >= fromMonth && ci <= toMonth + "-31"
      : Number(ci.slice(0, 4)) >= fromYear && Number(ci.slice(0, 4)) <= toYear;
  }), [bookings, mode, fromMonth, toMonth, fromYear, toYear]);

  const summary = useMemo(() => {
    const totalBookings = periodStats.reduce((s, p) => s + p.bookings, 0);
    const totalNights   = periodStats.reduce((s, p) => s + p.nights, 0);
    const totalRevenue  = periodStats.reduce((s, p) => s + p.revenue, 0);
    const avgOccupancy  = periodStats.length
      ? periodStats.reduce((s, p) => s + p.occupancy, 0) / periodStats.length : 0;
    const avgStay = periodBks.length
      ? periodBks.reduce((s, b) => s + totalNightsB(b), 0) / periodBks.length : 0;
    const leaded  = periodBks.filter((b) => b.created_at);
    const avgLead = leaded.length ? leaded.reduce((s, b) => {
      const created = typeof b.created_at === "object" && b.created_at !== null
        ? (b.created_at as { seconds: number }).seconds * 1000
        : new Date(b.created_at as string).getTime();
      return s + Math.max(0, Math.round((new Date(b.check_in + "T00:00:00").getTime() - created) / 86400000));
    }, 0) / leaded.length : 0;
    return { totalBookings, totalNights, totalRevenue, avgOccupancy, avgStay, avgLead };
  }, [periodStats, periodBks]);

  const prevSummary = useMemo(() => ({
    totalBookings: prevPeriodStats.reduce((s, p) => s + p.bookings, 0),
    totalNights:   prevPeriodStats.reduce((s, p) => s + p.nights, 0),
    totalRevenue:  prevPeriodStats.reduce((s, p) => s + p.revenue, 0),
    avgOccupancy:  prevPeriodStats.length
      ? prevPeriodStats.reduce((s, p) => s + p.occupancy, 0) / prevPeriodStats.length : 0,
  }), [prevPeriodStats]);

  const channelData = useMemo(() => {
    const map: Record<string, number> = {};
    bookings.forEach((b) => { const ch = b.channel || "Manuell"; map[ch] = (map[ch] ?? 0) + 1; });
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));
  }, [bookings]);

  const propertyBookingData = useMemo(() => {
    const map: Record<string, number> = {};
    bookings.forEach((b) => {
      const name = properties.find((p) => p.id === b.property_id)?.name ?? b.property_id;
      map[name] = (map[name] ?? 0) + 1;
    });
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));
  }, [bookings]);

  // Gebuchte Nächte je Wohnung: aktuell vs. Vorjahr
  const propertyNightsData = useMemo(() =>
    filteredProps.map((prop) => {
      const curr = periods.reduce((sum, { y, m }) =>
        sum + bookings
          .filter((b) => b.property_id === prop.id)
          .reduce((s, b) => s + (m ? nightsInMonth(b, y, m) : nightsInYear(b, y)), 0), 0);
      const prev = periods.reduce((sum, { y, m }) =>
        sum + bookings
          .filter((b) => b.property_id === prop.id)
          .reduce((s, b) => s + (m ? nightsInMonth(b, y - 1, m) : nightsInYear(b, y - 1)), 0), 0);
      return { name: prop.name, curr, prev };
    }).sort((a, b) => b.curr - a.curr),
    [filteredProps, periods, bookings]
  );

  // ── Hunde & Zusatzausstattung ──────────────────────────────────────────────
  const dogStats = useMemo(() => {
    const withDogs = periodBks.filter((b) => b.dogCount > 0);
    const totalDogs = periodBks.reduce((s, b) => s + (b.dogCount || 0), 0);
    const byProperty = filteredProps
      .filter((p) => p.allowsDogs)
      .map((p) => {
        const propBks = periodBks.filter((b) => b.property_id === p.id);
        const propWithDogs = propBks.filter((b) => b.dogCount > 0);
        return {
          name: p.name,
          count: propWithDogs.length,
          pct: propBks.length ? (propWithDogs.length / propBks.length) * 100 : 0,
        };
      })
      .sort((a, b) => b.count - a.count);
    return {
      count: withDogs.length,
      pct: periodBks.length ? (withDogs.length / periodBks.length) * 100 : 0,
      totalDogs,
      byProperty,
    };
  }, [periodBks, filteredProps]);

  const equipmentStats = useMemo(() => {
    const total = periodBks.length;
    const mk = (key: "kinderbett" | "rausfallschutz" | "kinderstuhl") => {
      const count = periodBks.filter((b) => b[key]).length;
      return { count, pct: total ? (count / total) * 100 : 0 };
    };
    return { kinderbett: mk("kinderbett"), rausfallschutz: mk("rausfallschutz"), kinderstuhl: mk("kinderstuhl") };
  }, [periodBks]);

  const compLabel = mode === "monthly" ? "Vorjahreszeitraum" : "Vorjahr";
  const visibleCatList = availableCategories.filter((c) => effectiveVisible.has(c));

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h2 className="text-xl font-bold text-gray-900">Analysen</h2>
          <div className="flex items-center flex-wrap gap-3">
            <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
              {(["monthly", "yearly"] as Mode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {m === "monthly" ? "Monatlich" : "Jährlich"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
              <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
              {mode === "monthly" ? (
                <>
                  <MonthPicker value={fromMonth} onChange={setFromMonth} label="von" />
                  <span className="text-gray-400">–</span>
                  <MonthPicker value={toMonth}   onChange={setToMonth}   label="bis" />
                </>
              ) : (
                <>
                  <YearPicker value={fromYear} onChange={setFromYear} label="von" />
                  <span className="text-gray-400">–</span>
                  <YearPicker value={toYear}   onChange={setToYear}   label="bis" />
                </>
              )}
            </div>
            <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
              {(["all", "Upstalsboom", "Haus Anne"] as PropFilter[]).map((f) => (
                <button key={f} onClick={() => setPropFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${propFilter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {f === "all" ? "Alle" : f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Große Umsatz-Karte */}
        <div className="bg-white rounded-xl border border-gray-200 border-b-4 border-b-emerald-500 p-5">
          <div className="flex items-start justify-between mb-0.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Umsatz</p>
            <Euro className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          </div>
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <p className="text-3xl font-bold text-gray-900 mt-1">{summary.totalRevenue.toLocaleString("de-DE")} €</p>
              <div className="mt-1">
                <CompareRow curr={summary.totalRevenue} prev={prevSummary.totalRevenue}
                  formatVal={(n) => `${n.toLocaleString("de-DE")} €`} />
              </div>
            </div>
            <div className="w-full sm:w-48"><Sparkline data={periodStats.map((p) => p.revenue)} color="#10b981" /></div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <CategoryLegend categories={availableCategories} totals={categoryTotals} visible={effectiveVisible} onToggle={toggleCategory} />
          </div>

          <div className="mt-4">
            {periodStats.length > 0 && visibleCatList.length > 0 ? (
              <div className={`grid gap-3 ${visibleCatList.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
                {visibleCatList.map((cat) => (
                  <CategoryMiniChart key={`${cat}-${visibleCatList.length === 1}`} cat={cat} data={chartData} full={visibleCatList.length === 1} />
                ))}
              </div>
            ) : <div className="h-[160px] flex items-center justify-center text-gray-400 text-sm">Keine Daten</div>}
          </div>
        </div>

        {/* Buchungen + Auslastung nebeneinander */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Buchungen */}
          <div className="bg-white rounded-xl border border-gray-200 border-b-4 border-b-blue-500 p-5">
            <div className="flex items-start justify-between mb-0.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Buchungen</p>
              <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.totalBookings}</p>
            <div className="mt-1">
              <CompareRow curr={summary.totalBookings} prev={prevSummary.totalBookings}
                formatVal={(n) => `${n} Buchungen`} />
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500 flex-wrap">
              <Moon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span>{summary.totalNights} Nächte</span>
              <span className="text-gray-300">·</span>
              <span>Vorjahr: {prevSummary.totalNights}</span>
              {(() => {
                const d = delta(summary.totalNights, prevSummary.totalNights);
                if (!d) return null;
                return (
                  <span className={`font-bold ${d.dir === "up" ? "text-emerald-600" : d.dir === "down" ? "text-red-500" : "text-gray-400"}`}>
                    {d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "±"}
                    {d.pct.toFixed(0)} %
                  </span>
                );
              })()}
            </div>
            <div className="mt-2"><Sparkline data={periodStats.map((p) => p.bookings)} color="#3b82f6" /></div>
          </div>

          {/* Auslastung */}
          <div className="bg-white rounded-xl border border-gray-200 border-b-4 border-b-violet-500 p-5">
            <div className="flex items-start justify-between mb-0.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Auslastung</p>
              <BarChart2 className="w-4 h-4 text-violet-600 flex-shrink-0" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.avgOccupancy.toFixed(1)} %</p>
            <div className="mt-1">
              <CompareRow curr={summary.avgOccupancy} prev={prevSummary.avgOccupancy}
                formatVal={(n) => `${n.toFixed(1)} %`} />
            </div>
            <p className="text-xs text-gray-400 mt-1">Ø {summary.avgStay.toFixed(1)} Nächte / Buchung</p>
            <div className="mt-2"><Sparkline data={periodStats.map((p) => p.occupancy)} color="#8b5cf6" /></div>
          </div>
        </div>

        {/* Extra KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Ø Aufenthalt",   value: `${summary.avgStay.toFixed(1)} Nächte`,  Icon: Moon,       color: "bg-blue-50 text-blue-600" },
            { label: "Ø Vorlaufzeit",  value: `${Math.round(summary.avgLead)} Tage`,    Icon: Clock,      color: "bg-amber-50 text-amber-600" },
            { label: "Buchungskanäle", value: `${channelData.length}`,                  Icon: TrendingUp, color: "bg-violet-50 text-violet-600" },
            { label: "Wohnungen",      value: `${filteredProps.length}`,                Icon: BarChart2,  color: "bg-emerald-50 text-emerald-600" },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-base font-bold text-gray-900">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Gauge + Buchungen & Auslastung */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center">
            <h3 className="text-base font-semibold text-gray-900 mb-3 self-start">Auslastung</h3>
            <Gauge pct={Math.min(100, summary.avgOccupancy)} />
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.avgOccupancy.toFixed(1)} %</p>
            <p className="text-xs text-gray-400 mt-0.5">Ø über gewählten Zeitraum</p>
            <div className="mt-3 w-full border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500 mb-1">{compLabel}</p>
              <CompareRow curr={summary.avgOccupancy} prev={prevSummary.avgOccupancy}
                formatVal={(n) => `${n.toFixed(1)} %`} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Buchungen & Auslastung</h3>
            {periodStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart data={chartData} margin={{ right: 44 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left"  tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Bar  yAxisId="left"  dataKey="prevBookings"  name={`Buchungen ${compLabel}`} fill="#bfdbfe" radius={[3,3,0,0]} opacity={0.7} />
                  <Line yAxisId="right" dataKey="prevOccupancy" name={`Auslastung ${compLabel}`} stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="4 3" dot={false} type="monotone" />
                  <Bar  yAxisId="left"  dataKey="bookings"      name="Buchungen" fill="#2563eb" radius={[3,3,0,0]} />
                  <Line yAxisId="right" dataKey="occupancy"     name="Auslastung %" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <div className="h-[230px] flex items-center justify-center text-gray-400 text-sm">Keine Daten</div>}
          </div>
        </div>

        {/* Kanal + Buchungen nach Wohnung */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Buchungen nach Kanal</h3>
            {channelData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={channelData} cx="40%" cy="50%" outerRadius={80} innerRadius={40} dataKey="value">
                    {channelData.map((_, i) => <Cell key={i} fill={BLUE_SHADES[i % BLUE_SHADES.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">Keine Daten</div>}
          </div>

          {/* Buchungen nach Wohnung — alle Namen sichtbar */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Buchungen nach Wohnung</h3>
            {propertyBookingData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(240, propertyBookingData.length * 30)}>
                <BarChart data={propertyBookingData} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={115} interval={0} />
                  <Tooltip />
                  <Bar dataKey="value" name="Buchungen" radius={[0, 3, 3, 0]}>
                    {propertyBookingData.map((_, i) => <Cell key={i} fill={BLUE_SHADES[i % BLUE_SHADES.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-[240px] flex items-center justify-center text-gray-400 text-sm">Keine Daten</div>}
          </div>
        </div>

        {/* Gebuchte Nächte je Wohnung (aktuell vs. Vorjahr) */}
        {propertyNightsData.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-base font-semibold text-gray-900">Gebuchte Nächte je Wohnung</h3>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-blue-600" />Aktuell
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-blue-200" />{compLabel}
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(260, propertyNightsData.length * 32)}>
              <BarChart data={propertyNightsData} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} unit=" N." />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={115} interval={0} />
                <Tooltip formatter={(value) => `${value} Nächte`} />
                <Legend />
                <Bar dataKey="prev" name={compLabel} fill="#bfdbfe" radius={[0, 3, 3, 0]} />
                <Bar dataKey="curr" name="Aktuell"    fill="#2563eb" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Hunde & Zusatzausstattung */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Hunde &amp; Zusatzausstattung</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-50 text-amber-600">
                <Dog className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Buchungen mit Hund</p>
                <p className="text-base font-bold text-gray-900">{dogStats.count} <span className="text-xs font-normal text-gray-400">({dogStats.pct.toFixed(1)} %)</span></p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-50 text-amber-600">
                <Dog className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Hunde gesamt</p>
                <p className="text-base font-bold text-gray-900">{dogStats.totalDogs}</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-2">Hunde je Wohnung</p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {dogStats.byProperty.length === 0 && <p className="text-xs text-gray-400">Keine Wohnung mit Hundeerlaubnis im Filter.</p>}
                {dogStats.byProperty.map((p) => (
                  <div key={p.name} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{p.name}</span>
                    <span className="font-medium text-gray-800">{p.count} <span className="text-gray-400">({p.pct.toFixed(0)} %)</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: "Kinderbett",     Icon: Baby,        stats: equipmentStats.kinderbett },
              { label: "Rausfallschutz", Icon: ShieldCheck, stats: equipmentStats.rausfallschutz },
              { label: "Kinderstuhl",    Icon: Armchair,    stats: equipmentStats.kinderstuhl },
            ].map(({ label, Icon, stats }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-50 text-blue-600">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-base font-bold text-gray-900">{stats.count} <span className="text-xs font-normal text-gray-400">({stats.pct.toFixed(1)} %)</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
