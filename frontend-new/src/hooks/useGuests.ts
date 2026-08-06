import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, doc, setDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Guest, BookingFormData } from "@/types";

// Bewusst kein userId-Filter — Gast-Stammdaten sind wie Buchungen betriebsweit geteilt.
async function fetchGuests(): Promise<Guest[]> {
  const snap = await getDocs(collection(db, "guests"));
  return snap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      email: d.id,
      name: String(raw.name ?? ""),
      phone: String(raw.phone ?? ""),
      street: String(raw.street ?? ""),
      houseNumber: String(raw.houseNumber ?? ""),
      zip: String(raw.zip ?? ""),
      city: String(raw.city ?? ""),
      country: String(raw.country ?? ""),
      personNotes: String(raw.personNotes ?? ""),
      marketingConsent: Boolean(raw.marketingConsent),
      updated_at: String(raw.updated_at ?? ""),
    };
  });
}

export function useGuests() {
  return useQuery({ queryKey: ["guests"], queryFn: fetchGuests });
}

// Best-effort: wird nach jedem Speichern einer Buchung mit E-Mail aufgerufen, damit
// Adresse/Kontaktdaten für künftige Buchungen desselben Gasts wiedererkannt werden.
// Ein Fehler hier darf das eigentliche Speichern der Buchung nicht beeinflussen.
export async function upsertGuestFromBooking(data: Partial<BookingFormData>): Promise<void> {
  const email = (data.email ?? "").trim().toLowerCase();
  if (!email) return;
  try {
    await setDoc(
      doc(db, "guests", email),
      {
        name: data.guest_name ?? "",
        phone: data.phone ?? "",
        street: data.street ?? "",
        houseNumber: data.houseNumber ?? "",
        zip: data.zip ?? "",
        city: data.city ?? "",
        country: data.country ?? "",
        updated_at: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn("Gast-Stammdaten konnten nicht gespeichert werden:", e);
  }
}

// Personennotizen/Werbemail-Einwilligung sind rein personenbezogen (nicht an eine
// einzelne Buchung gebunden) — werden separat aus dem Buchungsformular heraus gepflegt.
export async function upsertGuestFields(
  email: string,
  fields: { personNotes: string; marketingConsent: boolean },
): Promise<void> {
  const key = email.trim().toLowerCase();
  if (!key) return;
  try {
    await setDoc(
      doc(db, "guests", key),
      { ...fields, updated_at: serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    console.warn("Gast-Stammdaten konnten nicht gespeichert werden:", e);
  }
}

// Manuelle Bearbeitung über die Gäste-Übersicht: aktualisiert den Gast-Datensatz UND
// spiegelt Name/Telefon/E-Mail/Adresse in ALLE bestehenden Buchungen dieser Person
// zurück (auch alte/abgeschlossene) — im Gegensatz zu upsertGuestFromBooking/
// upsertGuestFields läuft das nicht best-effort, Fehler sollen den Aufrufer erreichen.
export interface GuestEditFields {
  name: string;
  email: string;
  phone: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  country: string;
  personNotes: string;
  marketingConsent: boolean;
}

export async function updateGuestAndBookings(
  oldEmail: string,
  fields: GuestEditFields,
  bookingIds: string[],
): Promise<void> {
  const newEmail = fields.email.trim().toLowerCase();
  if (!newEmail) throw new Error("E-Mail darf nicht leer sein.");
  const oldKey = oldEmail.trim().toLowerCase();

  const batch = writeBatch(db);
  batch.set(
    doc(db, "guests", newEmail),
    {
      name: fields.name,
      phone: fields.phone,
      street: fields.street,
      houseNumber: fields.houseNumber,
      zip: fields.zip,
      city: fields.city,
      country: fields.country,
      personNotes: fields.personNotes,
      marketingConsent: fields.marketingConsent,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
  if (oldKey && oldKey !== newEmail) {
    batch.delete(doc(db, "guests", oldKey));
  }
  bookingIds.forEach((id) => {
    batch.update(doc(db, "bookings", id), {
      guest_name: fields.name,
      phone: fields.phone,
      email: newEmail,
      street: fields.street,
      houseNumber: fields.houseNumber,
      zip: fields.zip,
      city: fields.city,
      country: fields.country,
      updated_at: serverTimestamp(),
    });
  });
  await batch.commit();
}
