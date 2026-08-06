import { ref, uploadBytes, getDownloadURL, listAll } from "firebase/storage";
import { storage } from "@/lib/firebase";

export interface StoredConfirmation {
  url: string;
  timestamp: number;
}

// Jede Version wird eigenständig abgelegt (Zeitstempel im Dateinamen) — nichts wird
// überschrieben oder gelöscht. "system" = automatisch erzeugte Bestätigung,
// "own" = selbst erstellte/hochgeladene PDF, "signed" = unterschrieben zurückerhalten.
async function uploadVersioned(path: string, bytes: Uint8Array): Promise<StoredConfirmation> {
  const timestamp = Date.now();
  const storageRef = ref(storage, `${path}/${timestamp}.pdf`);
  await uploadBytes(storageRef, bytes, { contentType: "application/pdf" });
  const url = await getDownloadURL(storageRef);
  return { url, timestamp };
}

async function getLatestVersioned(path: string): Promise<StoredConfirmation | null> {
  const dirRef = ref(storage, path);
  const result = await listAll(dirRef);
  if (result.items.length === 0) return null;
  const latest = result.items.reduce((a, b) => (parseInt(b.name, 10) > parseInt(a.name, 10) ? b : a));
  const url = await getDownloadURL(latest);
  return { url, timestamp: parseInt(latest.name, 10) || 0 };
}

export async function uploadConfirmationPdf(bookingId: string, bytes: Uint8Array): Promise<StoredConfirmation> {
  return uploadVersioned(`confirmations/${bookingId}`, bytes);
}

// Für die Anzeige "zuletzt gespeichert am …" beim (Wieder-)Öffnen einer Buchung.
export async function getLatestConfirmation(bookingId: string): Promise<StoredConfirmation | null> {
  return getLatestVersioned(`confirmations/${bookingId}`);
}

export async function uploadOwnConfirmation(bookingId: string, bytes: Uint8Array): Promise<StoredConfirmation> {
  return uploadVersioned(`confirmations/${bookingId}/own`, bytes);
}

export async function getLatestOwnConfirmation(bookingId: string): Promise<StoredConfirmation | null> {
  return getLatestVersioned(`confirmations/${bookingId}/own`);
}

export async function uploadSignedConfirmation(bookingId: string, bytes: Uint8Array): Promise<StoredConfirmation> {
  return uploadVersioned(`confirmations/${bookingId}/signed`, bytes);
}

export async function getLatestSignedConfirmation(bookingId: string): Promise<StoredConfirmation | null> {
  return getLatestVersioned(`confirmations/${bookingId}/signed`);
}
