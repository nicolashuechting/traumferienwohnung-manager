import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Mail } from "lucide-react";
import { updateGuestAndBookings, type GuestEditFields } from "@/hooks/useGuests";
import { splitGuestName } from "@/lib/guestName";

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none";

interface Props {
  open: boolean;
  onClose: () => void;
  guest: {
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    phone: string;
    street: string;
    houseNumber: string;
    zip: string;
    city: string;
    country: string;
    personNotes: string;
    marketingConsent: boolean;
  } | null;
  bookingIds: string[];
  totalBookings: number;
}

export function GuestEditModal({ open, onClose, guest, bookingIds, totalBookings }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<GuestEditFields>({
    firstName: "", lastName: "", email: "", phone: "", street: "", houseNumber: "", zip: "", city: "", country: "",
    personNotes: "", marketingConsent: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !guest) return;
    // Altbestand ohne getrennte Felder: für die Bearbeitung best-effort aus name vorbefüllen.
    const hasSplitName = guest.firstName || guest.lastName;
    const { first, last } = hasSplitName
      ? { first: guest.firstName, last: guest.lastName }
      : splitGuestName(guest.name);
    setForm({
      firstName: first,
      lastName: last,
      email: guest.email,
      phone: guest.phone,
      street: guest.street,
      houseNumber: guest.houseNumber,
      zip: guest.zip,
      city: guest.city,
      country: guest.country,
      personNotes: guest.personNotes,
      marketingConsent: guest.marketingConsent,
    });
    setError("");
  }, [open, guest]);

  if (!open || !guest) return null;

  const set = <K extends keyof GuestEditFields>(key: K, value: GuestEditFields[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.email.trim()) { setError("E-Mail darf nicht leer sein."); return; }
    setSaving(true);
    setError("");
    try {
      await updateGuestAndBookings(guest.email, form, bookingIds);
      qc.invalidateQueries({ queryKey: ["guests"] });
      qc.invalidateQueries({ queryKey: ["bookingsAll"] });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Gast bearbeiten</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>
          )}
          {totalBookings > 0 && (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Änderungen werden in allen {totalBookings} Buchung{totalBookings !== 1 ? "en" : ""} dieses Gasts übernommen.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vorname</label>
              <input type="text" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nachname</label>
              <input type="text" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <input type="text" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail *</label>
              <input type="text" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-[2fr_1fr] gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
              <input type="text" value={form.street} onChange={(e) => set("street", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nr.</label>
              <input type="text" value={form.houseNumber} onChange={(e) => set("houseNumber", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_2fr_1fr] gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PLZ</label>
              <input type="text" value={form.zip} onChange={(e) => set("zip", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ort</label>
              <input type="text" value={form.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Land</label>
              <input type="text" value={form.country} onChange={(e) => set("country", e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Personennotizen</label>
            <textarea
              value={form.personNotes}
              onChange={(e) => set("personNotes", e.target.value)}
              rows={2}
              placeholder="z.B. zahlt immer bar, sitzt im Rollstuhl..."
              className={`${inputCls} resize-none`}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.marketingConsent}
              onChange={(e) => set("marketingConsent", e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-gray-400" />
              Einwilligung Werbemails erhalten (per Unterschrift bestätigt)
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition">
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
          >
            {saving ? "Speichert…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
