/**
 * SEED PAGE — nur für Testzwecke, danach Route wieder entfernen.
 * Erstellt realistische Buchungen für alle 11 Wohnungen
 * von Juni 2025 bis Juni 2027 (1 Jahr Vergangenheit + 1 Jahr Zukunft).
 */

import { useState } from "react";
import { doc, setDoc, updateDoc, deleteField, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { priceGroupOf } from "@/lib/priceGroups";
import { calculatePrice } from "@/lib/pricing";
import { PRICE_SEED_DATA } from "@/lib/priceSeedData";
import type { PriceGroupSettings, PriceGroupId, PriceBreakdown } from "@/types";

// ── Konfiguration ──────────────────────────────────────────────────────────────

const PROPERTY_IDS = [
  "ups-2","ups-3","ups-4","ups-5","ups-6","ups-7",
  "anne-1","anne-2","anne-3","anne-4","anne-5",
];

const CHANNELS = [
  { name: "Ferienwohnungen.de", weight: 35 },
  { name: "Baltrumdirekt.de",   weight: 30 },
  { name: "Airbnb",             weight: 15 },
  { name: "Booking.com",        weight: 10 },
  { name: "Manuell",            weight: 10 },
];

const FIRST_NAMES = [
  "Thomas","Sabine","Klaus","Monika","Stefan","Andrea","Michael","Petra",
  "Christian","Susanne","Martin","Claudia","Andreas","Nicole","Oliver",
  "Julia","Peter","Maria","Johannes","Anna","Lukas","Laura","Felix","Sarah",
  "Jan","Lea","Tobias","Lisa","Markus","Katharina","Sebastian","Hannah",
  "Daniel","Melanie","Patrick","Stefanie","Florian","Tanja","Alexander","Nina",
];

const LAST_NAMES = [
  "Müller","Schmidt","Schneider","Fischer","Weber","Meyer","Wagner","Becker",
  "Schulz","Hoffmann","Schäfer","Koch","Bauer","Richter","Klein","Wolf",
  "Schröder","Neumann","Zimmermann","Braun","Krüger","Hartmann","Lange",
  "Schmitt","Werner","Schmitz","Krause","Meier","Lehmann","Schmid",
];

const NOTES_POOL = [
  "Bitte Bettwäsche bereitstellen.",
  "Anreise nach 18 Uhr geplant.",
  "Kinderbett benötigt.",
  "Allergiker – kein Daunenbettzeug.",
  "Wir bringen unseren eigenen Hund mit.",
  "Erstkunde – Willkommenspaket gewünscht.",
  "",  "","","","","","", // mehr leere Notes damit realistisch
];

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

/** Deterministischer Pseudo-Zufall aus einem Seed (kein echtes Crypto) */
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

let _counter = 0;
function rnd(): number {
  return seededRand(++_counter * 7919);
}
function rndInt(min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function pickWeighted(items: { name: string; weight: number }[]): string {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rnd() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.name;
  }
  return items[items.length - 1].name;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function iso(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Monatliche Buchungswahrscheinlichkeit für die Nordseeküste */
function occupancyRate(month: number /* 0-indexed */): number {
  // Jan Feb Mar Apr Mai Jun Jul Aug Sep Okt Nov Dez
  return [0.10, 0.12, 0.20, 0.40, 0.55, 0.75, 0.95, 0.92, 0.55, 0.30, 0.12, 0.20][month];
}

/** Basis-Preis pro Nacht je Wohnung — auch als Fallback für Daten außerhalb der Saison-Zeiträume */
function baseNightRate(propId: string): number {
  return propId.startsWith("ups") ? rndInt(75, 120) : rndInt(90, 150);
}

// Stabiler Hash (0-99), damit "Freunde-Rabatt"-Zuordnung bei erneutem Lauf
// gegen dieselbe Buchungs-ID reproduzierbar bleibt statt jedes Mal neu zu würfeln.
function hashPercent(id: string, salt = ""): number {
  let h = 0;
  const s = id + salt;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100;
}

// ── Preisberechnung ────────────────────────────────────────────────────────────

async function fetchLivePriceSettings(): Promise<Record<PriceGroupId, PriceGroupSettings>> {
  const snap = await getDocs(collection(db, "priceSettings"));
  const map = {} as Record<PriceGroupId, PriceGroupSettings>;
  snap.docs.forEach((d) => { map[d.id as PriceGroupId] = d.data() as PriceGroupSettings; });
  for (const fallback of PRICE_SEED_DATA) {
    if (!map[fallback.id]) map[fallback.id] = fallback;
  }
  return map;
}

// Nächte außerhalb der hinterlegten Saison-Zeiträume (z.B. 2025, vor Beginn der
// echten Preislisten) bekommen einen plausiblen Fallback-Satz statt 0 €, damit
// auch ältere Buchungen sinnvoll in Übernachtungen/Reinigung/Hund aufgehen.
function buildAutoPricing(
  checkIn: string, checkOut: string, adults: number, children: number, dogCount: number,
  settings: PriceGroupSettings, fallbackNightly: number,
): { price: number; breakdown: PriceBreakdown } {
  const result = calculatePrice(checkIn, checkOut, adults, children, dogCount, settings);
  const nights = result.nights.map((n) =>
    n.seasonLabel === "–" ? { ...n, price: fallbackNightly, seasonLabel: "Altbestand" } : n
  );
  const subtotal = nights.reduce((s, n) => s + n.price, 0);
  const extraFeesTotal = result.extraFees.reduce((s, f) => s + f.amount, 0);
  const total = subtotal + result.cleaningFee + extraFeesTotal + result.dogFee;
  return {
    price: total,
    breakdown: { nights, cleaningFee: result.cleaningFee, extraFees: result.extraFees, dogFee: result.dogFee },
  };
}

// ── Buchungs-Generator ─────────────────────────────────────────────────────────

interface SeedBooking {
  id: string;
  property_id: string;
  guest_name: string;
  phone: string;
  email: string;
  check_in: string;
  check_out: string;
  ferry_time: string;
  is_paid: boolean;
  adults: number;
  children: number;
  dogCount: number;
  price: number;
  priceIsManual: boolean;
  priceBreakdown?: PriceBreakdown;
  channel: string;
  ical_uid: string;
  notes: string;
  source: "manual" | "ical";
}

function generateBookings(userId: string, settingsMap: Record<PriceGroupId, PriceGroupSettings>): SeedBooking[] {
  _counter = 0; // reset for deterministic output
  const today = new Date(); today.setHours(0,0,0,0);
  const startDate = addDays(today, -365);
  const endDate   = addDays(today, +365);

  const bookings: SeedBooking[] = [];

  for (const propId of PROPERTY_IDS) {
    // Iterate in 7-day windows (Sa-to-Sa typical island booking rhythm)
    // But also allow 3-4 night shoulder-season stays
    let cursor = new Date(startDate);
    // Align to next Saturday
    while (cursor.getDay() !== 6) cursor = addDays(cursor, 1);

    while (cursor < endDate) {
      const month = cursor.getMonth();
      const occ   = occupancyRate(month);

      if (rnd() < occ) {
        // Decide stay length: high season = 7N, shoulder = 3-7N, off = 2-5N
        let nights: number;
        if (occ >= 0.75)       nights = pick([7, 7, 7, 14]);
        else if (occ >= 0.40)  nights = rndInt(3, 7);
        else                   nights = rndInt(2, 5);

        const checkIn  = new Date(cursor);
        const checkOut = addDays(checkIn, nights);

        if (checkOut > endDate) { cursor = addDays(cursor, 7); continue; }

        const guestName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
        const adults    = rndInt(1, 4);
        const children  = rnd() < 0.3 ? rndInt(1, 2) : 0;
        const hasDog    = rnd() < 0.25;
        const dogCount  = hasDog ? 1 : 0;
        const channel   = pickWeighted(CHANNELS);
        const checkInIso  = iso(checkIn);
        const checkOutIso = iso(checkOut);

        // Nur eine kleine Minderheit bekommt einen manuellen (z.B. rabattierten
        // Freundes-)Preis — der Großteil soll automatisch berechnet werden und
        // damit in Übernachtungen/Reinigung/Hund/Wäsche statt in Manuell zählen.
        const groupId       = priceGroupOf(propId);
        const groupSettings = groupId ? settingsMap[groupId] : undefined;
        const isManual      = rnd() < 0.08 || !groupSettings;
        const nightlyFallback = baseNightRate(propId);

        let price: number;
        let priceBreakdown: PriceBreakdown | undefined;
        if (groupSettings && !isManual) {
          const auto = buildAutoPricing(checkInIso, checkOutIso, adults, children, dogCount, groupSettings, nightlyFallback);
          price = auto.price;
          priceBreakdown = auto.breakdown;
        } else {
          const base = groupSettings
            ? buildAutoPricing(checkInIso, checkOutIso, adults, children, dogCount, groupSettings, nightlyFallback).price
            : nightlyFallback * nights;
          // 15–40 % Freundes-Rabatt auf den regulären Preis, auf 5 € gerundet
          price = Math.round((base * rndInt(60, 85)) / 100 / 5) * 5;
          priceBreakdown = undefined;
        }

        // Older bookings more likely paid; future maybe not
        const daysDiff  = Math.round((checkIn.getTime() - today.getTime()) / 86400000);
        const isPaid    = daysDiff < 30 ? rnd() < 0.85 : rnd() < 0.55;
        const note      = pick(NOTES_POOL);
        const ferryTime = rnd() < 0.4 ? `${rndInt(8,18)}:${rnd()<0.5?"00":"30"}` : "";

        const id = `seed_${propId}_${checkInIso.replace(/-/g,"")}`;
        bookings.push({
          id,
          property_id: propId,
          guest_name: guestName,
          phone: `+49 ${rndInt(151,179)} ${rndInt(1000000,9999999)}`,
          email: rnd() < 0.7 ? `${guestName.toLowerCase().replace(/\s+/g, ".")}@example.de` : "",
          check_in: checkInIso,
          check_out: checkOutIso,
          ferry_time: ferryTime,
          is_paid: isPaid,
          adults,
          children,
          dogCount,
          price,
          priceIsManual: isManual,
          priceBreakdown,
          channel,
          ical_uid: "",
          notes: note,
          source: channel === "Manuell" ? "manual" : "ical",
          // userId added below
          ...(({ userId: _u, ...rest }) => rest)({ userId }),
        });
      }

      // Advance cursor: high season 7 days, low season allow smaller gaps
      cursor = addDays(cursor, occ >= 0.75 ? 7 : rndInt(3, 7));
    }
  }

  // Attach userId
  return bookings.map((b) => ({ ...b, userId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })) as SeedBooking[];
}

// ── Komponente ─────────────────────────────────────────────────────────────────

export function Seed() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"idle"|"checking"|"seeding"|"done"|"error">("idle");
  const [log, setLog] = useState<string[]>([]);
  const [bookingCount, setBookingCount] = useState(0);

  const [priceStatus, setPriceStatus] = useState<"idle"|"running"|"done"|"error">("idle");
  const [priceLog, setPriceLog] = useState<string[]>([]);

  function addLog(msg: string) {
    setLog((l) => [...l, msg]);
  }
  function addPriceLog(msg: string) {
    setPriceLog((l) => [...l, msg]);
  }

  async function handleSeed() {
    if (!user) return;
    setStatus("checking");
    setLog([]);

    try {
      // Check how many seed bookings already exist
      const q = query(collection(db, "bookings"), where("userId", "==", user.uid));
      const snap = await getDocs(q);
      const existing = snap.docs.filter((d) => d.id.startsWith("seed_")).length;
      addLog(`✓ Bestehende Seed-Buchungen: ${existing}`);

      if (existing > 0) {
        addLog("⚠️ Seed-Buchungen existieren bereits. Bitte zuerst löschen oder fortfahren.");
      }

      addLog("→ Lade Preiseinstellungen…");
      const settingsMap = await fetchLivePriceSettings();

      setStatus("seeding");
      const bookings = generateBookings(user.uid, settingsMap);
      setBookingCount(bookings.length);
      addLog(`→ ${bookings.length} Buchungen werden geschrieben…`);

      let written = 0;
      const BATCH = 20;
      for (let i = 0; i < bookings.length; i += BATCH) {
        const chunk = bookings.slice(i, i + BATCH);
        await Promise.all(
          chunk.map((b) => {
            const { id, ...data } = b;
            return setDoc(doc(db, "bookings", id), data);
          })
        );
        written += chunk.length;
        addLog(`  ${written}/${bookings.length} geschrieben…`);
      }

      addLog(`✅ Fertig! ${bookings.length} Buchungen angelegt.`);
      setStatus("done");
    } catch (err) {
      addLog(`❌ Fehler: ${err}`);
      setStatus("error");
    }
  }

  // Berechnet für bereits bestehende Seed-Buchungen die Preise neu: der Großteil
  // bekommt eine echte Aufschlüsselung (zählt in Übernachtungen/Reinigung/Hund/
  // Wäsche), nur ~8 % bleiben/werden "Manuell" (z.B. Freundes-Rabatt).
  async function handleRecalculatePrices() {
    setPriceStatus("running");
    setPriceLog([]);

    try {
      addPriceLog("→ Lade bestehende Buchungen…");
      const snap = await getDocs(collection(db, "bookings"));
      const seedDocs = snap.docs.filter((d) => d.id.startsWith("seed_"));
      addPriceLog(`✓ ${seedDocs.length} Seed-Buchungen gefunden.`);

      addPriceLog("→ Lade Preiseinstellungen…");
      const settingsMap = await fetchLivePriceSettings();

      let autoCount = 0, manualCount = 0, skipped = 0;
      const updates: { id: string; data: Record<string, unknown> }[] = [];

      for (const docSnap of seedDocs) {
        const b = docSnap.data() as Record<string, unknown>;
        const propId = String(b.property_id ?? "");
        const groupId = priceGroupOf(propId);
        const groupSettings = groupId ? settingsMap[groupId] : undefined;
        const checkIn = String(b.check_in ?? "");
        const checkOut = String(b.check_out ?? "");
        if (!groupSettings || !checkIn || !checkOut) { skipped++; continue; }

        const adults   = Number(b.adults ?? 1);
        const children  = Number(b.children ?? 0);
        const dogCount = typeof b.dogCount === "number" ? b.dogCount : (b.dog || b.hasDog ? 1 : 0);
        const totalNights = Math.max(1, Math.round(
          (new Date(checkOut + "T00:00:00").getTime() - new Date(checkIn + "T00:00:00").getTime()) / 86400000
        ));
        const currentPrice = Number(b.price ?? 0);
        const fallbackNightly = Math.max(1, Math.round(currentPrice / totalNights));

        const isManual = hashPercent(docSnap.id) < 8;
        if (isManual) {
          const auto = buildAutoPricing(checkIn, checkOut, adults, children, dogCount, groupSettings, fallbackNightly);
          const discountPct = 60 + (hashPercent(docSnap.id, "discount") % 25); // 60–84 %
          const price = Math.round((auto.price * discountPct) / 100 / 5) * 5;
          updates.push({ id: docSnap.id, data: { price, priceIsManual: true, priceBreakdown: deleteField() } });
          manualCount++;
        } else {
          const auto = buildAutoPricing(checkIn, checkOut, adults, children, dogCount, groupSettings, fallbackNightly);
          updates.push({ id: docSnap.id, data: { price: auto.price, priceIsManual: false, priceBreakdown: auto.breakdown } });
          autoCount++;
        }
      }

      addPriceLog(`→ Automatisch (Übernachtungen/Reinigung/Hund/Wäsche): ${autoCount}`);
      addPriceLog(`→ Manuell (Freundes-Rabatt): ${manualCount}`);
      if (skipped > 0) addPriceLog(`⚠️ Übersprungen (keine Preisgruppe/Daten): ${skipped}`);

      let written = 0;
      const BATCH = 20;
      for (let i = 0; i < updates.length; i += BATCH) {
        const chunk = updates.slice(i, i + BATCH);
        await Promise.all(chunk.map((u) => updateDoc(doc(db, "bookings", u.id), u.data)));
        written += chunk.length;
        addPriceLog(`  ${written}/${updates.length} aktualisiert…`);
      }

      addPriceLog(`✅ Fertig! ${updates.length} Buchungen aktualisiert.`);
      setPriceStatus("done");
    } catch (err) {
      addPriceLog(`❌ Fehler: ${err}`);
      setPriceStatus("error");
    }
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Testdaten anlegen</h2>
        <p className="text-sm text-gray-500 mt-1">
          Erstellt realistische Buchungen für alle 11 Wohnungen — 1 Jahr zurück und 1 Jahr voraus.
          Jede Wohnung bekommt saisongerechte Belegung (Sommer ~90 %, Winter ~10 %).
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Hinweis:</strong> Diese Seite nur einmal ausführen. Die Buchungen werden mit IDs wie
        <code className="mx-1 bg-amber-100 px-1 rounded font-mono text-xs">seed_ups-2_20250615</code>
        gespeichert und können anschliessend einzeln oder per Firestore-Konsole gelöscht werden.
      </div>

      <button
        onClick={handleSeed}
        disabled={status === "seeding" || status === "checking"}
        className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
      >
        {status === "seeding" || status === "checking"
          ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Lädt…</>
          : status === "done"
            ? `✅ ${bookingCount} Buchungen angelegt`
            : "Testdaten jetzt anlegen"
        }
      </button>

      {log.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 text-xs font-mono text-green-400 space-y-0.5 max-h-72 overflow-y-auto">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-base font-bold text-gray-900">Preise der Seed-Buchungen neu berechnen</h3>
        <p className="text-sm text-gray-500 mt-1">
          Berechnet für alle bestehenden Seed-Buchungen den Preis über die echten Saisonpreise
          (Übernachtungen/Reinigung/Hund/Wäsche) neu. Nur ~8 % bleiben "Manuell" (Freundes-Rabatt).
        </p>
        <button
          onClick={handleRecalculatePrices}
          disabled={priceStatus === "running"}
          className="mt-3 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2"
        >
          {priceStatus === "running"
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Lädt…</>
            : priceStatus === "done"
              ? "✅ Preise neu berechnet"
              : "Preise jetzt neu berechnen"
          }
        </button>

        {priceLog.length > 0 && (
          <div className="mt-3 bg-gray-900 rounded-xl p-4 text-xs font-mono text-green-400 space-y-0.5 max-h-72 overflow-y-auto">
            {priceLog.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
