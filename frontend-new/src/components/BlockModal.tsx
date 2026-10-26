import { useEffect, useState } from "react";
import { Lock, Trash2, X } from "lucide-react";
import { useBookings, useCreateBooking, useUpdateBooking, useSoftDeleteBooking } from "@/hooks/useBookings";
import { useHouseSettings } from "@/hooks/useHouseSettings";
import { useUserRole } from "@/hooks/useUserRole";
import { properties, houseIdOf } from "@/lib/properties";
import { findCollision } from "@/lib/bookingDrag";
import { diffBooking } from "@/lib/bookingHistory";
import { shouldNotify } from "@/lib/bookingNotify";
import { sendChangeNotification } from "@/lib/notifyEmail";
import { cleanBlockName, newBlockData, BLOCK_COLOR, BLOCK_STRIPES } from "@/lib/blocks";
import { NotifyDialog } from "@/components/NotifyDialog";
import type { Booking, BookingFormData, FieldChange, HouseSettings } from "@/types";

// Fenster zum Anlegen/Bearbeiten einer Sperre (z.B. Familie): nur Wohnung, Zeitraum,
// ein Wort als Name und eine Notiz. Keine Kosten, keine Bestätigung, keine Rechnung,
// kein Gast-Profil (siehe lib/blocks.ts). Kurzfristige Änderungen gehen wie bei
// Buchungen als Hinweis an die Reinigung (Benachrichtigungs-Mail des Hauses).

interface Props {
  open: boolean;
  booking: Booking | null;           // bestehende Sperre oder null = neu
  prefill?: { propertyId: string; checkIn: string; checkOut: string };
  onClose: () => void;
  onSwitchToBooking?: () => void;    // nur beim Neuanlegen: zurück zur normalen Buchung
  variant?: "modal" | "embedded";
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-500 outline-none disabled:bg-gray-50";

export function BlockModal({ open, booking, prefill, onClose, onSwitchToBooking, variant = "modal" }: Props) {
  const { data: bookings = [] } = useBookings();
  const { data: houseSettings = [] } = useHouseSettings();
  const { isViewer } = useUserRole();
  const create = useCreateBooking();
  const update = useUpdateBooking();
  const del = useSoftDeleteBooking();

  const [propertyId, setPropertyId] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [collisionOk, setCollisionOk] = useState(false);
  const [notifyPrompt, setNotifyPrompt] = useState<{ data: BookingFormData; changes: FieldChange[]; kind: "create" | "update" | "cancel"; house: HouseSettings; proceed: () => Promise<void> } | null>(null);
  const [notifyError, setNotifyError] = useState("");

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- Formular beim Öffnen befüllen */
    setPropertyId(booking?.property_id ?? prefill?.propertyId ?? "");
    setCheckIn(booking?.check_in ?? prefill?.checkIn ?? "");
    setCheckOut(booking?.check_out ?? prefill?.checkOut ?? "");
    setName(booking?.guest_name ?? "");
    setNotes(booking?.notes ?? "");
    setError("");
    setCollisionOk(false);
    setNotifyPrompt(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, booking, prefill]);

  if (!open) return null;

  const collision = propertyId && checkIn && checkOut
    ? findCollision(bookings, propertyId, booking?.id ?? "", checkIn, checkOut)
    : undefined;

  const houseFor = (prop: string) => houseSettings.find((h) => h.id === houseIdOf(prop));

  // Wie bei Buchungen: kurzfristige Änderungen (innerhalb der nächsten Tage) optional
  // per Mail an die hinterlegte Benachrichtigungsadresse des Hauses melden.
  const withNotify = async (old: Booking | null, data: BookingFormData, kind: "create" | "update" | "cancel", proceed: () => Promise<void>) => {
    const { should, changes } = shouldNotify(old, data, kind);
    const house = should ? houseFor(data.property_id) : undefined;
    if (house?.notifyEmail) {
      setNotifyError("");
      setNotifyPrompt({ data, changes, kind, house, proceed });
      return;
    }
    await proceed();
  };

