import { ref, uploadBytes, getDownloadURL, listAll } from "firebase/storage";
import { storage } from "@/lib/firebase";

export interface StoredConfirmation {
  url: string;
  timestamp: number;
}

// Jede erzeugte Bestätigung wird als neue, eigenständige Version abgelegt
// (Zeitstempel im Dateinamen) — nichts wird überschrieben oder gelöscht.
export async function uploadConfirmationPdf(bookingId: string, bytes: Uint8Array): Promise<StoredConfirmation> {
  const timestamp = Date.now();
  const storageRef = ref(storage, `confirmations/${bookingId}/${timestamp}.pdf`);
  await uploadBytes(storageRef, bytes, { contentType: "application/pdf" });
  const url = await getDownloadURL(storageRef);
  return { url, timestamp };
}

// Für die Anzeige "zuletzt gespeichert am …" beim (Wieder-)Öffnen einer Buchung.
export async function getLatestConfirmation(bookingId: string): Promise<StoredConfirmation | null> {
  const dirRef = ref(storage, `confirmations/${bookingId}`);
  const result = await listAll(dirRef);
  if (result.items.length === 0) return null;
  const latest = result.items.reduce((a, b) => (parseInt(b.name, 10) > parseInt(a.name, 10) ? b : a));
  const url = await getDownloadURL(latest);
  return { url, timestamp: parseInt(latest.name, 10) || 0 };
}
