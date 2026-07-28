/**
 * SEED PAGE — nur für Testzwecke, danach Route wieder entfernen.
 * Erstellt realistische Buchungen für alle 11 Wohnungen
 * von Juni 2025 bis Juni 2027 (1 Jahr Vergangenheit + 1 Jahr Zukunft).
 */

import { useState } from "react";
import { doc, setDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

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

/** Basis-Preis pro Nacht je Wohnung */
function baseNightRate(propId: string): number {
  return propId.startsWith("ups") ? rndInt(75, 120) : rndInt(90, 150);
}

// ── Buchungs-Generator ─────────────────────────────────────────────────────────

interface SeedBooking {
  id: string;
  property_id: string;
  guest_name: string;
  contact_info: string;
  check_in: string;
  check_out: string;
  ferry_time: string;
  is_paid: boolean;
  adults: number;
  children: number;
  dogCount: number;
  price: number;
  channel: string;
  ical_uid: string;
  notes: string;
  source: "manual" | "ical";
}

function generateBookings(userId: string): SeedBooking[] {
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
        const channel   = pickWeighted(CHANNELS);
        const nightly   = baseNightRate(propId);
        const price     = nightly * nights;
        // Older bookings more likely paid; future maybe not
        const daysDiff  = Math.round((checkIn.getTime() - today.getTime()) / 86400000);
        const isPaid    = daysDiff < 30 ? rnd() < 0.85 : rnd() < 0.55;
        const note      = pick(NOTES_POOL);
        const ferryTime = rnd() < 0.4 ? `${rndInt(8,18)}:${rnd()<0.5?"00":"30"}` : "";

        const id = `seed_${propId}_${iso(checkIn).replace(/-/g,"")}`;
        bookings.push({
          id,
          property_id: propId,
          guest_name: guestName,
          contact_info: `+49 ${rndInt(151,179)} ${rndInt(1000000,9999999)}`,
          check_in: iso(checkIn),
          check_out: iso(checkOut),
          ferry_time: ferryTime,
          is_paid: isPaid,
          adults,
          children,
          dogCount: hasDog ? 1 : 0,
          price,
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

  function addLog(msg: string) {
    setLog((l) => [...l, msg]);
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

      setStatus("seeding");
      const bookings = generateBookings(user.uid);
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
    </div>
  );
}
