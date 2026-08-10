import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { useTrashedBookings, useRestoreBooking, useHardDeleteBooking } from "@/hooks/useBookings";
import { useUserRole } from "@/hooks/useUserRole";
import { properties } from "@/lib/properties";
import { statusConfig } from "@/lib/bookingStatus";
import type { Booking } from "@/types";

function fmt(iso: string) {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
function fmtDeletedAt(iso: string | null) {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}
function propName(id: string) {
  return properties.find((p) => p.id === id)?.name ?? id;
}

function TrashRow({
  b, onRestore, onHardDelete, busy,
}: {
  b: Booking;
  onRestore: (b: Booking) => void;
  onHardDelete: (b: Booking) => void;
  busy: boolean;
}) {
  const { isViewer } = useUserRole();
  return (
    <div className="flex items-center gap-4 p-4 border-b border-gray-100 last:border-0 flex-wrap">
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{b.guest_name || "Unbekannter Gast"}</p>
          {b.booking_number && (
            <span className="text-xs font-mono text-gray-400">{b.booking_number}</span>
          )}
          <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${statusConfig(b.status).badgeClass}`}>
            {statusConfig(b.status).label}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {fmt(b.check_in)} – {fmt(b.check_out)} · {propName(b.property_id)}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Gelöscht am {fmtDeletedAt(b.deletedAt)}
        </p>
      </div>

      {!isViewer && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            disabled={busy}
            onClick={() => onRestore(b)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" /> Wiederherstellen
          </button>
          <button
            disabled={busy}
            onClick={() => onHardDelete(b)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 transition disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" /> Endgültig löschen
          </button>
        </div>
      )}
    </div>
  );
}

export function Trash() {
  const { data: bookings = [], isLoading } = useTrashedBookings();
  const restore = useRestoreBooking();
  const hardDelete = useHardDeleteBooking();

  const busy = restore.isPending || hardDelete.isPending;

  function handleRestore(b: Booking) {
    restore.mutate(b.id);
  }

  function handleHardDelete(b: Booking) {
    const ok = window.confirm(
      `Buchung von ${b.guest_name || "Unbekannter Gast"} (${fmt(b.check_in)} – ${fmt(b.check_out)}) endgültig löschen?\n\n` +
      `Das kann nicht rückgängig gemacht werden!`,
    );
    if (!ok) return;
    hardDelete.mutate(b.id);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-200 bg-white flex-shrink-0">
        <h2 className="text-xl font-bold text-gray-900">Papierkorb</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {bookings.length} gelöschte Buchung{bookings.length !== 1 ? "en" : ""}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {bookings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            Papierkorb ist leer.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border-b border-amber-100 rounded-t-xl text-xs text-amber-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Gelöschte Buchungen verschwinden aus Kalender, Buchungsliste, Analysen und Gästeliste. "Endgültig löschen" kann nicht rückgängig gemacht werden.</span>
            </div>
            {bookings.map((b) => (
              <TrashRow key={b.id} b={b} onRestore={handleRestore} onHardDelete={handleHardDelete} busy={busy} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
