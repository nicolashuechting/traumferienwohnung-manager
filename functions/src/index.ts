import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { v1 as firestoreV1 } from "@google-cloud/firestore";

admin.initializeApp();

const REGION = "europe-west3"; // wie processQueue
const BACKUP_BUCKET = "traumferienwohnung-manager-backups";

const adminClient = new firestoreV1.FirestoreAdminClient();

// Heutiges Datum in Europe/Berlin (nicht UTC) — die Cloud-Funktion läuft zwar
// bereits mit timeZone "Europe/Berlin" getriggert, aber Date() im Node-Prozess
// selbst liefert UTC; ohne diese Umrechnung würde der Ordnername kurz nach
// Mitternacht (MEZ/MESZ) noch das Vortagesdatum tragen.
function todayInBerlin(): { iso: string; month: number; day: number } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

// Stößt einen Firestore-Export (alle Collections) in den angegebenen GCS-Pfad an.
// exportDocuments liefert nur die Operation zurück (asynchroner Hintergrundjob bei
// Google) — die Funktion selbst muss nicht auf den Abschluss warten.
async function exportFirestoreTo(outputUriPrefix: string): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  if (!projectId) throw new Error("Projekt-ID konnte nicht ermittelt werden (GCLOUD_PROJECT fehlt).");
  const databaseName = adminClient.databasePath(projectId, "(default)");

  const [operation] = await adminClient.exportDocuments({
    name: databaseName,
    outputUriPrefix,
    collectionIds: [], // leer = alle Collections
  });

  logger.info(`Firestore-Export gestartet nach ${outputUriPrefix}`, { operationName: operation.name });
}

// Tägliches Firestore-Backup, nachts um 03:00 (Europe/Berlin).
// Ablage: gs://traumferienwohnung-manager-backups/daily/YYYY-MM-DD/
// Am 1. Januar zusätzlich ein dauerhafter Jahres-Export nach yearly/YYYY/, damit
// eine eigene GCS-Lifecycle-Regel auf daily/ (Aufräumen alter Tages-Backups) die
// Jahres-Backups nicht mit löscht (separates Präfix, davon unberührt).
export const dailyFirestoreBackup = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: "Europe/Berlin",
    region: REGION,
    retryCount: 3,
  },
  async () => {
    const { iso, month, day } = todayInBerlin();

    await exportFirestoreTo(`gs://${BACKUP_BUCKET}/daily/${iso}`);

    if (month === 1 && day === 1) {
      const year = iso.slice(0, 4);
      await exportFirestoreTo(`gs://${BACKUP_BUCKET}/yearly/${year}`);
    }
  },
);
