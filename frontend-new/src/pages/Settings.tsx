import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, RefreshCw, CheckCircle, AlertCircle, Link, Download, Euro, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { properties } from "@/lib/properties";
import {
  useIcalFeeds, useCreateIcalFeed,
  useDeleteIcalFeed, useSyncIcalFeeds,
} from "@/hooks/useIcalFeeds";
import type { SyncResult } from "@/hooks/useIcalFeeds";
import { downloadBackup } from "@/lib/backupExport";

function fmtSync(iso: string) {
  if (!iso) return "Noch nie";
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

const CHANNEL_PRESETS = [
  "Ferienwohnungen.de",
  "Baltrumdirekt.de",
  "Airbnb",
  "Booking.com",
];

export function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: feeds = [] } = useIcalFeeds();
  const createFeed  = useCreateIcalFeed();
  const deleteFeed  = useDeleteIcalFeed();
  const syncFeeds   = useSyncIcalFeeds();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl]   = useState("");
  const [newProp, setNewProp] = useState(properties[0].id);

  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  async function handleExport() {
    setExporting(true);
    setExportError("");
    try {
      await downloadBackup();
    } catch (e) {
      setExportError((e as Error).message || "Export fehlgeschlagen.");
    } finally {
      setExporting(false);
    }
  }

  async function handleAdd() {
    if (!newName.trim() || !newUrl.trim()) return;
    await createFeed.mutateAsync({ name: newName.trim(), url: newUrl.trim(), property_id: newProp });
    setNewName(""); setNewUrl(""); setAddOpen(false);
  }

  async function handleSync() {
    setSyncResults(null);
    const results = await syncFeeds.mutateAsync(feeds);
    setSyncResults(results);
  }

  const totalImported = syncResults?.reduce((s, r) => s + r.imported, 0) ?? 0;
  const totalUpdated  = syncResults?.reduce((s, r) => s + r.updated, 0) ?? 0;
  const anyErrors     = syncResults?.some((r) => r.errors.length > 0) ?? false;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Einstellungen</h2>

      {/* ── Preise ── */}
      <button
        onClick={() => navigate("/settings/preise")}
        className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-200 p-5 hover:bg-gray-50 transition text-left"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
            <Euro className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Preise verwalten</p>
            <p className="text-xs text-gray-500">Saisonpreise, Servicegebühren und Hundegebühr je Wohnungsgruppe</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </button>

      {/* ── Konto ── */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Konto</h3>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-500">Email-Adresse</p>
              <p className="text-sm font-medium text-gray-900">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Benutzer-ID</p>
              <p className="text-sm font-mono text-gray-600">{user?.uid}</p>
            </div>
          </div>
        </div>
        <div className="p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">App-Version</h3>
          <p className="text-sm text-gray-500">Traumferienwohnung Manager v2.0 · Vite + React + Firebase</p>
        </div>
      </div>

      {/* ── Datensicherung ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Datensicherung</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Lädt alle Buchungen (inkl. Änderungshistorie) und iCal-Feeds als eine JSON-Datei herunter.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-60 flex-shrink-0"
          >
            <Download className="w-4 h-4" />
            {exporting ? "Exportiert…" : "Alle Daten exportieren"}
          </button>
        </div>
        {exportError && (
          <p className="text-xs text-red-600 mt-3">{exportError}</p>
        )}
      </div>

      {/* ── iCal-Synchronisierung ── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Kalender-Synchronisierung (iCal)</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Buchungen von externen Portalen automatisch importieren. Die iCal-URL findest du in den
              Einstellungen des jeweiligen Portals.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {feeds.length > 0 && (
              <button
                onClick={handleSync}
                disabled={syncFeeds.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${syncFeeds.isPending ? "animate-spin" : ""}`} />
                {syncFeeds.isPending ? "Synchronisiert…" : "Jetzt synchronisieren"}
              </button>
            )}
            <button
              onClick={() => setAddOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
            >
              <Plus className="w-4 h-4" /> Feed hinzufügen
            </button>
          </div>
        </div>

        {/* Sync result banner */}
        {syncResults && (
          <div className={`mx-5 mt-4 flex items-start gap-3 rounded-lg px-4 py-3 text-sm
            ${anyErrors ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-emerald-50 border border-emerald-200 text-emerald-800"}`}>
            {anyErrors
              ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              : <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            }
            <div>
              <p className="font-semibold">
                {anyErrors ? "Sync mit Fehlern abgeschlossen" : "Sync erfolgreich"}
              </p>
              <p>{totalImported} neue · {totalUpdated} aktualisiert</p>
              {syncResults.flatMap((r) => r.errors).map((e, i) => (
                <p key={i} className="text-xs mt-1 font-mono">{e}</p>
              ))}
            </div>
          </div>
        )}

        {/* Add form */}
        {addOpen && (
          <div className="mx-5 mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Neuer iCal-Feed</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Plattform</label>
                <input
                  type="text"
                  list="channel-presets"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="z.B. Ferienwohnungen.de"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="channel-presets">
                  {CHANNEL_PRESETS.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Wohnung</label>
                <select
                  value={newProp}
                  onChange={(e) => setNewProp(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {["Upstalsboom", "Haus Anne"].map((house) => (
                    <optgroup key={house} label={house}>
                      {properties.filter((p) => p.house === house).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">iCal-URL</label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://www.ferienwohnungen.de/objekt/…/ical.ics"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Die iCal-URL findest du in den Einstellungen des Portals unter „Kalender exportieren" oder „iCal-Link".
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={!newName.trim() || !newUrl.trim() || createFeed.isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
              >
                {createFeed.isPending ? "Speichert…" : "Hinzufügen"}
              </button>
              <button
                onClick={() => setAddOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* Feed list */}
        <div className="divide-y divide-gray-100 mt-2">
          {feeds.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              <Link className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>Noch keine iCal-Feeds hinterlegt.</p>
              <p className="text-xs mt-1">Klicke auf „Feed hinzufügen" um zu starten.</p>
            </div>
          ) : (
            feeds.map((feed) => {
              const prop = properties.find((p) => p.id === feed.property_id);
              return (
                <div key={feed.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{feed.name}</span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {prop?.name ?? feed.property_id}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-mono truncate mt-0.5">{feed.url}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Letzter Sync: {fmtSync(feed.last_synced)}</p>
                  </div>
                  <button
                    onClick={() => confirm(`Feed „${feed.name}" wirklich löschen?`) && deleteFeed.mutate(feed.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
