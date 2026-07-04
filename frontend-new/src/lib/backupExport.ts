import { collection, getDocs, query, where } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

// Alle Firestore-Collections dieses Projekts: "bookings" (mit history-Subcollection
// pro Buchung) und "icalFeeds". Es gibt keine eigene "guests"-Collection — Gäste
// werden in der App nur virtuell aus den Buchungen aggregiert, brauchen also keinen
// eigenen Export-Schritt.
export interface BackupData {
  exportedAt: string;
  userId: string;
  collections: {
    bookings: Array<Record<string, unknown>>;
    icalFeeds: Array<Record<string, unknown>>;
  };
}

export async function buildBackup(): Promise<BackupData> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Nicht angemeldet.");

  let bookings: Array<Record<string, unknown>>;
  try {
    const bookingsSnap = await getDocs(query(collection(db, "bookings"), where("userId", "==", uid)));
    bookings = await Promise.all(
      bookingsSnap.docs.map(async (d) => {
        const historySnap = await getDocs(collection(db, "bookings", d.id, "history"));
        return {
          id: d.id,
          ...d.data(),
          history: historySnap.docs.map((h) => ({ id: h.id, ...h.data() })),
        };
      }),
    );
  } catch (e) {
    throw new Error(`Fehler beim Lesen der Buchungen: ${(e as Error).message}`);
  }

  let icalFeeds: Array<Record<string, unknown>>;
  try {
    const icalSnap = await getDocs(query(collection(db, "icalFeeds"), where("userId", "==", uid)));
    icalFeeds = icalSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    throw new Error(`Fehler beim Lesen der iCal-Feeds: ${(e as Error).message}`);
  }

  return {
    exportedAt: new Date().toISOString(),
    userId: uid,
    collections: { bookings, icalFeeds },
  };
}

// Lokales Datum für den Dateinamen — bewusst kein toISOString() (würde in jeder
// Zeitzone mit positivem UTC-Offset, z.B. Deutschland, einen Tag zurückrutschen).
function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function downloadBackup(): Promise<void> {
  const data = await buildBackup();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup-${todayLocalISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
