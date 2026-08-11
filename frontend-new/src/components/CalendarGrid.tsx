import { useState, useRef, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle } from "react";
import { Dog, Ban, CheckCircle2 } from "lucide-react";
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable,
  type DragStartEvent, type DragMoveEvent, type DragEndEvent, type Modifier,
} from "@dnd-kit/core";
import { properties } from "@/lib/properties";
import { statusConfig, CONFIRMED_STATUSES } from "@/lib/bookingStatus";
import { useUpdateBooking } from "@/hooks/useBookings";
import { useUserRole } from "@/hooks/useUserRole";
import { useHouseSettings } from "@/hooks/useHouseSettings";
import { shiftDates, resizeStart, resizeEnd, hasCollision, spansOverlap } from "@/lib/bookingDrag";
import { arrivalFraction, departureFraction } from "@/lib/daySegments";
import { diffBooking } from "@/lib/bookingHistory";
import { shouldNotify } from "@/lib/bookingNotify";
import { sendChangeNotification } from "@/lib/notifyEmail";
import { NotifyDialog } from "@/components/NotifyDialog";
import type { Booking, BookingFormData, FieldChange, HouseId, HouseSettings } from "@/types";

type DragMode = "move" | "resize-start" | "resize-end";
const HANDLE_W = 10; // Greifbreite der Resize-Ränder

// Aktuelle Zeigerposition aus dnd-kit-Event (Startpunkt + Delta)
function pointerFromEvent(e: DragMoveEvent | DragEndEvent): { x: number; y: number } | null {
  const a = e.activatorEvent as PointerEvent | undefined;
  if (!a || typeof a.clientX !== "number") return null;
  return { x: a.clientX + e.delta.x, y: a.clientY + e.delta.y };
}

// Wohnung (data-property) unter einem Bildschirmpunkt – berücksichtigt Häusergruppen
function propertyUnderPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const row = el?.closest("[data-property]") as HTMLElement | null;
  return row?.getAttribute("data-property") ?? null;
}

function propName(id: string): string {
  return properties.find((p) => p.id === id)?.name ?? id;
}

interface CalendarGridProps {
  bookings: Booking[];
  onBookingClick: (booking: Booking) => void;
  onDateRangeSelect: (propertyId: string, startDate: Date, endDate: Date) => void;
}

export interface CalendarGridHandle {
  scrollToToday: () => void;
}

