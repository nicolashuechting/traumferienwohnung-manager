import { useState, useRef, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle } from "react";
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable,
  type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from "@dnd-kit/core";
// DragOverlay entfernt — Live-Vorschau erfolgt direkt im Raster über previewDates-State
import { statusConfig, CONFIRMED_STATUSES } from "@/lib/bookingStatus";
import { useUpdateBooking } from "@/hooks/useBookings";
import { shiftDates, setStartDate, setEndDate, hasCollision, spansOverlap, daysDiffISO } from "@/lib/bookingDrag";
import { arrivalFraction, departureFraction } from "@/lib/daySegments";
import { diffBooking } from "@/lib/bookingHistory";
import type { Booking } from "@/types";

type MonthDragMode = "move" | "resize-start" | "resize-end";
const HANDLE_W = 10;

// Neue Daten je nach Modus. Resize: `iso` ist direkt die neue Kante.
// Move: `iso` relativ zum Tag beim Greifen (`grabIso`) in eine Tagesdifferenz umrechnen.
function computeMonthDates(b: Booking, mode: MonthDragMode, iso: string, grabIso: string | null) {
  if (mode === "resize-start") return setStartDate(b.check_in, b.check_out, iso);
  if (mode === "resize-end")   return setEndDate(b.check_in, b.check_out, iso);
  const dayDelta = daysDiffISO(grabIso ?? b.check_in, iso);
  return shiftDates(b.check_in, b.check_out, dayDelta);
}

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateUnderPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const cell = el?.closest("[data-date]") as HTMLElement | null;
  return cell?.getAttribute("data-date") ?? null;
}

function pointerFromEvent(e: DragMoveEvent | DragEndEvent): { x: number; y: number } | null {
  const a = e.activatorEvent as PointerEvent | undefined;
  if (!a || typeof a.clientX !== "number") return null;
  return { x: a.clientX + e.delta.x, y: a.clientY + e.delta.y };
}

interface SingleCalendarViewProps {
  propertyId: string;
  bookings: Booking[];
  onBookingClick: (booking: Booking) => void;
  onDateRangeSelect: (propertyId: string, start: Date, end: Date) => void;
}

export interface SingleCalendarViewHandle {
  scrollToToday: () => void;
}

const CELL_W = 44;
const CELL_H = 68;
const DAY_HEADER_H = 32;
const MONTH_HEADER_H = 36;
const ROW_H = CELL_H;
const MONTH_W = CELL_W * 7;
const MONTH_GAP = 16;
const MONTH_TOTAL_W = MONTH_W + MONTH_GAP;
const BUFFER_MONTHS = 2;

const BOOKING_OVERLAP_COLOR = "#dc2626";
const BAR_H = 26;

function segmentOffsetPx(fraction: number): number {
  return Math.round(fraction * CELL_W);
}

const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const MONTHS_BACK = 12;
const TOTAL_MONTHS = MONTHS_BACK + 600;

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const IS_WEEKEND = [false, false, false, false, false, true, true];

interface MonthData {
  year: number;
  month: number;
  weeks: Array<Array<Date | null>>;
  label: string;
}

function buildMonth(year: number, month: number): MonthData {
  const label = new Date(year, month, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1);
  const startSlot = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeks: Array<Array<Date | null>> = [];
  let week: Array<Date | null> = Array(7).fill(null);
  let slot = startSlot;

  for (let d = 1; d <= daysInMonth; d++) {
    week[slot] = new Date(year, month, d);
    slot++;
    if (slot === 7) {
      weeks.push(week);
      week = Array(7).fill(null);
      slot = 0;
    }
  }
  if (slot > 0) weeks.push(week);
  return { year, month, weeks, label };
}

const ALL_MONTHS: MonthData[] = (() => {
  const arr: MonthData[] = [];
  for (let i = 0; i < TOTAL_MONTHS; i++) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - MONTHS_BACK + i, 1);
    arr.push(buildMonth(d.getFullYear(), d.getMonth()));
  }
  return arr;
})();

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface BookingBar {
  booking: Booking;
  startSlot: number;
  span: number;
  isStart: boolean;
  isEnd: boolean;
  lane: number;
  localLanes: number;
  showName: boolean;
}

