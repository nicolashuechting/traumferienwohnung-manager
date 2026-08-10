import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { useHouseSettings, useUpdateHouseSettings } from "@/hooks/useHouseSettings";
import { useUserRole } from "@/hooks/useUserRole";
import type { HouseId, HouseSettings } from "@/types";

const inputCls = "w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none";

const HOUSE_ORDER: HouseId[] = ["haus-anne", "upstalsboom"];
const HOUSE_LABELS: Record<HouseId, string> = { "haus-anne": "Haus Anne", "upstalsboom": "Hus Upstalsboom" };

function emptyHouse(id: HouseId): HouseSettings {
  return {
    id,
    name: HOUSE_LABELS[id],
    address: "",
    logoAssetPath: "",
    kontoinhaber: "",
    iban: "",
    bank: "",
    contactEmail: "",
    notifyEmail: "",
    phone: "",
    website: "",
    footerName: "",
    kurtaxeSuchname: "",
    checkInTime: "15:00",
    checkOutTime: "10:00",
    stornoText: [
      "bis zu drei Monate vor Buchungsbeginn: kostenfrei",
      "bis zu einem Monat vor Buchungsbeginn: 50% des Gesamtpreises",
      "danach: 95% des Gesamtpreises",
    ],
  };
}

export function HouseSettingsPage() {
  const { isViewer } = useUserRole();
  const { data: houses = [], isLoading } = useHouseSettings();
  const update = useUpdateHouseSettings();

  const [selectedId, setSelectedId] = useState<HouseId>("haus-anne");
  const [draft, setDraft] = useState<HouseSettings | null>(null);
  const [saved, setSaved] = useState(false);

  const current = useMemo(() => houses.find((h) => h.id === selectedId), [houses, selectedId]);

  useEffect(() => {
    setDraft(current ? structuredClone(current) : emptyHouse(selectedId));
    setSaved(false);
  }, [selectedId, current]);

  if (isLoading || !draft) return <div className="p-8 text-sm text-gray-500">Lädt…</div>;

  const set = <K extends keyof HouseSettings>(key: K, value: HouseSettings[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSave = async () => {
    await update.mutateAsync({ id: draft.id, data: draft });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h2 className="text-xl font-bold text-gray-900">Haus-Konfiguration</h2>
        <p className="text-sm text-gray-500 mt-1">
          Adresse, Kontaktdaten und Bankverbindung je Haus — für die Buchungsbestätigungs-PDFs.
          Bankdaten werden nur hier in Firestore gespeichert, nie im Quellcode.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl space-y-5">
        <div className="flex gap-1.5">
          {HOUSE_ORDER.map((id) => (
            <button
              key={id}
              onClick={() => setSelectedId(id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition
                ${selectedId === id ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
            >
              {HOUSE_LABELS[id]}
            </button>
          ))}
        </div>

        {isViewer && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Nur Ansicht — du kannst diese Einstellungen nicht bearbeiten.
          </p>
        )}

        <fieldset disabled={isViewer} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 m-0 min-w-0">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Anzeigename</label>
              <input className={inputCls} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder={HOUSE_LABELS[selectedId]} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Adresse</label>
              <input className={inputCls} value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder="Ostdorf 230, 26579 Baltrum" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefon</label>
              <input className={inputCls} value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="04939-9109684" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kontakt-E-Mail</label>
              <input className={inputCls} value={draft.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="urlaub@hausannebaltrum.de" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Website</label>
            <input className={inputCls} value={draft.website} onChange={(e) => set("website", e.target.value)} placeholder="https://www.hausannebaltrum.de" />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Benachrichtigungs-E-Mail (Änderungen/Stornierungen kurzfristiger Buchungen)
            </label>
            <input className={inputCls} value={draft.notifyEmail} onChange={(e) => set("notifyEmail", e.target.value)} placeholder="ewelina@beispiel.de" />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Bankverbindung</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Kontoinhaber</label>
                <input className={inputCls} value={draft.kontoinhaber} onChange={(e) => set("kontoinhaber", e.target.value)} placeholder="Haus Anne GbR" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">IBAN</label>
                  <input className={inputCls} value={draft.iban} onChange={(e) => set("iban", e.target.value)} placeholder="DE00 0000 0000 0000 0000 00" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Bank</label>
                  <input className={inputCls} value={draft.bank} onChange={(e) => set("bank", e.target.value)} placeholder="Raiffeisen-Volksbank Fresena eG" />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fußzeilen-Name</label>
              <input className={inputCls} value={draft.footerName} onChange={(e) => set("footerName", e.target.value)} placeholder="Familien Rothengaß und Hüchting" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kurtaxe-Suchname</label>
              <input className={inputCls} value={draft.kurtaxeSuchname} onChange={(e) => set("kurtaxeSuchname", e.target.value)} placeholder="Andreas Hüchting Haus Anne GbR" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Check-in ab</label>
              <input type="time" className={inputCls} value={draft.checkInTime} onChange={(e) => set("checkInTime", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Check-out bis</label>
              <input type="time" className={inputCls} value={draft.checkOutTime} onChange={(e) => set("checkOutTime", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Stornobedingungen (eine Zeile je Punkt)</label>
            <textarea
              className={`${inputCls} font-mono`}
              rows={3}
              value={draft.stornoText.join("\n")}
              onChange={(e) => set("stornoText", e.target.value.split("\n"))}
            />
          </div>
        </fieldset>

        {!isViewer && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={update.isPending}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {update.isPending ? "Speichert…" : "Speichern"}
          </button>
          {saved && <span className="text-sm text-emerald-600 font-medium">Gespeichert ✓</span>}
        </div>
        )}
      </div>
    </div>
  );
}