// ── Verschiebbarer Buchungsbalken (Mitte = Datum verschieben) ─────────────────
interface DraggableBarProps {
  booking: Booking;
  left: number; width: number; top: number; height: number;
  isConflict: boolean;
  isActiveDrag: boolean;
  dragCollision: boolean;
  onClickBar: (b: Booking) => void;
}
function DraggableBar({ booking, left, width, top, height, isConflict, isActiveDrag, dragCollision, onClickBar }: DraggableBarProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: booking.id,
    data: { booking, mode: "move" as DragMode },
  });
  const isCancelled = booking.status === "storniert";

  const style: React.CSSProperties = {
    position: "absolute",
    left, width: Math.max(4, width), top, height,
    backgroundColor: statusConfig(booking.status).barColor,
    // Diagonales Streifenmuster statt Grundfarbe/Deckkraft — bleibt auch bei
    // ähnlicher Grundfarbe (z.B. neben "Anfrage") klar als "storniert" erkennbar.
    backgroundImage: isCancelled
      ? "repeating-linear-gradient(45deg, rgba(255,255,255,0.55) 0px, rgba(255,255,255,0.55) 3px, transparent 3px, transparent 6px)"
      : undefined,
    // Beim Verschieben (Mitte) folgt der Balken dem dnd-Transform (X = Datum, Y = Wohnung).
    // Beim Resize bewegt sich der Griff – der Balken wird über left/width neu gesetzt.
    transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined,
    boxShadow: isActiveDrag
      ? `0 0 0 2px ${dragCollision ? "#dc2626" : "#16a34a"}, 0 6px 14px rgba(0,0,0,0.3)`
      : isConflict ? `0 0 0 2px ${BOOKING_OVERLAP_COLOR}` : "0 1px 3px rgba(0,0,0,0.18)",
    // Stornierter Streifen liegt bewusst über normalen Balken (unabhängig von der
    // zufälligen Array-Reihenfolge), damit er nie unter einer aktiven Buchung verschwindet.
    zIndex: isActiveDrag ? 40 : isCancelled ? 3 : isConflict ? 2 : 1,
    opacity: isActiveDrag ? 0.95 : 1,
    cursor: isDragging ? "grabbing" : "grab",
    touchAction: "none",
    // Während des Ziehens durchlässig, damit die Zielzeile (Wohnung) erkannt wird
    pointerEvents: isDragging ? "none" : undefined,
  };

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClickBar(booking); }}
      className={isCancelled
        ? "flex items-center justify-center gap-1 text-white rounded-sm overflow-hidden"
        : "flex items-center gap-1 px-1.5 text-white text-[11px] font-semibold rounded overflow-hidden"}
      style={style}
      title={`${booking.guest_name}${booking.booking_number ? ` | ${booking.booking_number}` : ""} | ${booking.check_in} – ${booking.check_out}`
        + (booking.ferry_time ? `\nAnreise mit Fähre ${booking.ferry_time} Uhr` : "")
        + (booking.ferry_time_departure ? `\nAbreise mit Fähre ${booking.ferry_time_departure} Uhr` : "")
        + (isConflict ? "\n⚠ Überschneidung" : "")
        + (isCancelled ? `\nStorniert${booking.is_paid ? " – Kulanzbetrag bezahlt" : booking.cancellationFee ? " – Kulanzbetrag offen" : ""}` : "")}
    >
      {isCancelled ? (
        <>
          <Ban className="w-3 h-3 flex-shrink-0" />
          {booking.is_paid && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />}
        </>
      ) : (
        <>
          {isConflict && <span className="flex-shrink-0 text-[10px]">⚠</span>}
          <span className="truncate min-w-0">{booking.guest_name}</span>
          {!booking.is_paid && (
            <span className="flex-shrink-0 bg-black/20 rounded px-1 text-[9px] font-normal ml-auto">€?</span>
          )}
        </>
      )}
    </button>
  );
}

// ── Resize-Griff am linken/rechten Rand ───────────────────────────────────────
interface ResizeHandleProps {
  booking: Booking;
  mode: "resize-start" | "resize-end";
  left: number; top: number; height: number;
}
function ResizeHandle({ booking, mode, left, top, height }: ResizeHandleProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `${booking.id}__${mode}`,
    data: { booking, mode },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left, top, width: HANDLE_W, height,
        cursor: "ew-resize",
        zIndex: 30,
        touchAction: "none",
      }}
      title={mode === "resize-start" ? "Anreise ändern" : "Abreise ändern"}
    />
  );
}

const DAY_W = 44;
const ROW_H = 52;
const DAY_HEADER_H = 52;
const MONTH_LABEL_H = 22;
const HEADER_H = MONTH_LABEL_H + DAY_HEADER_H;
const LABEL_W = 160;
const BUFFER = 30;

// Buchungsfarbe richtet sich nach dem Status (siehe lib/bookingStatus)
const BOOKING_OVERLAP_COLOR = "#dc2626"; // Rot-Rahmen für echte Doppelbuchungen
const CANCELLED_BAR_H = 15; // dünner Streifen für stornierte Buchungen, unabhängig von Lanes — Platz für Ban- + Bezahlt-Icon

// Stornierte Buchungen zählen nie als Überschneidung — weder für die Lane-Zuteilung
// noch für die Rot-Rahmen-Warnung: der Zeitraum ist wieder frei belegbar.
function noOverlap(a: Booking, b: Booking): boolean {
  return a.status === "storniert" || b.status === "storniert" || !spansOverlap(a, b);
}

// Pixel-Versatz für ein Tages-Segment (0..4) bei gegebener Spaltenbreite.
function segmentOffsetPx(fraction: number): number {
  return Math.round(fraction * DAY_W);
}

// Einrasten: nur X auf Tagesspalten, Y frei (für Wohnungswechsel)
const snapXToDay: Modifier = ({ transform }) => ({
  ...transform,
  x: Math.round(transform.x / DAY_W) * DAY_W,
});