function getBarsForWeek(
  week: Array<Date | null>,
  bookings: Array<{ booking: Booking; lane: number; localLanes: number }>,
): BookingBar[] {
  const bars: BookingBar[] = [];
  bookings.forEach(({ booking, lane, localLanes }) => {
    const checkIn  = new Date(booking.check_in  + "T00:00:00");
    const checkOut = new Date(booking.check_out + "T00:00:00");
    let startSlot = -1, endSlot = -1;
    week.forEach((d, i) => {
      if (!d) return;
      if (d >= checkIn && d <= checkOut) {
        if (startSlot === -1) startSlot = i;
        endSlot = i;
      }
    });
    if (startSlot === -1) return;
    bars.push({
      booking,
      startSlot,
      span: endSlot - startSlot + 1,
      isStart: sameDay(week[startSlot]!, checkIn),
      isEnd:   sameDay(week[endSlot]!,   checkOut),
      lane,
      localLanes,
      showName: false,
    });
  });
  return bars;
}

function barGeometry(bar: BookingBar): { startOffset: number; endOffset: number; width: number } {
  const startOffset = bar.isStart ? segmentOffsetPx(arrivalFraction(bar.booking.ferry_time)) : 0;
  const endOffset   = bar.isEnd   ? segmentOffsetPx(departureFraction(bar.booking.ferry_time_departure)) : CELL_W;
  const width = (bar.span - 1) * CELL_W + endOffset - startOffset - 2;
  return { startOffset, endOffset, width };
}

const MIN_NAME_W = 38;

function assignShowName(allBars: BookingBar[][]): void {
  const byId = new Map<string, Array<{ bar: BookingBar; usableW: number }>>();
  allBars.forEach((weekBars) => {
    weekBars.forEach((bar) => {
      const usableW = barGeometry(bar).width;
      const entry = { bar, usableW };
      const list = byId.get(bar.booking.id);
      if (list) list.push(entry);
      else byId.set(bar.booking.id, [entry]);
    });
  });
  byId.forEach((segments) => {
    const best = segments.reduce((a, b) => {
      if (b.usableW > a.usableW) return b;
      if (b.usableW === a.usableW && b.bar.isStart && !a.bar.isStart) return b;
      return a;
    });
    best.bar.showName = true;
  });
}

// ── Verschiebbares Buchungssegment ────────────────────────────────────────────
interface MonthBarProps {
  dragId: string;
  bar: BookingBar;
  left: number; width: number; top: number; height: number;
  radius: number | string;
  isConflict: boolean;
  nameW: number;
  isActiveDrag: boolean;    // diese Buchung wird gerade gezogen → abdunkeln
  isAnyDragActive: boolean; // irgendein Drag läuft → pointer-events deaktivieren
  onClickBar: (b: Booking) => void;
}
function MonthBar({ dragId, bar, left, width, top, height, radius, isConflict, nameW, isActiveDrag, isAnyDragActive, onClickBar }: MonthBarProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { booking: bar.booking, mode: "move" as MonthDragMode },
  });
  const style: React.CSSProperties = {
    position: "absolute",
    left, width: Math.max(4, width), top, height,
    backgroundColor: statusConfig(bar.booking.status).barColor,
    borderRadius: radius,
    boxShadow: isConflict ? `0 0 0 2px ${BOOKING_OVERLAP_COLOR}` : undefined,
    // Aktivierte Buchung wird auf 30% Opacity gedimmt (wie CalendarGrid 0.4),
    // damit der Vorschau-Balken an der neuen Position gut sichtbar ist.
    opacity: isActiveDrag ? 0.3 : 1,
    zIndex: isConflict ? 2 : 1,
    cursor: isDragging ? "grabbing" : "grab",
    touchAction: "none",
    // Während eines Drags pointer-events deaktivieren damit dateUnderPoint()
    // die darunterliegenden data-date Zellen erreicht.
    pointerEvents: isAnyDragActive ? "none" : undefined,
  };
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClickBar(bar.booking); }}
      className="flex items-center gap-0.5 px-1.5 text-white text-[11px] font-semibold overflow-hidden"
      style={style}
      title={`${bar.booking.guest_name}${bar.booking.booking_number ? ` | ${bar.booking.booking_number}` : ""} | ${bar.booking.check_in} – ${bar.booking.check_out}`
        + (bar.booking.ferry_time ? `\nAnreise mit Fähre ${bar.booking.ferry_time} Uhr` : "")
        + (bar.booking.ferry_time_departure ? `\nAbreise mit Fähre ${bar.booking.ferry_time_departure} Uhr` : "")
        + (isConflict ? "\n⚠ Überschneidung" : "")}
    >
      {bar.showName && isConflict && <span className="flex-shrink-0 text-[10px]">⚠</span>}
      {bar.showName && nameW >= MIN_NAME_W && (
        <span className="truncate min-w-0">{bar.booking.guest_name}</span>
      )}
      {bar.showName && nameW < MIN_NAME_W && (
        <span className="truncate min-w-0 text-[10px]">{bar.booking.guest_name.split(" ").pop()}</span>
      )}
      {bar.showName && !bar.booking.is_paid && (
        <span className="flex-shrink-0 bg-black/20 rounded px-0.5 text-[9px] font-normal ml-auto">€?</span>
      )}
    </button>
  );
}

