import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { X, Trash2, Check, Copy, CheckCircle2, Pencil, Clock, ArrowRight, ChevronDown, RefreshCw } from "lucide-react";
import { properties } from "@/lib/properties";
import { useCreateBooking, useUpdateBooking, useSoftDeleteBooking, useBookings, useTrashedBookings } from "@/hooks/useBookings";
import { useBookingHistory } from "@/hooks/useBookingHistory";
import { usePriceSettings } from "@/hooks/usePriceSettings";
import { useHouseSettings } from "@/hooks/useHouseSettings";
import { STATUS_ORDER, statusConfig } from "@/lib/bookingStatus";
import { generateBookingNumber } from "@/lib/bookingNumber";
import { generateConfirmationPdf } from "@/lib/pdfConfirmation";
import hausAnneLogoUrl from "@/assets/logos/haus-anne.png";
import upstalsboomLogoUrl from "@/assets/logos/upstalsboom.png";
import { diffBooking, fieldLabel, formatFieldValue, formatHistoryDate } from "@/lib/bookingHistory";
import { getTimes, hasFerryData, isNoBus, type FerryDirection } from "@/lib/ferry";
import { findCollision } from "@/lib/bookingDrag";
import { CHANNEL_OPTIONS } from "@/lib/channels";
import { priceGroupOf } from "@/lib/priceGroups";
import { calculatePrice, type PriceResult } from "@/lib/pricing";
import { BookingHistoryPanel } from "@/components/BookingHistoryPanel";
import type { Booking, BookingFormData, BookingStatus, FieldChange, BookingHistoryEntry, PriceBreakdown, HouseId } from "@/types";

const FERRY_INPUT_CLS = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none";
const LOGO_URLS: Record<HouseId, string> = { "haus-anne": hausAnneLogoUrl, "upstalsboom": upstalsboomLogoUrl };

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
  phone: "",
  email: "",
  check_in: "",
  check_out: "",
  ferry_time: "",
  ferry_time_departure: "",
  is_paid: false,
  adults: 2,
  children: 0,
  kinderAlter: [],
  dogCount: 0,
  kinderbett: false,
  rausfallschutz: false,
  kinderstuhl: false,
  price: 0,
  priceIsManual: false,
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

// Fasst aufeinanderfolgende Nächte mit gleicher Saison/Preis zusammen,
// z.B. "6 Nächte × 137,00 € (Hauptsaison) + Reinigung 60,00 € + Hund 30,00 €"
function priceSummaryText(r: {
  nights: PriceBreakdown["nights"];
  cleaningFee: number;
  extraFees: PriceBreakdown["extraFees"];
  dogFee: number;
}): string {
  const groups: { label: string; price: number; count: number }[] = [];
  for (const n of r.nights) {
    const last = groups[groups.length - 1];
    if (last && last.label === n.seasonLabel && last.price === n.price) last.count++;
    else groups.push({ label: n.seasonLabel, price: n.price, count: 1 });
  }
  const parts = groups.map((g) => `${g.count} Nacht${g.count === 1 ? "" : "e"} × ${g.price.toLocaleString("de-DE")} € (${g.label})`);
  if (r.cleaningFee > 0) parts.push(`Reinigung ${r.cleaningFee.toLocaleString("de-DE")} €`);
  r.extraFees.forEach((f) => { if (f.amount > 0) parts.push(`${f.label} ${f.amount.toLocaleString("de-DE")} €`); });
  if (r.dogFee > 0) parts.push(`Hund ${r.dogFee.toLocaleString("de-DE")} €`);
  return parts.join(" + ") || "Keine Preisdaten für diesen Zeitraum.";
}

