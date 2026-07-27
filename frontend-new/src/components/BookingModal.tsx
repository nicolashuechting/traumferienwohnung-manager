import { useState, useEffect, useMemo, useCallback } from "react";
import { X, Trash2, Check, Copy, CheckCircle2, Pencil, Clock, ArrowRight } from "lucide-react";
import { properties } from "@/lib/properties";
import { useCreateBooking, useUpdateBooking, useSoftDeleteBooking, useBookings, useTrashedBookings } from "@/hooks/useBookings";
import { useBookingHistory } from "@/hooks/useBookingHistory";
import { STATUS_ORDER, statusConfig } from "@/lib/bookingStatus";
import { generateBookingNumber } from "@/lib/bookingNumber";
import { buildConfirmationText } from "@/lib/confirmation";
import { diffBooking, fieldLabel, formatFieldValue, formatHistoryDate } from "@/lib/bookingHistory";
import { getTimes, hasFerryData, isNoBus, type FerryDirection } from "@/lib/ferry";
import { findCollision } from "@/lib/bookingDrag";
import { CHANNEL_OPTIONS } from "@/lib/channels";
import { BookingHistoryPanel } from "@/components/BookingHistoryPanel";
import type { Booking, BookingFormData, BookingStatus, FieldChange, BookingHistoryEntry } from "@/types";

const FERRY_INPUT_CLS = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none";

