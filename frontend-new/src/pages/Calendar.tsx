import { useRef, useState } from "react";
import { Plus, LayoutGrid, CalendarDays, CalendarCheck } from "lucide-react";
import { CalendarGrid, type CalendarGridHandle } from "@/components/CalendarGrid";
import { SingleCalendarView, type SingleCalendarViewHandle } from "@/components/SingleCalendarView";
import { BookingModal } from "@/components/BookingModal";
import { useBookings } from "@/hooks/useBookings";
import { useUserRole } from "@/hooks/useUserRole";
import { properties } from "@/lib/properties";
import type { Booking } from "@/types";

type ViewMode = "multi" | "single";

export function Calendar() {
  const { data: bookings = [], isLoading, error } = useBookings();
  const { isViewer } = useUserRole();
  const [viewMode, setViewMode] = useState<ViewMode>("multi");
  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0].id);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ propertyId: string; checkIn: string; checkOut: string } | undefined>();
  const calendarRef = useRef<CalendarGridHandle | SingleCalendarViewHandle>(null);

  const handleToday = () => calendarRef.current?.scrollToToday();

  const handleBookingClick = (booking: Booking) => {
    setSelectedBooking(booking);
    setPrefill(undefined);
    setModalOpen(true);
  };

  const handleDateRangeSelect = (propertyId: string, startDate: Date, endDate: Date) => {
    setSelectedBooking(null);
    // check_out = day after last selected day
    const checkOut = new Date(endDate);
    checkOut.setDate(checkOut.getDate() + 1);
    setPrefill({
      propertyId,
      checkIn: startDate.toISOString().split("T")[0],
      checkOut: checkOut.toISOString().split("T")[0],
    });
    setModalOpen(true);
  };

  const openNew = () => {
    setSelectedBooking(null);
    setPrefill(viewMode === "single" ? { propertyId: selectedPropertyId, checkIn: "", checkOut: "" } : undefined);
    setModalOpen(true);
  };

  const selectedProp = properties.find((p) => p.id === selectedPropertyId)!;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Kalender</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {bookings.length} Buchung{bookings.length !== 1 ? "en" : ""} · {properties.length} Wohnungen
          </p>
        </div>

        {/* Centre controls */}
        <div className="flex items-center gap-3">
          {/* Heute-Button */}
          <button
            onClick={handleToday}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition"
          >
            <CalendarCheck className="w-4 h-4" />
            Heute
          </button>

          {/* Multi / Single toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
            <button
              onClick={() => setViewMode("multi")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                viewMode === "multi"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Übersicht
            </button>
            <button
              onClick={() => setViewMode("single")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                viewMode === "single"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              Einzelansicht
            </button>
          </div>

          {/* Property selector (only in single view) */}
          {viewMode === "single" && (
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {!isViewer && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            <Plus className="w-4 h-4" /> Neue Buchung
          </button>
        )}
      </div>

      {/* Hint bar */}
      {!isViewer && (
      <div className="px-6 py-2 bg-blue-50 border-b border-blue-100">
        {viewMode === "multi" ? (
          <p className="text-xs text-blue-600">
            Tipp: Ziehe über freie Tage, um schnell eine neue Buchung zu erstellen.
          </p>
        ) : (
          <p className="text-xs text-blue-600">
            <span className="font-semibold">{selectedProp.name}</span>
            {!selectedProp.allowsDogs && " · Keine Hunde erlaubt"}
            {" · "}Ziehe über Tage um eine Buchung zu erstellen.
          </p>
        )}
      </div>
      )}

      {/* Calendar area */}
      <div className="flex-1 overflow-auto bg-white relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            Fehler beim Laden der Buchungen.
          </div>
        ) : viewMode === "multi" ? (
          <CalendarGrid
            ref={calendarRef}
            bookings={bookings}
            onBookingClick={handleBookingClick}
            onDateRangeSelect={handleDateRangeSelect}
          />
        ) : (
          <SingleCalendarView
            ref={calendarRef}
            propertyId={selectedPropertyId}
            bookings={bookings}
            onBookingClick={handleBookingClick}
            onDateRangeSelect={handleDateRangeSelect}
          />
        )}
      </div>

      <BookingModal
        open={modalOpen}
        booking={selectedBooking}
        prefill={prefill}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