// Preisfeld: fette editierbare Summe + kleine graue Erklärung, Detail-Panel
// standardmäßig eingeklappt und nur per Klick auf die Erklärung sichtbar.
// Zusätzlich: Übernachtungspreis-Override — pauschal für die ganze Buchung
// (über Saisongrenzen hinweg), Reinigung/Hund/Zusatzgebühren bleiben gleich.
function PriceSection({
  form, set, autoResult,
}: {
  form: BookingFormData;
  set: <K extends keyof BookingFormData>(key: K, value: BookingFormData[K]) => void;
  autoResult: PriceResult | null;
}) {
  const [open, setOpen] = useState(false);

  const existingOverrideNight = form.priceBreakdown?.nights?.find((n) => n.originalPrice !== undefined);
  const [overrideActive, setOverrideActive] = useState(!!existingOverrideNight);
  const [overrideRate, setOverrideRate] = useState(existingOverrideNight ? String(existingOverrideNight.price) : "");

  const handleRecalculate = () => {
    if (!autoResult) return;
    if (overrideActive) {
      const rate = parseFloat(overrideRate);
      if (Number.isNaN(rate)) return;
      const nights = autoResult.nights.map((n) => ({ ...n, price: rate, originalPrice: n.price }));
      const extraFeesTotal = autoResult.extraFees.reduce((s, f) => s + f.amount, 0);
      const total = rate * nights.length + autoResult.cleaningFee + extraFeesTotal + autoResult.dogFee;
      set("price", total);
      set("priceIsManual", true);
      set("priceBreakdown", {
        nights,
        cleaningFee: autoResult.cleaningFee,
        extraFees: autoResult.extraFees,
        dogFee: autoResult.dogFee,
      });
      return;
    }
    set("price", autoResult.total);
    set("priceIsManual", false);
    set("priceBreakdown", {
      nights: autoResult.nights,
      cleaningFee: autoResult.cleaningFee,
      extraFees: autoResult.extraFees,
      dogFee: autoResult.dogFee,
    });
  };

  // Solange der zuletzt angewendete Override noch zur aktuellen Nächteliste passt
  // (gleiche Anzahl), zeigen wir ihn an — sonst die frische automatische Berechnung.
  const overrideNights = form.priceBreakdown?.nights?.some((n) => n.originalPrice !== undefined)
    && form.priceBreakdown.nights.length === (autoResult?.nights.length ?? form.priceBreakdown.nights.length)
    ? form.priceBreakdown.nights
    : null;
  const displayNights = overrideNights ?? autoResult?.nights ?? [];
  const displayFees = overrideNights
    ? { cleaningFee: form.priceBreakdown!.cleaningFee, extraFees: form.priceBreakdown!.extraFees, dogFee: form.priceBreakdown!.dogFee }
    : { cleaningFee: autoResult?.cleaningFee ?? 0, extraFees: autoResult?.extraFees ?? [], dogFee: autoResult?.dogFee ?? 0 };
  const hasData = displayNights.length > 0;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Preis (€)</label>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          min={0}
          step={1}
          value={form.price}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            set("price", Number.isNaN(n) ? 0 : n);
            set("priceIsManual", true);
          }}
          className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-lg font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap cursor-pointer">
          <input
            type="checkbox"
            checked={overrideActive}
            onChange={(e) => setOverrideActive(e.target.checked)}
            className="w-3.5 h-3.5 rounded"
          />
          Übernachtungspreis
        </label>
        <input
          type="number"
          min={0}
          step={1}
          value={overrideRate}
          onChange={(e) => setOverrideRate(e.target.value)}
          disabled={!overrideActive}
          placeholder="€/Nacht"
          className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 disabled:bg-gray-100"
        />
        {autoResult && (form.priceIsManual || overrideActive) && (
          <button
            type="button"
            onClick={handleRecalculate}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Neu berechnen
          </button>
        )}
      </div>

      {hasData && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-start gap-1 text-left text-xs text-gray-500 mt-1 hover:text-gray-700"
        >
          <span>{priceSummaryText({ nights: displayNights, ...displayFees })}</span>
          <ChevronDown className={`w-3 h-3 flex-shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}

      {open && hasData && (
        <div className="mt-2 border border-gray-200 rounded-lg p-3 text-xs space-y-1">
          {displayNights.map((n, i) => (
            <div key={i} className="flex justify-between text-gray-600">
              <span>{fmtDate(n.date)} ({n.seasonLabel})</span>
              {n.originalPrice !== undefined && n.originalPrice !== n.price ? (
                <span className="flex items-center gap-1.5">
                  <span className="line-through text-gray-400">{n.originalPrice.toLocaleString("de-DE")} €</span>
                  <span className="text-gray-900">{n.price.toLocaleString("de-DE")} €</span>
                </span>
              ) : (
                <span>{n.price.toLocaleString("de-DE")} €</span>
              )}
            </div>
          ))}
          {displayFees.cleaningFee > 0 && (
            <div className="flex justify-between text-gray-600 pt-1 border-t border-gray-100">
              <span>Reinigung</span><span>{displayFees.cleaningFee.toLocaleString("de-DE")} €</span>
            </div>
          )}
          {displayFees.extraFees.map((f, i) => (
            <div key={i} className="flex justify-between text-gray-600">
              <span>{f.label}</span><span>{f.amount.toLocaleString("de-DE")} €</span>
            </div>
          ))}
          {displayFees.dogFee > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Hund × {form.dogCount}</span><span>{displayFees.dogFee.toLocaleString("de-DE")} €</span>
            </div>
          )}
        </div>
      )}
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
  const [numberCopied, setNumberCopied] = useState(false);
  const [includeNewsletter, setIncludeNewsletter] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");

  // Overlays
  const [showSaveDiff, setShowSaveDiff] = useState(false);
  const [pendingSave, setPendingSave] = useState<{ data: BookingFormData; changes: FieldChange[] } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [restoreEntry, setRestoreEntry] = useState<BookingHistoryEntry | null>(null);
  const [pendingCollision, setPendingCollision] = useState<{ data: BookingFormData; conflict: Booking } | null>(null);

  const { data: allBookings = [] } = useBookings();
  const { data: trashedBookings = [] } = useTrashedBookings();
  const { data: history = [] } = useBookingHistory(current?.id);
  const { data: priceSettings = [] } = usePriceSettings();
  const { data: houseSettings = [] } = useHouseSettings();
  const create = useCreateBooking();
  const update = useUpdateBooking();
  const del = useSoftDeleteBooking();

  // Automatisch berechneter Preis für die aktuellen Formulardaten (null wenn
  // keine Preisdaten für Wohnung/Zeitraum hinterlegt sind).
  const autoResult = useMemo<PriceResult | null>(() => {
    const groupId = priceGroupOf(form.property_id);
    const settings = priceSettings.find((p) => p.id === groupId);
    if (!settings || !form.check_in || !form.check_out || form.check_out <= form.check_in) return null;
    return calculatePrice(form.check_in, form.check_out, form.adults, form.children, form.dogCount, settings);
  }, [form.property_id, form.check_in, form.check_out, form.adults, form.children, form.dogCount, priceSettings]);

  const isLoading = create.isPending || update.isPending || del.isPending;

  // Auch Nummern im Papierkorb gelten als belegt, damit eine neue Buchung
  // nicht versehentlich die Nummer einer wiederherstellbaren Buchung erhält.
  const existingNumbers = useMemo(
    () => new Set([...allBookings, ...trashedBookings].map((b) => b.booking_number).filter(Boolean)),
    [allBookings, trashedBookings],
  );

  // Bezugswert der preisrelevanten Felder, gegen den der Auto-Berechnungs-Effekt
  // vergleicht — verhindert, dass das bloße Öffnen des Modals einen bereits
  // gespeicherten Preis überschreibt (nur echte Änderungen DANACH lösen aus).
  // Wird beim (Wieder-)Öffnen synchron auf die geladenen Werte gesetzt, unabhängig
  // von Effekt-Reihenfolge oder wie oft irgendein Effekt zwischendurch feuert.
  const priceTriggerKeyOf = (f: BookingFormData) =>
    `${f.property_id}|${f.check_in}|${f.check_out}|${f.adults}|${f.children}|${f.dogCount}`;
  const lastPriceTriggerKey = useRef("");

  useEffect(() => {
    if (!open) return;
    setCurrent(booking ?? null);
    let loadedForm: BookingFormData;
    if (booking) {
      loadedForm = formOf(booking);
      setForm(loadedForm);
      setMode("view");
    } else if (prefill) {
      loadedForm = { ...EMPTY_FORM, property_id: prefill.propertyId, check_in: prefill.checkIn, check_out: prefill.checkOut };
      setForm(loadedForm);
      setMode("edit");
    } else {
      loadedForm = EMPTY_FORM;
      setForm(loadedForm);
      setMode("edit");
    }
    lastPriceTriggerKey.current = priceTriggerKeyOf(loadedForm);
    setError("");
    setNumberCopied(false);
    setPdfError("");
    setShowSaveDiff(false);
    setPendingSave(null);
    setShowHistory(false);
    setRestoreEntry(null);
    setPendingCollision(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, booking, prefill]);

  // Automatische Neuberechnung bei Datum/Wohnung/Personen/Hund-Änderung, aber nur
  // solange der Preis nicht manuell überschrieben wurde.
  useEffect(() => {
    const key = priceTriggerKeyOf(form);
    if (key === lastPriceTriggerKey.current) return;
    lastPriceTriggerKey.current = key;
    if (form.priceIsManual || !autoResult) return;
    setForm((prev) => ({
      ...prev,
      price: autoResult.total,
      priceBreakdown: {
        nights: autoResult.nights,
        cleaningFee: autoResult.cleaningFee,
        extraFees: autoResult.extraFees,
        dogFee: autoResult.dogFee,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.property_id, form.check_in, form.check_out, form.adults, form.children, form.dogCount, autoResult]);

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

  const handleGeneratePdf = async () => {
    if (!current) return;
    setPdfError("");
    const prop = properties.find((p) => p.id === current.property_id);
    const houseId: HouseId = prop?.house === "Haus Anne" ? "haus-anne" : "upstalsboom";
    const house = houseSettings.find((h) => h.id === houseId);
    if (!house) {
      setPdfError("Keine Haus-Konfiguration gefunden – bitte zuerst unter Einstellungen → Haus-Konfiguration ausfüllen.");
      return;
    }
    setPdfLoading(true);
    try {
      const logoBytes = await fetch(LOGO_URLS[houseId]).then((r) => r.arrayBuffer()).catch(() => null);
      const bytes = await generateConfirmationPdf(current, house, logoBytes, { includeNewsletter });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      setPdfError(`PDF konnte nicht erstellt werden: ${(e as Error).message}`);
    } finally {
      setPdfLoading(false);
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
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <ViewRow label="Wohnung">{formatFieldValue("property_id", current.property_id)}</ViewRow>
                <ViewRow label="Gast">{current.guest_name || "–"}</ViewRow>
                <ViewRow label="Anreise">{fmtDate(current.check_in)}</ViewRow>
                <ViewRow label="Abreise">{fmtDate(current.check_out)}</ViewRow>
                <ViewRow label="Telefon">{current.phone || "–"}</ViewRow>
                <ViewRow label="E-Mail">{current.email || "–"}</ViewRow>
                <ViewRow label="Kanal">{current.channel || "Manuell"}</ViewRow>
                <ViewRow label="Fähre Anreise">
                  {current.ferry_time ? `${current.ferry_time} Uhr (Neßmersiel → Baltrum)` : "–"}
                </ViewRow>
                <ViewRow label="Fähre Abreise">
                  {current.ferry_time_departure ? `${current.ferry_time_departure} Uhr (Baltrum → Neßmersiel)` : "–"}
                </ViewRow>
                <ViewRow label="Preis">
                  {current.price.toLocaleString("de-DE")} €
                  {current.priceIsManual && <span className="text-gray-400 text-xs"> (manuell)</span>}
                </ViewRow>
                <ViewRow label="Bezahlt">{current.is_paid ? "Ja" : "Nein"}</ViewRow>
                <ViewRow label="Personen">
                  {persons} {current.children > 0 && <span className="text-gray-400">({current.adults} Erw. + {current.children} Ki.)</span>}
                </ViewRow>
                {current.children > 0 && current.kinderAlter.length > 0 && (
                  <ViewRow label="Kinder">
                    {current.children} {current.children === 1 ? "Kind" : "Kinder"} ({current.kinderAlter.join(", ")} Jahre)
                  </ViewRow>
                )}
                <ViewRow label="Hund">{current.dogCount > 0 ? `${current.dogCount} 🐕` : "Nein"}</ViewRow>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                  <input type="text" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+49 176 2233445" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                  <input type="text" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="mueller@email.de" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Buchungskanal</label>
                  <select value={form.channel} onChange={(e) => set("channel", e.target.value)} className={inputCls}>
                    {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <PriceSection key={current?.id ?? "new"} form={form} set={set} autoResult={autoResult} />
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
                  <label className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Hund 🐕</span>
                    <select
                      value={form.dogCount}
                      onChange={(e) => set("dogCount", parseInt(e.target.value) || 0)}
                      disabled={!selectedProperty?.allowsDogs}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm disabled:opacity-50 disabled:bg-gray-100"
                    >
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                    {!selectedProperty?.allowsDogs && <span className="text-red-500 text-xs">(n. erlaubt)</span>}
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

              {current && form.status !== "anfrage" && form.status !== "reserviert" && form.status !== "problem" && (
                <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <span className="text-sm font-semibold text-gray-700">Buchungsbestätigung (PDF)</span>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={includeNewsletter} onChange={(e) => setIncludeNewsletter(e.target.checked)} />
                    Newsletter-Frage einschließen
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePdf}
                    disabled={pdfLoading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
                  >
                    {pdfLoading ? "Erstelle…" : "Bestätigung erstellen (Vorschau)"}
                  </button>
                  <p className="text-xs text-gray-400">
                    Vorläufig: öffnet nur eine Vorschau in neuem Tab. Speichern/Versionierung/E-Mail folgen noch.
                  </p>
                  {pdfError && <p className="text-sm text-red-600">{pdfError}</p>}
                </div>
              )}
            </>
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
