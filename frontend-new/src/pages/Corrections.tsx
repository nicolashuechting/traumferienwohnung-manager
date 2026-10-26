import { useMemo, useState } from "react";
import { ClipboardList, Plus, CheckCircle2, Trash2 } from "lucide-react";
import { useBookings } from "@/hooks/useBookings";
import { useCorrectionNotes, useCreateCorrectionNote, useResolveCorrectionNote, useDeleteTestNote } from "@/hooks/useCorrectionNotes";
import { useUserRole } from "@/hooks/useUserRole";
import { BookingModal } from "@/components/BookingModal";
import type { Booking, CorrectionNote } from "@/types";

const HOUSE_LABEL: Record<CorrectionNote["house_id"], string> = { "haus-anne": "Haus Anne", "upstalsboom": "Hus Upstalsboom" };

function fmtDateTime(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return `${d.toLocaleDateString("de-DE")} ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

// Eine Notiz mit Status, automatisch angehängten Änderungen und (für Admins) dem
// Erledigen-Formular inkl. Bearbeitungsnotiz.
function NoteCard({ note, booking, canEdit, onOpenBooking }: {
  note: CorrectionNote;
  booking: Booking | undefined;
  canEdit: boolean;
  onOpenBooking: (b: Booking) => void;
}) {
  const resolve = useResolveCorrectionNote();
  const del = useDeleteTestNote();
  const [resolutionNote, setResolutionNote] = useState("");
  const [error, setError] = useState("");
  const open = note.status === "offen";

  const handleResolve = async () => {
    setError("");
    try {
      await resolve.mutateAsync({ id: note.id, resolutionNote });
    } catch (e) {
      setError(`Konnte nicht gespeichert werden: ${(e as Error).message}`);
    }
  };

  return (
    <div className={`bg-white rounded-xl border p-4 space-y-3 ${open ? "border-amber-300" : "border-gray-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-blue-700">{note.booking_number || "–"}</span>
            <span className="text-sm text-gray-900">{note.guest_name}</span>
            <span className="text-xs text-gray-400">{HOUSE_LABEL[note.house_id]}</span>
            {note.test && <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">TEST</span>}
          </div>
          <p className="text-xs text-gray-500">
            {fmtDateTime(note.created_at)} · {note.created_by_name || note.created_by}
            {note.source === "sperre" ? " · Sperre aufgehoben" : " · manuell angelegt"}
          </p>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${open ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
          {open ? "Offen" : "Erledigt"}
        </span>
      </div>

      <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.text}</p>

      {note.changes.length > 0 && (
        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <p className="font-semibold text-gray-500 mb-1">Tatsächlich geändert:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {note.changes.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      {!open && (
        <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <p className="font-semibold">Erledigt am {fmtDateTime(note.resolved_at)} von {note.resolved_by}</p>
          {note.resolution_note && <p className="mt-1 whitespace-pre-wrap">{note.resolution_note}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        {booking && (
          <button type="button" onClick={() => onOpenBooking(booking)} className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
            Buchung öffnen
          </button>
        )}
        {note.test && canEdit && (
          <button type="button" onClick={() => del.mutate(note.id)} disabled={del.isPending} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" /> Testnotiz löschen
          </button>
        )}
      </div>

      {open && canEdit && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <label className="block text-xs font-medium text-gray-600">
            Bearbeitungsnotiz – was wurde erledigt? (z.B. „Storno UB-2026-0011 + neue Rechnung UB-2026-0012")
          </label>
          <textarea
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          />
          <button
            type="button"
            onClick={handleResolve}
            disabled={resolve.isPending || !resolutionNote.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" /> Als erledigt markieren
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function Corrections() {
  const { data: notes = [], isLoading, error: loadError } = useCorrectionNotes();
  const { data: bookings = [] } = useBookings();
  const { isViewer } = useUserRole();
  const create = useCreateCorrectionNote();

  const [filter, setFilter] = useState<"offen" | "erledigt" | "alle">("offen");
  const [showNew, setShowNew] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newText, setNewText] = useState("");
  const [newError, setNewError] = useState("");
  const [modalBooking, setModalBooking] = useState<Booking | null>(null);

  const bookingById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);
  const numberedBookings = useMemo(
    () => bookings.filter((b) => b.booking_number).sort((a, b) => a.booking_number.localeCompare(b.booking_number)),
    [bookings],
  );
  const visible = notes.filter((n) => filter === "alle" || n.status === filter);
  const openCount = notes.filter((n) => n.status === "offen").length;

  const handleCreate = async () => {
    setNewError("");
    const booking = numberedBookings.find((b) => b.booking_number.toLowerCase() === newNumber.trim().toLowerCase());
    if (!booking) { setNewError("Bitte eine vorhandene Buchungsnummer auswählen."); return; }
    if (!newText.trim()) { setNewError("Bitte beschreiben, was korrigiert werden muss."); return; }
    try {
      await create.mutateAsync({ booking, text: newText, source: "manuell" });
      setNewNumber("");
      setNewText("");
      setShowNew(false);
      setFilter("offen");
    } catch (e) {
      setNewError(`Konnte nicht gespeichert werden: ${(e as Error).message}`);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-200 bg-white flex-shrink-0 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Korrekturen</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Notizen zu Buchungen, deren Rechnung nachträglich korrigiert werden muss (Storno, Zusatzrechnung …).
            {openCount > 0 && <span className="font-semibold text-amber-700"> {openCount} offen.</span>}
          </p>
        </div>
        {!isViewer && (
          <button onClick={() => setShowNew((v) => !v)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex-shrink-0">
            <Plus className="w-4 h-4" /> Neue Notiz
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 max-w-3xl">
        {showNew && (
          <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Buchungsnummer *</label>
              <input
                list="correction-booking-numbers"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="z.B. AN-2027-0005"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <datalist id="correction-booking-numbers">
                {numberedBookings.map((b) => (
                  <option key={b.id} value={b.booking_number}>{b.guest_name} · {b.check_in}</option>
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Was muss korrigiert werden und warum? *</label>
              <textarea value={newText} onChange={(e) => setNewText(e.target.value)} rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCreate} disabled={create.isPending} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                Speichern
              </button>
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
                Abbrechen
              </button>
            </div>
            {newError && <p className="text-sm text-red-600">{newError}</p>}
          </div>
        )}

        <div className="flex gap-1.5">
          {(["offen", "erledigt", "alle"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${filter === f ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"}`}>
              {f === "offen" ? "Offen" : f === "erledigt" ? "Erledigt" : "Alle"}
            </button>
          ))}
        </div>

        {loadError ? (
          <p className="text-sm text-red-600">Notizen konnten nicht geladen werden: {(loadError as Error).message}</p>
        ) : isLoading ? (
          <p className="text-sm text-gray-500">Lädt…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500">{filter === "offen" ? "Keine offenen Korrekturen." : "Keine Notizen."}</p>
        ) : (
          visible.map((n) => (
            <NoteCard key={n.id} note={n} booking={bookingById.get(n.booking_id)} canEdit={!isViewer} onOpenBooking={setModalBooking} />
          ))
        )}
      </div>

      <BookingModal open={!!modalBooking} booking={modalBooking} onClose={() => setModalBooking(null)} />
    </div>
  );
}