const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const YEARS_AHEAD = 50;
const DAYS_BACK = 365; // 1 year of history for iCal-imported past bookings
const TODAY_COL = DAYS_BACK; // column index of today

const TOTAL_DAYS = (() => {
  const end = new Date(TODAY);
  end.setFullYear(TODAY.getFullYear() + YEARS_AHEAD);
  return DAYS_BACK + Math.floor((end.getTime() - TODAY.getTime()) / 86400000);
})();

// index 0 = DAYS_BACK days before today; index TODAY_COL = today
function getDay(index: number): Date {
  const d = new Date(TODAY);
  d.setDate(TODAY.getDate() + (index - DAYS_BACK));
  return d;
}

function dayIndexOf(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - TODAY.getTime()) / 86400000) + DAYS_BACK;
}

// Weekend tiling — computed from the first column (DAYS_BACK days before today)
const _firstColDay = (() => { const d = new Date(TODAY); d.setDate(TODAY.getDate() - DAYS_BACK); return d; })();
const _firstColDow = _firstColDay.getDay(); // 0=Sun … 6=Sat
const _daysToSat = (6 - _firstColDow + 7) % 7;
const _wStart = _daysToSat * DAY_W;
const _wEnd   = (_daysToSat + 2) * DAY_W;
const _tileW  = DAY_W * 7;

// Row background: separator lines ON TOP, weekend band underneath.
// Order matters: first entry in backgroundImage is the topmost layer.
const TILE_BG: React.CSSProperties = {
  backgroundImage: [
    // Layer 1 (top): 1px day-separator at right edge of every cell — always visible
    `linear-gradient(to right, transparent ${DAY_W - 1}px, #d1d5db ${DAY_W - 1}px, #d1d5db ${DAY_W}px, transparent ${DAY_W}px)`,
    // Layer 2 (bottom): weekend band Sa+Su in light grey
    `linear-gradient(to right, transparent ${_wStart}px, #f1f5f9 ${_wStart}px, #f1f5f9 ${_wEnd}px, transparent ${_wEnd}px)`,
  ].join(", "),
  backgroundSize: `${DAY_W}px 100%, ${_tileW}px 100%`,
  backgroundRepeat: "repeat-x",
};

// Header / house-divider use the same tile as rows — no special week marker
const HEADER_BG: React.CSSProperties = {
  ...TILE_BG,
  // Weekend band is slightly stronger in header/divider rows
  backgroundImage: [
    `linear-gradient(to right, transparent ${DAY_W - 1}px, #d1d5db ${DAY_W - 1}px, #d1d5db ${DAY_W}px, transparent ${DAY_W}px)`,
    `linear-gradient(to right, transparent ${_wStart}px, #e2e8f0 ${_wStart}px, #e2e8f0 ${_wEnd}px, transparent ${_wEnd}px)`,
  ].join(", "),
};