  const handleSave = async () => {
    setError("");
    if (!propertyId) { setError("Bitte eine Wohnung wählen."); return; }
    if (!checkIn || !checkOut) { setError("Bitte Anreise und Abreise angeben."); return; }
    if (checkOut <= checkIn) { setError("Die Abreise muss nach der Anreise liegen."); return; }
    if (collision && !collisionOk) {
      setError(`Überschneidet sich mit „${collision.guest_name || "einer Buchung"}“ (${collision.check_in} – ${collision.check_out}). Zum Speichern trotzdem unten bestätigen.`);
      return;
    }
    const data = newBlockData({ property_id: propertyId, check_in: checkIn, check_out: checkOut, name, notes });
    setSaving(true);
    try {
      if (!booking) {
        await withNotify(null, data, "create", async () => { await create.mutateAsync(data); onClose(); });
      } else {
        const patch: Partial<BookingFormData> = {
          property_id: data.property_id,
          check_in: data.check_in,
          check_out: data.check_out,
          guest_name: data.guest_name,
          guest_last_name: data.guest_last_name,
          notes: data.notes,
        };
        const changes = diffBooking(booking, patch);
        if (changes.length === 0) { onClose(); return; }
        await withNotify(booking, { ...data, booking_number: "" }, "update", async () => {
          await update.mutateAsync({ id: booking.id, data: patch, history: { changes } });
          onClose();
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!booking) return;
    if (!window.confirm("Sperre in den Papierkorb verschieben?")) return;
    setSaving(true);
    try {
      await withNotify(booking, newBlockData({ property_id: booking.property_id, check_in: booking.check_in, check_out: booking.check_out, name: booking.guest_name, notes: booking.notes }), "cancel", async () => {
        await del.mutateAsync(booking.id);
        onClose();
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleNotifyConfirm = async () => {
    if (!notifyPrompt) return;
    try {
      await sendChangeNotification(notifyPrompt.data, notifyPrompt.house, notifyPrompt.changes, notifyPrompt.kind);
    } catch (e) {
      setNotifyError(`Mail konnte nicht gesendet werden: ${(e as Error).message}`);
      return;
    }
    const proceed = notifyPrompt.proceed;
    setNotifyPrompt(null);
    await proceed();
  };
  const handleNotifySkip = async () => {
    if (!notifyPrompt) return;
    const proceed = notifyPrompt.proceed;
    setNotifyPrompt(null);
    await proceed();
  };

  const readOnly = isViewer;
  const houses = ["Upstalsboom", "Haus Anne"] as const;

  const card = (
    <div className={variant === "modal"
      ? "relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
      : "relative bg-white w-full h-full flex flex-col"}>
      {/* Kopf: graues Schraffur-Band wie im Kalender */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 rounded-t-xl"
        style={{ backgroundColor: BLOCK_COLOR, backgroundImage: BLOCK_STRIPES }}>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Lock className="w-5 h-5" /> {booking ? "Sperre" : "Zeitraum sperren"}
        </h2>
        {variant === "modal" && (
          <button onClick={onClose} className="p-1 text-white/90 hover:bg-white/15 rounded-lg transition"><X className="w-5 h-5" /></button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {onSwitchToBooking && (
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5 w-fit">
            <button onClick={onSwitchToBooking} className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">Buchung</button>
            <button className="px-3 py-1.5 rounded-md text-sm font-medium bg-white text-gray-900 shadow-sm">Zeitraum sperren</button>
          </div>
        )}
        <p className="text-sm text-gray-600">
          Für Familie o. Ä.: Die Wohnung ist belegt und wird danach gereinigt — <strong>keine Kosten, keine Bestätigung, keine Kurtaxe, kein Gast</strong>.
        </p>

        {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Wohnung</label>
          <select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setCollisionOk(false); }} disabled={readOnly} className={inputCls}>
            <option value="">– bitte wählen –</option>
            {houses.map((h) => (
              <optgroup key={h} label={h}>
                {properties.filter((p) => p.house === h).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Von</label>
            <input type="date" value={checkIn} onChange={(e) => { setCheckIn(e.target.value); setCollisionOk(false); }} disabled={readOnly} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bis</label>
            <input type="date" value={checkOut} onChange={(e) => { setCheckOut(e.target.value); setCollisionOk(false); }} disabled={readOnly} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-gray-400 font-normal">(ein Wort, z. B. „Familie“)</span></label>
          <input value={name} onChange={(e) => setName(cleanBlockName(e.target.value.replace(/\s+/g, "")))} disabled={readOnly} placeholder="Familie" className={inputCls} maxLength={30} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Buchungsnotiz <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} rows={3} className={inputCls} placeholder="z. B. Bettwäsche selbst mitbringen" />
        </div>

        {collision && (
          <label className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
            <input type="checkbox" checked={collisionOk} onChange={(e) => setCollisionOk(e.target.checked)} disabled={readOnly} className="mt-0.5" />
            <span>Überschneidet sich mit „{collision.guest_name || "Buchung"}“ ({collision.check_in} – {collision.check_out}). Trotzdem sperren.</span>
          </label>
        )}
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-200">
          {booking ? (
            <button onClick={handleDelete} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> Sperre löschen
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-1.5 text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition disabled:opacity-50">Abbrechen</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-sm font-semibold text-white rounded-lg transition disabled:opacity-50" style={{ backgroundColor: BLOCK_COLOR }}>
              {saving ? "Speichert…" : booking ? "Speichern" : "Sperren"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {variant === "modal" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          {card}
        </div>
      ) : card}
      {notifyPrompt && (
        <NotifyDialog
          open
          fromEmail={notifyPrompt.house.contactEmail}
          toEmail={notifyPrompt.house.notifyEmail}
          summary={`${properties.find((p) => p.id === notifyPrompt.data.property_id)?.name ?? notifyPrompt.data.property_id} · Sperre ${notifyPrompt.data.guest_name || ""} · ${notifyPrompt.data.check_in} – ${notifyPrompt.data.check_out}`}
          error={notifyError}
          onConfirm={handleNotifyConfirm}
          onSkip={handleNotifySkip}
        />
      )}
    </>
  );
}