// ── Resize-Griff ──────────────────────────────────────────────────────────────
interface MonthResizeHandleProps {
  booking: Booking;
  mode: "resize-start" | "resize-end";
  dragId: string;
  left: number; top: number; height: number;
  isAnyDragActive: boolean;
}
function MonthResizeHandle({ booking, mode, dragId, left, top, height, isAnyDragActive }: MonthResizeHandleProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: dragId,
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
        left,
        top,
        // Mindestbreite 16px für zuverlässige Klickfläche, auch bei schmalen Segmenten
        width: Math.max(HANDLE_W, 16),
        height,
        cursor: "ew-resize",
        zIndex: 3,
        touchAction: "none",
        pointerEvents: isAnyDragActive ? "none" : undefined,
      }}
      title={mode === "resize-start" ? "Anreise ändern" : "Abreise ändern"}
    />
  );
}

export const SingleCalendarView = forwardRef<SingleCalendarViewHandle, SingleCalendarViewProps>(function SingleCalendarView({
  propertyId,
  bookings,
  onBookingClick,
  onDateRangeSelect,
}, ref) {
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(960);
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);
  const isDragging = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Drag & Drop ──
  const update = useUpdateBooking();
  // Snapshot der aktiven Buchung beim Drag-Start (unveränderlich während des Drags)
  const [activeBookingSnapshot, setActiveBookingSnapshot] = useState<Booking | null>(null);
  // Vorschau-Daten: neue check_in/check_out und Kollisionsstatus während des Drags
  const [previewDates, setPreviewDates] = useState<{
    check_in: string; check_out: string; collision: boolean;
  } | null>(null);
  const [moveError, setMoveError] = useState("");
  const justDragged = useRef(false);
  const grabIsoRef = useRef<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleBarClick = useCallback((b: Booking) => {
    if (justDragged.current) return;
    onBookingClick(b);
  }, [onBookingClick]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const b = e.active.data.current?.booking as Booking | undefined;
    justDragged.current = true;
    setMoveError("");
    setActiveBookingSnapshot(b ?? null);
    // Sofort mit aktuellen Daten vorinitialisieren → Vorschau-Balken erscheint
    // bereits beim Greifen, bevor die erste Mausbewegung registriert wird.
    if (b) {
      setPreviewDates({ check_in: b.check_in, check_out: b.check_out, collision: false });
    }
    const a = e.activatorEvent as PointerEvent | undefined;
    grabIsoRef.current = a && typeof a.clientX === "number" ? dateUnderPoint(a.clientX, a.clientY) : null;
  }, []);

  const handleDragMove = useCallback((e: DragMoveEvent) => {
    const b = e.active.data.current?.booking as Booking | undefined;
    const mode = (e.active.data.current?.mode as MonthDragMode) ?? "move";
    const p = pointerFromEvent(e);
    if (!b || !p) { setPreviewDates(null); return; }
    const iso = dateUnderPoint(p.x, p.y);
    if (!iso) { setPreviewDates(null); return; }
    const { check_in, check_out } = computeMonthDates(b, mode, iso, grabIsoRef.current);
    setPreviewDates({
      check_in,
      check_out,
      collision: hasCollision(bookings, b.property_id, b.id, check_in, check_out, b.ferry_time, b.ferry_time_departure),
    });
  }, [bookings]);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const b = e.active.data.current?.booking as Booking | undefined;
    const mode = (e.active.data.current?.mode as MonthDragMode) ?? "move";
    const p = pointerFromEvent(e);
    setActiveBookingSnapshot(null);
    setPreviewDates(null);
    setTimeout(() => { justDragged.current = false; }, 50);
    if (!b || !p) return;
    const iso = dateUnderPoint(p.x, p.y);
    if (!iso) return;
    const { check_in, check_out } = computeMonthDates(b, mode, iso, grabIsoRef.current);
    if (check_in === b.check_in && check_out === b.check_out) return;
    if (hasCollision(bookings, b.property_id, b.id, check_in, check_out, b.ferry_time, b.ferry_time_departure) &&
        !window.confirm("An diesem Zeitraum überschneidet sich die Buchung mit einer anderen. Trotzdem speichern?")) return;
    if (CONFIRMED_STATUSES.includes(b.status) &&
        !window.confirm("Diese Buchung wurde bereits bestätigt. Wirklich ändern?")) return;
    const newData = { check_in, check_out };
    update.mutate(
      { id: b.id, data: newData, history: { changes: diffBooking(b, newData) } },
      { onError: () => setMoveError("Speichern fehlgeschlagen – bitte erneut versuchen.") },
    );
  }, [bookings, update]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const initialLeft = MONTHS_BACK * MONTH_TOTAL_W;
    el.scrollLeft = initialLeft;
    setScrollLeft(initialLeft);
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollLeft(scrollRef.current.scrollLeft);
  }, []);

  // "Heute"-Button: sofort (ohne Scroll-Animation) so springen, dass der Block
  // des aktuellen Monats so weit links wie möglich, aber vollständig sichtbar steht.
  useImperativeHandle(ref, () => ({
    scrollToToday: () => {
      const el = scrollRef.current;
      if (!el) return;
      const idealLeft = MONTHS_BACK * MONTH_TOTAL_W;
      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      const clamped = Math.max(0, Math.min(idealLeft, maxLeft));
      el.scrollLeft = clamped;
      setScrollLeft(clamped);
    },
  }), []);

  const propertyBookings = useMemo(() => {
    const filtered = bookings
      .filter((b) => b.property_id === propertyId && b.check_in && b.check_out)
      .map((b) => ({
        booking: b,
        startMs: new Date(b.check_in + "T00:00:00").getTime(),
      }))
      .sort((a, b) => a.startMs - b.startMs);

    const laneOccupant: Array<Booking | null> = [];
    const withLane = filtered.map((item) => {
      let lane = laneOccupant.findIndex((occ) => !occ || !spansOverlap(occ, item.booking));
      if (lane === -1) { lane = laneOccupant.length; laneOccupant.push(null); }
      laneOccupant[lane] = item.booking;
      return { ...item, lane };
    });

    return withLane.map((item) => {
      const overlapping = withLane.filter((o) => o !== item && spansOverlap(item.booking, o.booking));
      const localLanes = overlapping.length === 0
        ? 1
        : Math.max(item.lane, ...overlapping.map((o) => o.lane)) + 1;
      return { booking: item.booking, lane: item.lane, localLanes };
    });
  }, [bookings, propertyId]);

  const visMonthStart = Math.max(0, Math.floor(scrollLeft / MONTH_TOTAL_W) - BUFFER_MONTHS);
  const visMonthEnd = Math.min(TOTAL_MONTHS - 1, Math.ceil((scrollLeft + containerWidth) / MONTH_TOTAL_W) + BUFFER_MONTHS);

  const isInDrag = useCallback((d: Date) => {
    if (!dragStart || !dragEnd) return false;
    const lo = dragStart <= dragEnd ? dragStart : dragEnd;
    const hi = dragStart <= dragEnd ? dragEnd : dragStart;
    return d >= lo && d <= hi;
  }, [dragStart, dragEnd]);

  const handleDayMouseDown = useCallback((d: Date, e: React.MouseEvent) => {
    if (activeBookingSnapshot) return; // kein Datumsbereich-Select während Buchungs-Drag
    e.preventDefault();
    isDragging.current = true;
    setDragStart(d);
    setDragEnd(d);
  }, [activeBookingSnapshot]);

  const handleDayMouseEnter = useCallback((d: Date) => {
    if (isDragging.current) setDragEnd(d);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (dragStart && dragEnd) {
      const lo = dragStart <= dragEnd ? dragStart : dragEnd;
      const hi = dragStart <= dragEnd ? dragEnd : dragStart;
      onDateRangeSelect(propertyId, lo, hi);
    }
    setDragStart(null);
    setDragEnd(null);
  }, [dragStart, dragEnd, propertyId, onDateRangeSelect]);

  const totalWidth = TOTAL_MONTHS * MONTH_TOTAL_W;
  const monthHeight = MONTH_HEADER_H + DAY_HEADER_H + 6 * ROW_H + 8;
  const isAnyDragActive = activeBookingSnapshot !== null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
    {moveError && (
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg">
        {moveError}
      </div>
    )}
    <div
      ref={scrollRef}
      className="flex-1 overflow-x-auto overflow-y-auto select-none"
      onScroll={handleScroll}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div style={{ width: totalWidth, minHeight: monthHeight + 24, padding: "16px 0", position: "relative" }}>
        {ALL_MONTHS.slice(visMonthStart, visMonthEnd + 1).map((monthData, relIdx) => {
          const absIdx = visMonthStart + relIdx;
          const left = absIdx * MONTH_TOTAL_W;

          return (
            <div
              key={`${monthData.year}-${monthData.month}`}
              style={{ position: "absolute", left, top: 16, width: MONTH_W }}
            >
              {/* Monats-Header */}
              <div
                className={`text-sm font-bold mb-1 px-1 ${
                  monthData.year === TODAY.getFullYear() && monthData.month === TODAY.getMonth()
                    ? "text-blue-600" : "text-gray-800"
                }`}
                style={{ height: MONTH_HEADER_H, display: "flex", alignItems: "center" }}
              >
                {monthData.label}
              </div>

              {/* Wochentage-Header */}
              <div className="flex border-b border-gray-200 mb-0">
                {DAY_LABELS.map((lbl, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center text-xs font-semibold"
                    style={{ width: CELL_W, height: DAY_HEADER_H, color: IS_WEEKEND[i] ? "#94a3b8" : "#6b7280" }}
                  >
                    {lbl}
                  </div>
                ))}
              </div>

              {/* Wochenzeilen */}
              {(() => {
                const allWeekBars = monthData.weeks.map((week) => getBarsForWeek(week, propertyBookings));
                assignShowName(allWeekBars);
                return monthData.weeks.map((week, wi) => ({ week, bars: allWeekBars[wi] }));
              })().map(({ week, bars }, wi) => {

                // Vorschau-Balken für diese Wochenzeile berechnen (nur während eines Drags)
                const previewBarsThisWeek = previewDates && activeBookingSnapshot
                  ? getBarsForWeek(week, [{
                      booking: {
                        ...activeBookingSnapshot,
                        check_in: previewDates.check_in,
                        check_out: previewDates.check_out,
                      },
                      lane: 0,
                      localLanes: 1,
                    }])
                  : [];

                return (
                  <div key={wi} className="relative" style={{ height: ROW_H }}>
                    {/* Tageszellen */}
                    <div className="flex h-full">
                      {week.map((day, di) => {
                        const isToday = day ? sameDay(day, TODAY) : false;
                        const isDragHighlight = day ? isInDrag(day) : false;
                        const isWeekend = IS_WEEKEND[di];
                        const iso = day ? toLocalISO(day) : null;

                        return (
                          <div
                            key={di}
                            data-date={iso ?? undefined}
                            className="relative border-r border-b border-gray-100 flex-shrink-0"
                            style={{
                              width: CELL_W,
                              height: ROW_H,
                              backgroundColor: isDragHighlight
                                ? "#bfdbfe"
                                : isWeekend
                                  ? "#f8fafc"
                                  : "#ffffff",
                              cursor: day ? "pointer" : "default",
                            }}
                            onMouseDown={day ? (e) => handleDayMouseDown(day, e) : undefined}
                            onMouseEnter={day ? () => handleDayMouseEnter(day) : undefined}
                          >
                            {day && (
                              <span
                                className="absolute text-xs font-medium select-none"
                                style={{
                                  top: 5, left: 0, right: 0,
                                  textAlign: "center",
                                  color: isToday ? "#2563eb" : isWeekend ? "#94a3b8" : "#374151",
                                  fontWeight: isToday ? 700 : 500,
                                }}
                              >
                                {isToday ? (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold">
                                    {day.getDate()}
                                  </span>
                                ) : (
                                  day.getDate()
                                )}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Buchungsbalken */}
                    {bars.map((bar, bi) => {
                      const isOverlap = bar.localLanes > 1;
                      const laneH   = Math.floor(BAR_H / bar.localLanes);
                      const barH    = isOverlap ? laneH - 1 : BAR_H;
                      const barTop  = ROW_H - BAR_H - 4 + (isOverlap ? bar.lane * laneH : 0);

                      const { startOffset, width: barWidth } = barGeometry(bar);
                      const barLeft = bar.startSlot * CELL_W + startOffset + 1;

                      const isConflict  = isOverlap && bar.lane > 0;
                      const isActiveDrag = bar.booking.id === activeBookingSnapshot?.id;

                      const radius = bar.isStart && bar.isEnd ? 4
                        : bar.isStart ? "4px 0 0 4px"
                        : bar.isEnd   ? "0 4px 4px 0" : 0;

                      const dragId = `${bar.booking.id}-${monthData.year}-${monthData.month}-${wi}-${bi}`;

                      // Bug 2: Start-Griff nur bei ausreichender Balkenbreite (braucht Platz
                      // für beide Griffe). End-Griff IMMER zeigen — auch bei sehr schmalen
                      // Segmenten, damit das Buchungsende immer ziehbar ist.
                      const showStartHandle = bar.isStart && barWidth >= 2 * HANDLE_W + 4;
                      const showEndHandle   = bar.isEnd;

                      return (
                        <div key={dragId}>
                          <MonthBar
                            dragId={dragId}
                            bar={bar}
                            left={barLeft}
                            width={barWidth}
                            top={barTop}
                            height={barH}
                            radius={radius}
                            isConflict={isConflict}
                            nameW={barWidth}
                            isActiveDrag={isActiveDrag}
                            isAnyDragActive={isAnyDragActive}
                            onClickBar={handleBarClick}
                          />
                          {showStartHandle && (
                            <MonthResizeHandle
                              booking={bar.booking} mode="resize-start"
                              dragId={`${dragId}__resize-start`}
                              left={barLeft - HANDLE_W / 2} top={barTop} height={barH}
                              isAnyDragActive={isAnyDragActive}
                            />
                          )}
                          {showEndHandle && (
                            <MonthResizeHandle
                              booking={bar.booking} mode="resize-end"
                              dragId={`${dragId}__resize-end`}
                              left={barLeft + barWidth - HANDLE_W / 2} top={barTop} height={barH}
                              isAnyDragActive={isAnyDragActive}
                            />
                          )}
                        </div>
                      );
                    })}

                    {/* Vorschau-Balken (während Drag, anstelle des DragOverlay-Ghosts) ──
                        Zeigen in Echtzeit an, wo die Buchung nach dem Loslassen landen würde.
                        Grüner/roter Rahmen = keine/vorhandene Kollision.
                        pointer-events:none damit dateUnderPoint() die Zellen dahinter trifft. */}
                    {previewBarsThisWeek.map((pBar, pi) => {
                      const { startOffset: pSO, width: pWidth } = barGeometry(pBar);
                      const pLeft = pBar.startSlot * CELL_W + pSO + 1;
                      const pTop  = ROW_H - BAR_H - 4;

                      const pRadius = pBar.isStart && pBar.isEnd ? 4
                        : pBar.isStart ? "4px 0 0 4px"
                        : pBar.isEnd   ? "0 4px 4px 0" : 0;

                      return (
                        <div
                          key={`preview-${pi}`}
                          className="flex items-center px-1.5 text-white text-[11px] font-semibold overflow-hidden pointer-events-none"
                          style={{
                            position: "absolute",
                            left: pLeft,
                            width: Math.max(4, pWidth),
                            top: pTop,
                            height: BAR_H,
                            backgroundColor: statusConfig(activeBookingSnapshot!.status).barColor,
                            borderRadius: pRadius,
                            boxShadow: `0 0 0 2px ${previewDates!.collision ? "#dc2626" : "#16a34a"}, 0 2px 8px rgba(0,0,0,0.2)`,
                            opacity: 0.9,
                            zIndex: 10,
                          }}
                        >
                          {pBar.isStart && pWidth >= MIN_NAME_W && (
                            <span className="truncate min-w-0">{activeBookingSnapshot!.guest_name}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
    </DndContext>
  );
});