// Fährzeit-Auswahl: Dropdown aus dem Fahrplan, Freitext nur bei "Andere Zeit…"
function FerryPicker({
  label, dateISO, direction, value, onChange,
}: {
  label: string;
  dateISO: string;
  direction: FerryDirection;
  value: string;
  onChange: (v: string) => void;
}) {
  const times = useMemo(() => getTimes(dateISO, direction), [dateISO, direction]);
  const hasData = hasFerryData(dateISO) && times.length > 0;
  const valueInList = !!value && times.includes(value);
  // Manuelle Eingabe ist anfangs aktiv, wenn ein abweichender Wert gesetzt ist
  const [manual, setManual] = useState<boolean>(() => !!value && !times.includes(value));

  // Kein Fahrplan für dieses Datum → direkt Freitextfeld mit Hinweis
  if (!hasData) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input
          type="time"
          className={FERRY_INPUT_CLS}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {dateISO && (
          <p className="text-xs text-amber-600 mt-1">Kein Fährplan für dieses Datum verfügbar – bitte manuell eingeben.</p>
        )}
      </div>
    );
  }

  // Sichtbarkeit hängt NUR vom expliziten Umschalter ab, nicht davon, ob der
  // gerade eingegebene Wert zufällig mit einer Fahrplanzeit übereinstimmt —
  // sonst verschwindet das Feld mitten in der Eingabe wieder.
  const showManual = manual;
  const selectValue = manual ? "__manual__" : valueInList ? value : "";

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        className={FERRY_INPUT_CLS}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__manual__") { setManual(true); }
          else { setManual(false); onChange(v); }
        }}
      >
        <option value="">– keine Auswahl –</option>
        {times.map((t) => (
          <option key={t} value={t}>
            {t} Uhr{isNoBus(dateISO, t, direction) ? " · kein Bus" : ""}
          </option>
        ))}
        <option value="__manual__">Andere Zeit eingeben…</option>
      </select>
      {showManual && (
        <input
          type="time"
          className={`${FERRY_INPUT_CLS} mt-2`}
          value={value}
          placeholder="HH:MM"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

interface BookingModalProps {
  open: boolean;
  booking?: Booking | null;
  prefill?: { propertyId: string; checkIn: string; checkOut: string };
  onClose: () => void;
}

const EMPTY_FORM: BookingFormData = {
  property_id: "ups-2",
  booking_number: "",
  status: "anfrage",
  guest_name: "",
  contact_info: "",
  check_in: "",
  check_out: "",
  ferry_time: "",
  ferry_time_departure: "",
  is_paid: false,
  adults: 2,
  children: 0,
  kinderAlter: [],
  dog: false,
  kinderbett: false,
  rausfallschutz: false,
  kinderstuhl: false,
  price: 0,
  channel: "Manuell",
  ical_uid: "",
  notes: "",
  source: "manual",
};

function formOf(b: Booking): BookingFormData {
  const { id: _i, userId: _u, created_at: _c, updated_at: _up, ...rest } = b;
  return rest as BookingFormData;
}

function fmtDate(iso: string) {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Ein Alter-Eingabefeld pro Kind, synchron zur Kinderzahl
function ChildrenAgesInput({
  count, ages, onChange,
}: {
  count: number;
  ages: number[];
  onChange: (ages: number[]) => void;
}) {
  if (count <= 0) return null;
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Kinder-Alter</label>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: count }, (_, i) => (
          <div key={i}>
            <label className="block text-xs text-gray-500 mb-1">Kind {i + 1}: Alter</label>
            <input
              type="number"
              min={0}
              max={17}
              value={ages[i] || ""}
              onChange={(e) => {
                const next = [...ages];
                next[i] = parseInt(e.target.value) || 0;
                onChange(next);
              }}
              className={FERRY_INPUT_CLS}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Read-only Zeile in der Anzeige
function ViewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{children}</p>
    </div>
  );
}

export function BookingModal({ open, booking, prefill, onClose }: BookingModalProps) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [current, setCurrent] = useState<Booking | null>(booking ?? null);
  const [form, setForm] = useState<BookingFormData>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [showConfirmText, setShowConfirmText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [numberCopied, setNumberCopied] = useState(false);

  // Overlays
  const [showSaveDiff, setShowSaveDiff] = useState(false);
  const [pendingSave, setPendingSave] = useState<{ data: BookingFormData; changes: FieldChange[] } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [restoreEntry, setRestoreEntry] = useState<BookingHistoryEntry | null>(null);
  const [pendingCollision, setPendingCollision] = useState<{ data: BookingFormData; conflict: Booking } | null>(null);

  const { data: allBookings = [] } = useBookings();
  const { data: trashedBookings = [] } = useTrashedBookings();
  const { data: history = [] } = useBookingHistory(current?.id);
  const create = useCreateBooking();
  const update = useUpdateBooking();
  const del = useSoftDeleteBooking();

  const isLoading = create.isPending || update.isPending || del.isPending;

  // Auch Nummern im Papierkorb gelten als belegt, damit eine neue Buchung
  // nicht versehentlich die Nummer einer wiederherstellbaren Buchung erhält.
  const existingNumbers = useMemo(
    () => new Set([...allBookings, ...trashedBookings].map((b) => b.booking_number).filter(Boolean)),
    [allBookings, trashedBookings],
  );

  useEffect(() => {
    if (!open) return;
    setCurrent(booking ?? null);
    if (booking) {
      setForm(formOf(booking));
      setMode("view");
    } else if (prefill) {
      setForm({ ...EMPTY_FORM, property_id: prefill.propertyId, check_in: prefill.checkIn, check_out: prefill.checkOut });
      setMode("edit");
    } else {
      setForm(EMPTY_FORM);
      setMode("edit");
    }
    setError("");
    setShowConfirmText(false);
    setCopied(false);
    setNumberCopied(false);
    setShowSaveDiff(false);
    setPendingSave(null);
    setShowHistory(false);
    setRestoreEntry(null);
    setPendingCollision(null);
  }, [open, booking, prefill]);

  const set = <K extends keyof BookingFormData>(key: K, value: BookingFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Kinderzahl ändern: kinderAlter mitführen — beim Verringern vom Ende
  // abschneiden, beim Erhöhen bestehende Alter erhalten und neue Felder mit 0 auffüllen.
  const setChildrenCount = (n: number) => {
    const count = Math.max(0, Math.min(20, n));
    setForm((prev) => {
      const ages = prev.kinderAlter.slice(0, count);
      while (ages.length < count) ages.push(0);
      return { ...prev, children: count, kinderAlter: ages };
    });
  };

  const ensureNumber = (f: BookingFormData): string =>
    f.booking_number || generateBookingNumber(f.property_id, f.check_in, existingNumbers);

  // Vorschau der Felder, die beim Wiederherstellen zurückgesetzt würden (aktuell → damals)
  const restorePreview = useMemo<FieldChange[]>(() => {
    if (!restoreEntry || !current) return [];
    const restoreData: Record<string, unknown> = {};
    restoreEntry.changes.forEach((c) => { restoreData[c.field] = c.from; });
    return diffBooking(current, restoreData as Partial<BookingFormData>);
  }, [restoreEntry, current]);

  const attemptCancel = useCallback(() => {
    if (!current) { onClose(); return; }
    const dirty = diffBooking(current, form).length > 0;
    if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    setForm(formOf(current));
    setMode("view");
    setError("");
    setShowConfirmText(false);
  }, [current, form, onClose]);

  // ESC-Handhabung
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (restoreEntry) { setRestoreEntry(null); return; }
      if (pendingCollision) { setPendingCollision(null); return; }
      if (showSaveDiff) { setShowSaveDiff(false); return; }
      if (showHistory) { setShowHistory(false); return; }
      if (mode === "edit") { attemptCancel(); return; }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mode, showSaveDiff, showHistory, restoreEntry, pendingCollision, attemptCancel, onClose]);

  if (!open) return null;

  const handleConfirm = () => {
    setForm((prev) => ({ ...prev, status: "bestaetigt", booking_number: prev.booking_number || ensureNumber(prev) }));
    setShowConfirmText(true);
  };

  const handleReserve = () => {
    setForm((prev) => ({ ...prev, status: "reserviert" }));
  };

  // Status-Pille anklicken: Rückwärtsschritte im Workflow (z.B. reserviert → anfrage)
  // brauchen eine kurze Bestätigung, Vorwärtsschritte greifen direkt.
  const handleStatusPillClick = (s: BookingStatus) => {
    const isBackward = STATUS_ORDER.indexOf(s) < STATUS_ORDER.indexOf(form.status);
    if (isBackward && !window.confirm("Status zurücksetzen?")) return;
    set("status", s);
  };

  const effective = mode === "edit" ? form : current ? formOf(current) : form;
  const confirmationText = buildConfirmationText({
    ...(current ?? ({} as Booking)),
    ...effective,
    booking_number: effective.booking_number || "[Buchungsnummer]",
  } as Booking);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(confirmationText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Kopieren fehlgeschlagen – Text bitte manuell markieren.");
    }
  };

  const copyNumber = async () => {
    if (!headerNumber) return;
    try {
      await navigator.clipboard.writeText(headerNumber);
      setNumberCopied(true);
      setTimeout(() => setNumberCopied(false), 2000);
    } catch {
      setError("Kopieren fehlgeschlagen.");
    }
  };

  const validate = (): boolean => {
    if (!form.guest_name.trim()) { setError("Gastname ist erforderlich."); return false; }
    if (!form.check_in || !form.check_out) { setError("Check-in und Check-out sind erforderlich."); return false; }
    if (form.check_in >= form.check_out) { setError("Check-out muss nach Check-in liegen."); return false; }
    setError("");
    return true;
  };

  // Legt die Buchung an bzw. öffnet den Änderungs-Diff — nach bestandener Kollisionsprüfung.
  const proceedSave = async (dataToSave: BookingFormData) => {
    if (!current) {
      // Neue Buchung: direkt anlegen (kein Diff)
      try {
        await create.mutateAsync(dataToSave);
        onClose();
      } catch (e) { setError((e as Error).message); }
      return;
    }

    const changes = diffBooking(current, dataToSave);
    if (changes.length === 0) { setMode("view"); return; }
    setPendingSave({ data: dataToSave, changes });
    setShowSaveDiff(true);
  };

  // "Speichern" im Bearbeiten-Modus
  const handleSaveClick = async () => {
    if (!validate()) return;
    const dataToSave: BookingFormData = { ...form, booking_number: ensureNumber(form) };

    const conflict = findCollision(
      allBookings, dataToSave.property_id, current?.id ?? "",
      dataToSave.check_in, dataToSave.check_out,
      dataToSave.ferry_time, dataToSave.ferry_time_departure,
    );
    if (conflict) {
      setPendingCollision({ data: dataToSave, conflict });
      return;
    }

    await proceedSave(dataToSave);
  };

  // Bestätigtes Speichern trotz erkannter Kollision
  const confirmCollisionSave = async () => {
    if (!pendingCollision) return;
    const { data } = pendingCollision;
    setPendingCollision(null);
    await proceedSave(data);
  };

  // Bestätigtes Speichern aus dem Diff-Dialog
  const confirmSave = async () => {
    if (!current || !pendingSave) return;
    try {
      await update.mutateAsync({ id: current.id, data: pendingSave.data, history: { changes: pendingSave.changes } });
      setCurrent({ ...current, ...pendingSave.data });
      setForm(pendingSave.data);
      setShowSaveDiff(false);
      setPendingSave(null);
      setShowConfirmText(false);
      setMode("view");
    } catch (e) {
      setError((e as Error).message);
      setShowSaveDiff(false);
    }
  };

  const handleDelete = async () => {
    if (!current || !window.confirm("Buchung in den Papierkorb verschieben? Du kannst sie dort wiederherstellen.")) return;
    await del.mutateAsync(current.id);
    onClose();
  };

  const confirmRestore = async () => {
    if (!restoreEntry || !current) return;
    const restoreData: Record<string, unknown> = {};
    restoreEntry.changes.forEach((c) => { restoreData[c.field] = c.from; });
    const changes = diffBooking(current, restoreData as Partial<BookingFormData>);
    if (changes.length === 0) { setRestoreEntry(null); return; }
    const note = `Wiederhergestellt auf Stand vom ${formatHistoryDate(restoreEntry.created_at)}`;
    try {
      await update.mutateAsync({ id: current.id, data: restoreData as Partial<BookingFormData>, history: { changes, note } });
      const merged = { ...current, ...(restoreData as Partial<Booking>) };
      setCurrent(merged);
      setForm(formOf(merged));
      setRestoreEntry(null);
    } catch (e) {
      setError((e as Error).message);
      setRestoreEntry(null);
    }
  };

  const selectedProperty = properties.find((p) => p.id === form.property_id);
  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none";

  const headerNumber = (mode === "edit" ? form.booking_number : current?.booking_number) || "";
  const persons = current ? current.adults + current.children : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col
        ${mode === "edit" ? "ring-2 ring-blue-400" : ""}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">
              {!current ? "Neue Buchung" : mode === "edit" ? "Buchung bearbeiten" : current.guest_name || "Buchung"}
            </h2>
            {headerNumber && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-sm font-mono font-bold text-blue-700 tracking-wide">{headerNumber}</span>
                <button
                  onClick={copyNumber}
                  title="Buchungsnummer kopieren"
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                >
                  {numberCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {numberCopied && (
                  <span className="text-xs font-medium text-emerald-600">Buchungsnummer kopiert</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {mode === "view" && current ? (
              <>
                <button
                  onClick={() => { setForm(formOf(current)); setMode("edit"); setError(""); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition"
                >
                  <Pencil className="w-4 h-4" /> Bearbeiten
                </button>
                <button
                  onClick={() => setShowHistory(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition"
                >
                  <Clock className="w-4 h-4" /> Historie{history.length > 0 && ` (${history.length})`}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSaveClick}
                  disabled={isLoading}
                  className="px-4 py-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50"
                >
                  {isLoading ? "Speichert…" : current ? "Speichern" : "Hinzufügen"}
                </button>
                <button
                  onClick={attemptCancel}
                  disabled={isLoading}
                  className="px-4 py-1.5 text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition disabled:opacity-50"
                >
                  Abbrechen
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>
          )}

          {/* ── ANZEIGE-MODUS ── */}
          {mode === "view" && current && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${statusConfig(current.status).badgeClass}`}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusConfig(current.status).dotColor }} />
                  {statusConfig(current.status).label}
                </span>
                {current.status !== "anfrage" && current.status !== "reserviert" && current.status !== "problem" && (
                  <button
                    onClick={() => setShowConfirmText((v) => !v)}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    {showConfirmText ? "Bestätigungstext ausblenden" : "Bestätigungstext anzeigen"}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <ViewRow label="Wohnung">{formatFieldValue("property_id", current.property_id)}</ViewRow>
                <ViewRow label="Gast">{current.guest_name || "–"}</ViewRow>
                <ViewRow label="Anreise">{fmtDate(current.check_in)}</ViewRow>
                <ViewRow label="Abreise">{fmtDate(current.check_out)}</ViewRow>
                <ViewRow label="Kontakt">{current.contact_info || "–"}</ViewRow>
                <ViewRow label="Kanal">{current.channel || "Manuell"}</ViewRow>
                <ViewRow label="Fähre Anreise">
                  {current.ferry_time ? `${current.ferry_time} Uhr (Neßmersiel → Baltrum)` : "–"}
                </ViewRow>
                <ViewRow label="Fähre Abreise">
                  {current.ferry_time_departure ? `${current.ferry_time_departure} Uhr (Baltrum → Neßmersiel)` : "–"}
                </ViewRow>
                <ViewRow label="Preis">{current.price > 0 ? `${current.price.toLocaleString("de-DE")} €` : "–"}</ViewRow>
                <ViewRow label="Bezahlt">{current.is_paid ? "Ja" : "Nein"}</ViewRow>
                <ViewRow label="Personen">
                  {persons} {current.children > 0 && <span className="text-gray-400">({current.adults} Erw. + {current.children} Ki.)</span>}
                </ViewRow>
                {current.children > 0 && current.kinderAlter.length > 0 && (
                  <ViewRow label="Kinder">
                    {current.children} {current.children === 1 ? "Kind" : "Kinder"} ({current.kinderAlter.join(", ")} Jahre)
                  </ViewRow>
                )}
                <ViewRow label="Hund">{current.dog ? "Ja 🐕" : "Nein"}</ViewRow>
                {(current.kinderbett || current.rausfallschutz || current.kinderstuhl) && (
                  <ViewRow label="Ausstattung">
                    {[
                      current.kinderbett && "Kinderbett",
                      current.rausfallschutz && "Rausfallschutz",
                      current.kinderstuhl && "Kinderstuhl",
                    ].filter(Boolean).join(", ")}
                  </ViewRow>
                )}
              </div>
              {current.notes && (
                <ViewRow label="Notizen"><span className="whitespace-pre-wrap">{current.notes}</span></ViewRow>
              )}
            </>
          )}

          {/* ── BEARBEITEN-MODUS ── */}
          {mode === "edit" && (
            <>
              {/* Status */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <span className="text-sm font-medium text-gray-700">Status</span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${statusConfig(form.status).badgeClass}`}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusConfig(form.status).dotColor }} />
                    {statusConfig(form.status).label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_ORDER.map((s) => {
                    const cfg = statusConfig(s);
                    const active = form.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleStatusPillClick(s)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition
                          ${active ? cfg.badgeClass : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"}`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.dotColor }} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
                {form.status === "anfrage" && (
                  <button
                    type="button"
                    onClick={handleReserve}
                    className="mt-3 flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gray-600 hover:bg-gray-700 rounded-lg transition"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Als Reserviert markieren
                  </button>
                )}
                {form.status !== "bestaetigt" && form.status !== "bezahlt" && form.status !== "abgeschlossen" && (
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="mt-3 flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Buchung bestätigen
                  </button>
                )}
                {form.status !== "anfrage" && form.status !== "reserviert" && form.status !== "problem" && (
                  <button
                    type="button"
                    onClick={() => setShowConfirmText((v) => !v)}
                    className="mt-3 ml-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    {showConfirmText ? "Bestätigungstext ausblenden" : "Bestätigungstext anzeigen"}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wohnung</label>
                  <select value={form.property_id} onChange={(e) => set("property_id", e.target.value)} className={inputCls}>
                    {["Upstalsboom", "Haus Anne"].map((house) => (
                      <optgroup key={house} label={house}>
                        {properties.filter((p) => p.house === house).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gastname *</label>
                  <input type="text" value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)} placeholder="Familie Müller" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-in *</label>
                  <input type="date" value={form.check_in} onChange={(e) => set("check_in", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-out *</label>
                  <input type="date" value={form.check_out} onChange={(e) => set("check_out", e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Fährzeiten – Anreise nach check_in, Abreise nach check_out */}
              <div className="grid grid-cols-2 gap-4">
                <FerryPicker
                  key={`arr-${form.check_in}`}
                  label="Fähre Anreise"
                  dateISO={form.check_in}
                  direction="arrival"
                  value={form.ferry_time}
                  onChange={(v) => set("ferry_time", v)}
                />
                <FerryPicker
                  key={`dep-${form.check_out}`}
                  label="Fähre Abreise"
                  dateISO={form.check_out}
                  direction="departure"
                  value={form.ferry_time_departure}
                  onChange={(v) => set("ferry_time_departure", v)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kontakt (Email / Tel.)</label>
                  <input type="text" value={form.contact_info} onChange={(e) => set("contact_info", e.target.value)} placeholder="mueller@email.de" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Buchungskanal</label>
                  <select value={form.channel} onChange={(e) => set("channel", e.target.value)} className={inputCls}>
                    {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preis (€)</label>
                  <input type="number" min={0} step={1} value={form.price || ""} onChange={(e) => set("price", parseFloat(e.target.value) || 0)} placeholder="0" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Erwachsene</label>
                  <input type="number" min={1} max={20} value={form.adults} onChange={(e) => set("adults", parseInt(e.target.value) || 1)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kinder</label>
                  <input type="number" min={0} max={20} value={form.children} onChange={(e) => setChildrenCount(parseInt(e.target.value) || 0)} className={inputCls} />
                </div>
                <div className="flex flex-col justify-end gap-2 pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_paid} onChange={(e) => set("is_paid", e.target.checked)} className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium text-gray-700">Bezahlt ✓</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.dog} onChange={(e) => set("dog", e.target.checked)} disabled={!selectedProperty?.allowsDogs} className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium text-gray-700">
                      Hund 🐕 {!selectedProperty?.allowsDogs && <span className="text-red-500 text-xs">(n. erlaubt)</span>}
                    </span>
                  </label>
                </div>
              </div>

              <ChildrenAgesInput
                count={form.children}
                ages={form.kinderAlter}
                onChange={(ages) => set("kinderAlter", ages)}
              />

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Benötigte Ausstattung</p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.kinderbett} onChange={(e) => set("kinderbett", e.target.checked)} className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium text-gray-700">Kinderbett</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.rausfallschutz} onChange={(e) => set("rausfallschutz", e.target.checked)} className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium text-gray-700">Rausfallschutz</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.kinderstuhl} onChange={(e) => set("kinderstuhl", e.target.checked)} className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium text-gray-700">Kinderstuhl</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label>
                <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Spezielle Anforderungen, Anmerkungen..." className={`${inputCls} resize-none`} />
              </div>
            </>
          )}

          {/* Bestätigungstext (beide Modi) */}
          {showConfirmText && (
            <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Bestätigungstext</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 transition"
                >
                  {copied ? <><Check className="w-3.5 h-3.5" /> Kopiert</> : <><Copy className="w-3.5 h-3.5" /> Kopieren</>}
                </button>
              </div>
              <textarea
                readOnly
                value={confirmationText}
                rows={14}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono bg-white text-gray-800 resize-y focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}
        </div>

        {/* Footer (nur im Bearbeiten-Modus: Löschen) */}
        {mode === "edit" && current && (
          <div className="flex items-center px-6 py-4 border-t border-gray-200">
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Löschen
            </button>
          </div>
        )}

        {/* ── Overlay: Terminüberschneidung bestätigen ── */}
        {pendingCollision && (
          <div className="absolute inset-0 z-30 bg-black/30 flex items-center justify-center rounded-xl p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
              <h3 className="text-base font-bold text-gray-900 mb-3">Terminüberschneidung</h3>
              <p className="text-sm text-gray-700 mb-5">
                Diese Buchung überschneidet sich mit{" "}
                <span className="font-semibold">{pendingCollision.conflict.guest_name || "einer anderen Buchung"}</span>{" "}
                ({fmtDate(pendingCollision.conflict.check_in)} – {fmtDate(pendingCollision.conflict.check_out)}). Trotzdem speichern?
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setPendingCollision(null)} disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition disabled:opacity-50">
                  Abbrechen
                </button>
                <button onClick={confirmCollisionSave} disabled={isLoading}
                  className="px-5 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition disabled:opacity-50">
                  {isLoading ? "Speichert…" : "Trotzdem speichern"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Overlay: Änderungen bestätigen ── */}
        {showSaveDiff && pendingSave && (
          <div className="absolute inset-0 z-30 bg-black/30 flex items-center justify-center rounded-xl p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
              <h3 className="text-base font-bold text-gray-900 mb-3">Änderungen speichern?</h3>
              <ul className="space-y-1.5 mb-5 max-h-64 overflow-y-auto">
                {pendingSave.changes.map((c, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-sm flex-wrap">
                    <span className="font-medium text-gray-700">{fieldLabel(c.field)}:</span>
                    <span className="text-gray-400 line-through">{formatFieldValue(c.field, c.from)}</span>
                    <ArrowRight className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-900 font-medium">{formatFieldValue(c.field, c.to)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowSaveDiff(false)} disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition disabled:opacity-50">
                  Zurück
                </button>
                <button onClick={confirmSave} disabled={isLoading}
                  className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50">
                  {isLoading ? "Speichert…" : "Speichern"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Overlay: Historie ── */}
        {showHistory && current && (
          <BookingHistoryPanel
            bookingId={current.id}
            onRestore={(entry) => setRestoreEntry(entry)}
            onClose={() => setShowHistory(false)}
          />
        )}

        {/* ── Overlay: Wiederherstellen bestätigen ── */}
        {restoreEntry && current && (
          <div className="absolute inset-0 z-40 bg-black/30 flex items-center justify-center rounded-xl p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
              <h3 className="text-base font-bold text-gray-900 mb-1">
                Auf den Stand vom {formatHistoryDate(restoreEntry.created_at)} zurücksetzen?
              </h3>
              <p className="text-sm text-gray-500 mb-3">Folgende Felder werden zurückgesetzt:</p>
              {restorePreview.length === 0 ? (
                <p className="text-sm text-gray-400 mb-5">Die Buchung ist bereits auf diesem Stand.</p>
              ) : (
                <ul className="space-y-1.5 mb-5 max-h-64 overflow-y-auto">
                  {restorePreview.map((c, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-sm flex-wrap">
                      <span className="font-medium text-gray-700">{fieldLabel(c.field)}:</span>
                      <span className="text-gray-400 line-through">{formatFieldValue(c.field, c.from)}</span>
                      <ArrowRight className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-900 font-medium">{formatFieldValue(c.field, c.to)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setRestoreEntry(null)} disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition disabled:opacity-50">
                  Abbrechen
                </button>
                <button onClick={confirmRestore} disabled={isLoading || restorePreview.length === 0}
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50">
                  {isLoading ? "Setzt zurück…" : "Wiederherstellen"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
