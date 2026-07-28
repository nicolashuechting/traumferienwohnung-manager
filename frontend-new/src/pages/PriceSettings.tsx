import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Save, Download } from "lucide-react";
import { usePriceSettings, useUpdatePriceGroup, useSeedPriceSettings } from "@/hooks/usePriceSettings";
import { PRICE_GROUP_LABELS, PRICE_GROUP_ORDER } from "@/lib/priceGroups";
import { PRICE_SEED_DATA } from "@/lib/priceSeedData";
import type { PriceGroupSettings, PriceGroupId, PriceSeason, PriceYear } from "@/types";

const inputCls = "w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none";

function emptyGroup(id: PriceGroupId): PriceGroupSettings {
  return { id, maxPersons: 4, flatRate: false, cleaningFee: 0, extraFees: [], dogFee: 0, years: [] };
}

export function PriceSettings() {
  const { data: groups = [], isLoading } = usePriceSettings();
  const update = useUpdatePriceGroup();
  const seed = useSeedPriceSettings();

  const [selectedId, setSelectedId] = useState<PriceGroupId>("kamin");
  const [draft, setDraft] = useState<PriceGroupSettings | null>(null);
  const [yearIdx, setYearIdx] = useState(0);
  const [saved, setSaved] = useState(false);

  const current = useMemo(() => groups.find((g) => g.id === selectedId), [groups, selectedId]);

  useEffect(() => {
    setDraft(current ? structuredClone(current) : emptyGroup(selectedId));
    setYearIdx(0);
    setSaved(false);
  }, [selectedId, current]);

  if (isLoading || !draft) return <div className="p-8 text-sm text-gray-500">Lädt…</div>;

  const year: PriceYear | undefined = draft.years[yearIdx];

  const updateSeason = (seasonIdx: number, patch: Partial<PriceSeason>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const years = [...prev.years];
      const seasons = [...years[yearIdx].seasons];
      seasons[seasonIdx] = { ...seasons[seasonIdx], ...patch };
      years[yearIdx] = { ...years[yearIdx], seasons };
      return { ...prev, years };
    });
  };

  const addYear = () => {
    setDraft((prev) => {
      if (!prev) return prev;
      const last = prev.years[prev.years.length - 1];
      const newYear: PriceYear = {
        year: (last?.year ?? new Date().getFullYear()) + 1,
        seasons: last ? structuredClone(last.seasons) : [],
      };
      const years = [...prev.years, newYear];
      setYearIdx(years.length - 1);
      return { ...prev, years };
    });
  };

  const addDateRange = (seasonIdx: number) => {
    const season = year.seasons[seasonIdx];
    updateSeason(seasonIdx, { dateRanges: [...season.dateRanges, { start: "", end: "" }] });
  };

  const removeDateRange = (seasonIdx: number, rangeIdx: number) => {
    const season = year.seasons[seasonIdx];
    updateSeason(seasonIdx, { dateRanges: season.dateRanges.filter((_, i) => i !== rangeIdx) });
  };

  const handleSave = async () => {
    await update.mutateAsync({ id: draft.id, data: draft });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const personCols = Array.from({ length: draft.maxPersons }, (_, i) => i + 1);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h2 className="text-xl font-bold text-gray-900">Preise verwalten</h2>
        <p className="text-sm text-gray-500 mt-1">Saisonpreise, Servicegebühren und Hundegebühr je Wohnungsgruppe.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl space-y-5">

      {groups.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-amber-800">Noch keine Preise hinterlegt.</p>
          <button
            onClick={() => seed.mutate(PRICE_SEED_DATA)}
            disabled={seed.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> {seed.isPending ? "Lädt…" : "Startwerte laden (2026)"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {PRICE_GROUP_ORDER.map((id) => (
          <button
            key={id}
            onClick={() => setSelectedId(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition
              ${selectedId === id ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
          >
            {PRICE_GROUP_LABELS[id]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {draft.years.map((y, i) => (
          <button
            key={y.year}
            onClick={() => setYearIdx(i)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${i === yearIdx ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {y.year}
          </button>
        ))}
        <button onClick={addYear} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          <Plus className="w-3.5 h-3.5" /> Jahr hinzufügen
        </button>
      </div>

      {!year && <p className="text-sm text-gray-400">Noch kein Jahr angelegt.</p>}

      {year && (
        <div className="space-y-3">
          {year.seasons.map((season, si) => (
            <div key={season.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <input
                  value={season.label}
                  onChange={(e) => updateSeason(si, { label: e.target.value })}
                  className="text-sm font-semibold text-gray-900 border-none outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 -ml-1"
                />
              </div>

              <div className="space-y-1.5 mb-3">
                {season.dateRanges.map((r, ri) => (
                  <div key={ri} className="flex items-center gap-2">
                    <input type="date" value={r.start} onChange={(e) => {
                      const ranges = [...season.dateRanges];
                      ranges[ri] = { ...ranges[ri], start: e.target.value };
                      updateSeason(si, { dateRanges: ranges });
                    }} className={`${inputCls} max-w-[160px]`} />
                    <span className="text-gray-400 text-sm">–</span>
                    <input type="date" value={r.end} onChange={(e) => {
                      const ranges = [...season.dateRanges];
                      ranges[ri] = { ...ranges[ri], end: e.target.value };
                      updateSeason(si, { dateRanges: ranges });
                    }} className={`${inputCls} max-w-[160px]`} />
                    <button onClick={() => removeDateRange(si, ri)} className="p-1 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={() => addDateRange(si)} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                  + Zeitraum
                </button>
              </div>

              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${personCols.length}, minmax(0,1fr))` }}>
                {personCols.map((p) => (
                  <div key={p}>
                    <label className="block text-xs text-gray-500 mb-1">{p} Pers.</label>
                    <input
                      type="number"
                      min={0}
                      value={season.pricePerPerson[p] ?? ""}
                      onChange={(e) => updateSeason(si, {
                        pricePerPerson: { ...season.pricePerPerson, [p]: parseFloat(e.target.value) || 0 },
                      })}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border border-gray-200 rounded-lg p-4 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {draft.flatRate ? "Endreinigung" : "Servicegebühr"} (€)
          </label>
          <input type="number" min={0} value={draft.cleaningFee}
            onChange={(e) => setDraft({ ...draft, cleaningFee: parseFloat(e.target.value) || 0 })}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hundegebühr (€/Hund)</label>
          <input type="number" min={0} value={draft.dogFee}
            onChange={(e) => setDraft({ ...draft, dogFee: parseFloat(e.target.value) || 0 })}
            className={inputCls} />
        </div>

        {draft.extraFees.map((f, i) => (
          <div key={i} className="col-span-2 flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Zusatzgebühr</label>
              <input value={f.label} onChange={(e) => {
                const fees = [...draft.extraFees]; fees[i] = { ...fees[i], label: e.target.value };
                setDraft({ ...draft, extraFees: fees });
              }} className={inputCls} />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 mb-1">Betrag (€)</label>
              <input type="number" min={0} value={f.amount} onChange={(e) => {
                const fees = [...draft.extraFees]; fees[i] = { ...fees[i], amount: parseFloat(e.target.value) || 0 };
                setDraft({ ...draft, extraFees: fees });
              }} className={inputCls} />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-sm text-gray-600">
              <input type="checkbox" checked={!!f.perPerson} onChange={(e) => {
                const fees = [...draft.extraFees]; fees[i] = { ...fees[i], perPerson: e.target.checked };
                setDraft({ ...draft, extraFees: fees });
              }} className="w-4 h-4 rounded" />
              pro Person
            </label>
            <button onClick={() => setDraft({ ...draft, extraFees: draft.extraFees.filter((_, j) => j !== i) })} className="p-1.5 text-gray-400 hover:text-red-600 mb-1">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setDraft({ ...draft, extraFees: [...draft.extraFees, { label: "", amount: 0 }] })}
          className="col-span-2 text-xs font-medium text-blue-600 hover:text-blue-700 text-left"
        >
          + Zusatzgebühr
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={update.isPending}
        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50"
      >
        <Save className="w-4 h-4" /> {update.isPending ? "Speichert…" : saved ? "Gespeichert ✓" : "Speichern"}
      </button>
      </div>
    </div>
  );
}
