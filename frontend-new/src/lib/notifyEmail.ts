import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { properties } from "@/lib/properties";
import { fieldLabel, formatFieldValue } from "@/lib/bookingHistory";
import type { BookingFormData, FieldChange, HouseSettings } from "@/types";

// Firebase Extension "Trigger Email" ist je Haus separat installiert, mit eigener
// Firestore-Collection als Mail-Warteschlange (SMTP-Zugangsdaten pro Haus-Postfach).
const MAIL_COLLECTION: Record<string, string> = {
  "Haus Anne": "mail_anne",
  "Upstalsboom": "mail_upstalsboom",
};

function propName(id: string): string {
  return properties.find((p) => p.id === id)?.name ?? id;
}

function mailCollectionFor(propertyId: string): string {
  const house = properties.find((p) => p.id === propertyId)?.house ?? "Haus Anne";
  return MAIL_COLLECTION[house];
}

function fmtDate(iso: string): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

const KIND_LABEL: Record<"create" | "update" | "cancel", string> = {
  create: "Neue Buchung",
  update: "Änderung",
  cancel: "Stornierung",
};

export function buildEmailContent(
  booking: BookingFormData,
  changes: FieldChange[],
  kind: "create" | "update" | "cancel",
): { subject: string; text: string } {
  const subject = `Achtung ${KIND_LABEL[kind]} – ${propName(booking.property_id)}`;

  const lines: string[] = [];
  lines.push(`Buchungsnummer: ${booking.booking_number || "–"}`);
  lines.push(`Wohnung: ${propName(booking.property_id)}`);
  lines.push("");

  if (kind === "update" && changes.length > 0) {
    lines.push("Änderungen:");
    for (const c of changes) {
      lines.push(`- ${fieldLabel(c.field)}: ${formatFieldValue(c.field, c.from)} → ${formatFieldValue(c.field, c.to)}`);
    }
    lines.push("");
  }

  lines.push(`Anreise: ${fmtDate(booking.check_in)}`);
  lines.push(`Abreise: ${fmtDate(booking.check_out)}`);
  lines.push("");
  lines.push(`Gast: ${booking.guest_name || "–"}`);
  lines.push(`Telefon: ${booking.phone || "–"}`);
  lines.push(`E-Mail: ${booking.email || "–"}`);

  return { subject, text: lines.join("\n") };
}

export async function sendChangeNotification(
  booking: BookingFormData,
  house: HouseSettings,
  changes: FieldChange[],
  kind: "create" | "update" | "cancel",
): Promise<void> {
  const { subject, text } = buildEmailContent(booking, changes, kind);
  const collectionName = mailCollectionFor(booking.property_id);
  await addDoc(collection(db, collectionName), {
    to: [house.notifyEmail],
    from: house.contactEmail,
    message: { subject, text },
  });
}
