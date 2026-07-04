import { Clock, X, RotateCcw, ArrowRight } from "lucide-react";
import { useBookingHistory } from "@/hooks/useBookingHistory";
import { fieldLabel, formatFieldValue, formatHistoryTime } from "@/lib/bookingHistory";
import type { BookingHistoryEntry } from "@/types";

interface Props {
  bookingId: string;
  onRestore: (entry: BookingHistoryEntry) => void;
  onClose: () => void;
}

export function BookingHistoryPanel({ bookingId, onRestore, onClose }: Props) {
  const { data: entries = [], isLoading } = useBookingHistory(bookingId);

  return (
    <div className="absolute inset-0 z-20 bg-white rounded-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Clock className="w-5 h-5 text-gray-500" />
          Historie {entries.length > 0 && <span className="text-gray-400 font-medium">({entries.length})</span>}
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">Noch keine Änderungen.</p>
        ) : (
          <ol className="space-y-3">
            {entries.map((entry) => {
              const restorable = entry.changes.length > 0;
              return (
                <li key={entry.id}>
                  <div
                    className={`rounded-lg border p-3 transition
                      ${restorable
                        ? "border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer"
                        : "border-gray-100 bg-gray-50"}`}
                    onClick={restorable ? () => onRestore(entry) : undefined}
                    role={restorable ? "button" : undefined}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-gray-500">{formatHistoryTime(entry.created_at)}</span>
                      {restorable && (
                        <span className="flex items-center gap-1 text-xs font-medium text-blue-600">
                          <RotateCcw className="w-3.5 h-3.5" /> Wiederherstellen
                        </span>
                      )}
                    </div>

                    {entry.note && (
                      <p className="text-sm font-medium text-gray-800 mb-1">{entry.note}</p>
                    )}

                    {entry.changes.length > 0 && (
                      <ul className="space-y-0.5">
                        {entry.changes.map((c, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-sm text-gray-600 flex-wrap">
                            <span className="font-medium text-gray-700">{fieldLabel(c.field)}:</span>
                            <span className="text-gray-400 line-through">{formatFieldValue(c.field, c.from)}</span>
                            <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-900">{formatFieldValue(c.field, c.to)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