export const CalendarGrid = forwardRef<CalendarGridHandle, CalendarGridProps>(function CalendarGrid(
  { bookings, onBookingClick, onDateRangeSelect }, ref,
) {
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(900);
  const [selection, setSelection] = useState<{ propertyId: string; start: number; end: number } | null>(null);
  const isMouseDown = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { isViewer } = useUserRole();
  const { data: houseSettings = [] } = useHouseSettings();

  // ── Drag & Drop: verschieben / verlängern / verkürzen / Wohnung wechseln ──
  const update = useUpdateBooking();
  const [drag, setDrag] = useState<
    { id: string; mode: DragMode; check_in: string; check_out: string; collision: boolean; targetProperty: string } | null
  >(null);
  const [dragError, setDragError] = useState("");
  const [notifyPrompt, setNotifyPrompt] = useState<{
    booking: BookingFormData;
    changes: FieldChange[];
    house: HouseSettings;
    proceed: () => void;
  } | null>(null);
  const [notifyError, setNotifyError] = useState("");

  const houseFor = useCallback((propertyId: string): HouseSettings | undefined => {
    const prop = properties.find((p) => p.id === propertyId);
    const houseId: HouseId = prop?.house === "Haus Anne" ? "haus-anne" : "upstalsboom";
    return houseSettings.find((h) => h.id === houseId);
  }, [houseSettings]);
  const justDragged = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Neue Daten je nach Modus berechnen
  const computeDates = useCallback((b: Booking, mode: DragMode, dayDelta: number) => {
    if (mode === "resize-start") return resizeStart(b.check_in, b.check_out, dayDelta);
    if (mode === "resize-end")   return resizeEnd(b.check_in, b.check_out, dayDelta);
    return shiftDates(b.check_in, b.check_out, dayDelta);
  }, []);

  // Zielwohnung aus Zeiger-Y ermitteln (nur beim Verschieben); Resize bleibt in der Wohnung
  const targetPropertyOf = useCallback((e: DragMoveEvent | DragEndEvent, b: Booking, mode: DragMode): string => {
    if (mode !== "move") return b.property_id;
    const p = pointerFromEvent(e);
    const hit = p ? propertyUnderPoint(p.x, p.y) : null;
    return hit ?? b.property_id;
  }, []);

  const handleBarClick = useCallback((b: Booking) => {
    if (justDragged.current) return; // nach echtem Ziehen kein Modal öffnen
    onBookingClick(b);
  }, [onBookingClick]);

  const handleDragStart = useCallback((_e: DragStartEvent) => {
    justDragged.current = true;
    setDragError("");
  }, []);

  const handleDragMove = useCallback((e: DragMoveEvent) => {
    const b = e.active.data.current?.booking as Booking | undefined;
    const mode = (e.active.data.current?.mode as DragMode) ?? "move";
    if (!b) return;
    const dd = Math.round(e.delta.x / DAY_W);
    const { check_in, check_out } = computeDates(b, mode, dd);
    const targetProperty = targetPropertyOf(e, b, mode);
    setDrag({
      id: b.id, mode, check_in, check_out, targetProperty,
      collision: hasCollision(bookings, targetProperty, b.id, check_in, check_out, b.ferry_time, b.ferry_time_departure, b.status),
    });
  }, [bookings, computeDates, targetPropertyOf]);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const b = e.active.data.current?.booking as Booking | undefined;
    const mode = (e.active.data.current?.mode as DragMode) ?? "move";
    setDrag(null);
    setTimeout(() => { justDragged.current = false; }, 50);
    if (isViewer) return;
    if (!b) return;
    const dd = Math.round(e.delta.x / DAY_W);
    const { check_in, check_out } = computeDates(b, mode, dd);
    const targetProperty = targetPropertyOf(e, b, mode);
    const datesChanged = check_in !== b.check_in || check_out !== b.check_out;
    const propChanged  = targetProperty !== b.property_id;
    if (!datesChanged && !propChanged) return;
    if (hasCollision(bookings, targetProperty, b.id, check_in, check_out, b.ferry_time, b.ferry_time_departure, b.status) &&
        !window.confirm(
          propChanged
            ? `In „${propName(targetProperty)}" überschneidet sich die Buchung mit einer anderen. Trotzdem dorthin verschieben?`
            : "An diesem Zeitraum überschneidet sich die Buchung mit einer anderen. Trotzdem speichern?",
        )) return;
    if (CONFIRMED_STATUSES.includes(b.status) &&
        !window.confirm("Diese Buchung wurde bereits bestätigt. Wirklich ändern?")) return;
    const newData = { check_in, check_out, property_id: targetProperty };
    const doUpdate = () => {
      update.mutate(
        { id: b.id, data: newData, history: { changes: diffBooking(b, newData) } },
        { onError: () => setDragError("Speichern fehlgeschlagen – bitte erneut versuchen.") },
      );
    };
    const { should, changes } = shouldNotify(b, newData, "update");
    const house = should ? houseFor(newData.property_id) : undefined;
    if (house?.notifyEmail) {
      setNotifyError("");
      setNotifyPrompt({ booking: { ...b, ...newData }, changes, house, proceed: doUpdate });
    } else {
      doUpdate();
    }
  }, [bookings, computeDates, targetPropertyOf, update, isViewer, houseFor]);

  const handleNotifyConfirm = useCallback(async () => {
    if (!notifyPrompt) return;
    setNotifyError("");
    try {
      await sendChangeNotification(notifyPrompt.booking, notifyPrompt.house, notifyPrompt.changes, "update");
    } catch (e) {
      setNotifyError(`Mail konnte nicht gesendet werden: ${(e as Error).message}`);
      return;
    }
    notifyPrompt.proceed();
    setNotifyPrompt(null);
  }, [notifyPrompt]);

  const handleNotifySkip = useCallback(() => {
    if (!notifyPrompt) return;
    notifyPrompt.proceed();
    setNotifyPrompt(null);
    setNotifyError("");
  }, [notifyPrompt]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Start scrolled so today is the first visible day
    el.scrollLeft = DAYS_BACK * DAY_W;
    setScrollLeft(DAYS_BACK * DAY_W);
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollLeft(scrollRef.current.scrollLeft);
  }, []);

  // "Heute"-Button: sofort (ohne Scroll-Animation) so springen, dass der heutige
  // Tag ganz links im sichtbaren Bereich steht.
  useImperativeHandle(ref, () => ({
    scrollToToday: () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollLeft = TODAY_COL * DAY_W;
      setScrollLeft(TODAY_COL * DAY_W);
    },
  }), []);

  const visStart = Math.max(0, Math.floor(scrollLeft / DAY_W) - BUFFER);
  const visEnd   = Math.min(TOTAL_DAYS - 1, Math.ceil((scrollLeft + containerWidth) / DAY_W) + BUFFER);

  const bookingsByProperty = useMemo(() => {
    // 1. Buchungen je Wohnung sammeln
    const raw = new Map<string, Array<{ booking: Booking; startIdx: number; endIdx: number; span: number }>>();
    properties.forEach((p) => raw.set(p.id, []));
    bookings.forEach((b) => {
      const s = dayIndexOf(b.check_in);
      const e = dayIndexOf(b.check_out);
      if (e <= 0 || s >= TOTAL_DAYS) return;
      const clampedS = Math.max(0, s);
      const clampedE = Math.min(TOTAL_DAYS, e);
      raw.get(b.property_id)?.push({ booking: b, startIdx: clampedS, endIdx: clampedE, span: clampedE - clampedS });
    });

    // 2. Lanes zuweisen: zwei Buchungen überschneiden sich gemäß spansOverlap()
    //    (Übergangstag mit kompatiblen Fährzeit-Segmenten gilt NICHT als Überschneidung)
    const map = new Map<string, Array<{ booking: Booking; startIdx: number; endIdx: number; span: number; lane: number; localLanes: number }>>();
    for (const [propId, list] of raw.entries()) {
      const sorted = [...list].sort((a, b) => a.startIdx - b.startIdx);
      const laneOccupant: Array<Booking | null> = [];
      const withLane = sorted.map((item) => {
        let lane = laneOccupant.findIndex((occ) => !occ || noOverlap(occ, item.booking));
        if (lane === -1) { lane = laneOccupant.length; laneOccupant.push(null); }
        laneOccupant[lane] = item.booking;
        return { ...item, lane };
      });
      // Für jede Buchung: lokale Lane-Anzahl = max Lane aller überschneidenden Buchungen + 1
      // → Buchungen ohne Überschneidung bekommen localLanes=1 (volle Höhe)
      const withLocal = withLane.map((item) => {
        const overlapping = withLane.filter(
          (other) => other !== item && !noOverlap(item.booking, other.booking)
        );
        const localLanes = overlapping.length === 0
          ? 1
          : Math.max(item.lane, ...overlapping.map((o) => o.lane)) + 1;
        return { ...item, localLanes };
      });
      map.set(propId, withLocal);
    }
    return map;
  }, [bookings]);

  const getDayIndex = useCallback((clientX: number): number => {
    if (!scrollRef.current) return 0;
    const x = clientX - scrollRef.current.getBoundingClientRect().left + scrollRef.current.scrollLeft;
    return Math.max(0, Math.min(TOTAL_DAYS - 1, Math.floor(x / DAY_W)));
  }, []);

  const handleRowMouseDown = useCallback((propertyId: string, e: React.MouseEvent) => {
    if (e.button !== 0 || isViewer) return;
    e.preventDefault();
    isMouseDown.current = true;
    setSelection({ propertyId, start: getDayIndex(e.clientX), end: getDayIndex(e.clientX) });
  }, [getDayIndex, isViewer]);

  const handleRowMouseMove = useCallback((propertyId: string, e: React.MouseEvent) => {
    if (!isMouseDown.current) return;
    const newEnd = getDayIndex(e.clientX);
    setSelection((prev) => {
      if (!prev || prev.propertyId !== propertyId || prev.end === newEnd) return prev;
      return { ...prev, end: newEnd };
    });
  }, [getDayIndex]);

  const handleMouseUp = useCallback(() => {
    if (!isMouseDown.current) return;
    isMouseDown.current = false;
    setSelection((prev) => {
      if (prev) {
        const s = Math.min(prev.start, prev.end);
        const e = Math.max(prev.start, prev.end);
        onDateRangeSelect(prev.propertyId, getDay(s), getDay(e));
      }
      return null;
    });
  }, [onDateRangeSelect]);

  const byHouse = useMemo(() =>
    properties.reduce<Record<string, typeof properties>>((acc, p) => {
      (acc[p.house] ??= []).push(p);
      return acc;
    }, {}), []);

  const totalWidth = TOTAL_DAYS * DAY_W;

  const visibleDays = useMemo(() => {
    const days = [];
    for (let i = visStart; i <= visEnd; i++) days.push({ i, day: getDay(i) });
    return days;
  }, [visStart, visEnd]);

  // Eigene Monats-/Jahres-Leiste über dem Tages-Header: ein Block pro Monat im
  // sichtbaren Bereich, exakt so breit wie die Tage dieses Monats. Scrollt ganz
  // normal mit dem Raster mit (kein position:sticky).
  const visibleMonths = useMemo(() => {
    const startDay = getDay(visStart);
    const endDay = getDay(visEnd);
    const months: { year: number; month: number; startIdx: number; endIdx: number }[] = [];
    let cursor = new Date(startDay.getFullYear(), startDay.getMonth(), 1);
    const lastMonth = new Date(endDay.getFullYear(), endDay.getMonth(), 1);
    while (cursor <= lastMonth) {
      const year = cursor.getFullYear(), month = cursor.getMonth();
      const first = new Date(year, month, 1);
      const last  = new Date(year, month + 1, 0);
      const startIdx = Math.max(0, Math.round((first.getTime() - TODAY.getTime()) / 86400000) + DAYS_BACK);
      const endIdx   = Math.min(TOTAL_DAYS - 1, Math.round((last.getTime() - TODAY.getTime()) / 86400000) + DAYS_BACK);
      months.push({ year, month, startIdx, endIdx });
      cursor = new Date(year, month + 1, 1);
    }
    return months;
  }, [visStart, visEnd]);

  return (
    <>
    <DndContext
      sensors={isViewer ? [] : sensors}
      modifiers={[snapXToDay]}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
    <div className="flex h-full select-none" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

      {dragError && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg">
          {dragError}
        </div>
      )}

      {/* ── Completely fixed label column — never scrolls ── */}
      <div className="flex-shrink-0 z-20 bg-white border-r border-gray-200" style={{ width: LABEL_W }}>
        {/* Header corner */}
        <div className="bg-gray-50 border-b border-gray-200" style={{ height: HEADER_H }} />

        {/* Scrollable mirror — synced via JS scroll events on the right panel */}
        <div className="overflow-hidden" style={{ height: `calc(100% - ${HEADER_H}px)` }}>
          <div
            id="label-scroll-mirror"
            style={{ transform: `translateY(0)` }}
          >
            {Object.entries(byHouse).map(([house, props]) => (
              <div key={house}>
                <div
                  className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-200 flex items-center"
                  style={{ height: 28 }}
                >
                  {house}
                </div>
                {props.map((p) => (
                  <div
                    key={p.id}
                    className="px-3 flex items-center gap-1.5 border-b border-gray-100 text-sm font-medium text-gray-800"
                    style={{ height: ROW_H }}
                  >
                    <span className="truncate">{p.name}</span>
                    {!p.allowsDogs && (
                      <span title="Keine Hunde erlaubt">
                        <Dog className="w-3 h-3 text-gray-300 flex-shrink-0" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Scrollable grid ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        onScroll={(e) => {
          handleScroll();
          // Mirror vertical scroll into the label column
          const mirror = document.getElementById("label-scroll-mirror");
          if (mirror) mirror.style.transform = `translateY(-${(e.target as HTMLDivElement).scrollTop}px)`;
        }}
      >
        <div style={{ width: totalWidth, position: "relative" }}>

          {/* ── Monats-/Jahres-Leiste + Tages-Header ── */}
          <div className="sticky top-0 z-10">
            {/* Monats-/Jahres-Leiste — eigener Block pro Monat, scrollt normal mit */}
            <div className="relative border-b border-gray-200" style={{ height: MONTH_LABEL_H, backgroundColor: "#f3f4f6" }}>
              {visibleMonths.map(({ year, month, startIdx, endIdx }) => {
                const isCurrentMonth = year === TODAY.getFullYear() && month === TODAY.getMonth();
                const label = new Date(year, month, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
                return (
                  <div
                    key={`${year}-${month}`}
                    className="absolute top-0 border-l-2 border-gray-400 overflow-hidden"
                    style={{ left: startIdx * DAY_W, width: (endIdx - startIdx + 1) * DAY_W, height: MONTH_LABEL_H }}
                  >
                    <span
                      className={`pl-1.5 text-[10px] font-bold uppercase whitespace-nowrap leading-none flex items-center h-full ${
                        isCurrentMonth ? "text-blue-600" : "text-gray-500"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Tages-Header */}
            <div className="relative border-b border-gray-200" style={{ height: DAY_HEADER_H, backgroundColor: "#f9fafb", ...HEADER_BG }}>
              <div className="absolute top-0 bottom-0 bg-blue-100 pointer-events-none" style={{ left: TODAY_COL * DAY_W, width: DAY_W }} />
              {visibleDays.map(({ i, day }) => {
                const isToday = i === TODAY_COL;
                const isMonthStart = day.getDate() === 1;
                return (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 flex flex-col items-center justify-center pointer-events-none"
                    style={{
                      left: i * DAY_W,
                      width: DAY_W,
                      borderLeft: isMonthStart ? "2px solid #9ca3af" : undefined,
                    }}
                  >
                    <span className={`text-[10px] leading-none ${isToday ? "text-blue-500" : "text-gray-400"}`}>
                      {day.toLocaleDateString("de-DE", { weekday: "narrow" })}
                    </span>
                    <span className={`text-xs font-bold leading-none ${isToday ? "text-blue-600" : "text-gray-700"}`}>
                      {day.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Property rows ── */}
          {Object.entries(byHouse).map(([house, props]) => (
            <div key={house}>
              <div className="border-b border-gray-200" style={{ height: 28, backgroundColor: "#f9fafb", ...HEADER_BG }} />
              {props.map((property) => {
                const propBookings = bookingsByProperty.get(property.id) ?? [];
                const isSel = selection?.propertyId === property.id;
                const selStart = isSel ? Math.min(selection!.start, selection!.end) : -1;
                const selEnd   = isSel ? Math.max(selection!.start, selection!.end) : -1;
                const isDropTargetRow = drag?.mode === "move" && drag.targetProperty === property.id && drag.id;
                const isSourceRow = drag?.mode === "move" && bookingsByProperty.get(property.id)?.some((x) => x.booking.id === drag.id);
                return (
                  <div
                    key={property.id}
                    data-property={property.id}
                    className="relative border-b border-gray-100 cursor-crosshair"
                    style={{ height: ROW_H, backgroundColor: "#ffffff", ...TILE_BG }}
                    onMouseDown={(e) => handleRowMouseDown(property.id, e)}
                    onMouseMove={(e) => handleRowMouseMove(property.id, e)}
                  >
                    <div className="absolute inset-y-0 bg-blue-50 pointer-events-none" style={{ left: TODAY_COL * DAY_W, width: DAY_W }} />
                    {isDropTargetRow && !isSourceRow && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ backgroundColor: drag?.collision ? "rgba(220,38,38,0.10)" : "rgba(22,163,74,0.12)" }}
                      />
                    )}
                    {isSel && selEnd >= selStart && (
                      <div
                        className="absolute inset-y-0 bg-blue-200/50 pointer-events-none"
                        style={{ left: selStart * DAY_W, width: (selEnd - selStart + 1) * DAY_W }}
                      />
                    )}
                    {propBookings
                      .filter(({ startIdx, span }) => startIdx + span >= visStart && startIdx <= visEnd)
                      .map(({ booking, startIdx, span, lane, localLanes }) => {
                        // Basis-Geometrie: Balken beginnt/endet im Fährzeit-Segment
                        // der An- bzw. Abreise (Fallback Segment 2 / 09:00 ohne Fährzeit).
                        const startOffset = segmentOffsetPx(arrivalFraction(booking.ferry_time));
                        const endOffset   = segmentOffsetPx(departureFraction(booking.ferry_time_departure));
                        const baseLeft  = startIdx * DAY_W + startOffset + 1;
                        const baseWidth = span * DAY_W + endOffset - startOffset - 2;

                        // Volle Höhe wenn keine Überschneidung, sonst aufgeteilt. Stornierte
                        // Buchungen bekommen unabhängig davon immer einen dünnen Streifen am
                        // unteren Zeilenrand — erzwingen nie eine eigene Lane und verschwinden
                        // nie hinter einer neuen Buchung im selben Zeitraum.
                        const rowPad    = 4;
                        const laneH     = Math.floor((ROW_H - rowPad * 2) / localLanes);
                        const isCancelled = booking.status === "storniert";
                        const barTop    = isCancelled ? ROW_H - rowPad - CANCELLED_BAR_H : rowPad + lane * laneH + 1;
                        const barHeight = isCancelled ? CANCELLED_BAR_H : laneH - 2;

                        const isConflict = localLanes > 1 && lane > 0; // echte Doppelbuchung
                        const isActiveDrag = drag?.id === booking.id;

                        // Live-Vorschau beim Resize: Balkenfüllung aus den geänderten Daten
                        // (Fährzeiten/Segmente der Buchung ändern sich beim Resize nicht)
                        let barLeft = baseLeft, barWidth = baseWidth;
                        if (isActiveDrag && drag && drag.mode !== "move") {
                          const ns = dayIndexOf(drag.check_in);
                          const ne = dayIndexOf(drag.check_out);
                          barLeft  = ns * DAY_W + startOffset + 1;
                          barWidth = (ne - ns) * DAY_W + endOffset - startOffset - 2;
                        }

                        // Resize-Griffe nur bei ausreichend breiten Balken (Basis-Position, stabil)
                        const showHandles = baseWidth >= 2 * HANDLE_W + 8;

                        return (
                          <div key={booking.id}>
                            <DraggableBar
                              booking={booking}
                              left={barLeft}
                              width={barWidth}
                              top={barTop}
                              height={barHeight}
                              isConflict={isConflict}
                              isActiveDrag={isActiveDrag}
                              dragCollision={drag?.collision ?? false}
                              onClickBar={handleBarClick}
                            />
                            {showHandles && (
                              <>
                                <ResizeHandle
                                  booking={booking} mode="resize-start"
                                  left={baseLeft - HANDLE_W / 2} top={barTop} height={barHeight}
                                />
                                <ResizeHandle
                                  booking={booking} mode="resize-end"
                                  left={baseLeft + baseWidth - HANDLE_W / 2} top={barTop} height={barHeight}
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
    </DndContext>
    {notifyPrompt && (
      <NotifyDialog
        open
        fromEmail={notifyPrompt.house.contactEmail}
        toEmail={notifyPrompt.house.notifyEmail}
        summary={`${properties.find((p) => p.id === notifyPrompt.booking.property_id)?.name ?? notifyPrompt.booking.property_id} · ${notifyPrompt.booking.guest_name || "–"} · ${notifyPrompt.booking.check_in} – ${notifyPrompt.booking.check_out}`}
        error={notifyError}
        onConfirm={handleNotifyConfirm}
        onSkip={handleNotifySkip}
      />
    )}
    </>
  );
});
