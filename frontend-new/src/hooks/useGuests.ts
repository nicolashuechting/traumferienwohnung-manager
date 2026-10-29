import { useQuery } from "@tanstack/react-query";
import { collection, getDoc, getDocs, doc, setDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { houseIdOf } from "@/lib/properties";
import { splitGuestName } from "@/lib/guestName";
import type { Guest, BookingFormData, HouseId } from "@/types";

// Gast-Profile sind nach Haus getrennt: Dokument-ID "<haus>__<email>". Ältere Profile
// (ID = nur die E-Mail, ohne Feld "house") stammen alle aus Haus-Anne-Buchungen und
// werden deshalb als Haus Anne gelesen — solange es noch kein neues Haus-Anne-Profil
// für dieselbe Adresse gibt. Neu geschrieben wird immer nur im neuen Format.
const LEGACY_HOUSE: HouseId = "haus-anne";

export function normEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

export function guestDocId(house: HouseId, email: string): string {
  return `${house}__${normEmail(email)}`;
}

function isHouseId(v: unknown): v is HouseId {
  return v === "haus-anne" || v === "upstalsboom";
}

// Bewusst kein userId-Filter — Gast-Stammdaten sind wie Buchungen betriebsweit geteilt.
async function fetchGuests(): Promise<Guest[]> {
  const snap = await getDocs(collection(db, "guests"));
  const current: Guest[] = [];
  const legacy: Guest[] = [];
  snap.docs.forEach((d) => {
    const raw = d.data() as Record<string, unknown>;
    const isNew = isHouseId(raw.house);
    const g: Guest = {
      id: d.id,
      house: isNew ? (raw.house as HouseId) : LEGACY_HOUSE,
      email: normEmail(isNew ? String(raw.email ?? "") : d.id),
      name: String(raw.name ?? ""),
      firstName: String(raw.firstName ?? ""),
      lastName: String(raw.lastName ?? ""),
      phone: String(raw.phone ?? ""),
      landline: String(raw.landline ?? ""),
      street: String(raw.street ?? ""),
      houseNumber: String(raw.houseNumber ?? ""),
      zip: String(raw.zip ?? ""),
      city: String(raw.city ?? ""),
      country: String(raw.country ?? ""),
      personNotes: String(raw.personNotes ?? ""),
      marketingConsent: Boolean(raw.marketingConsent),
      isRegularGuest: Boolean(raw.isRegularGuest),
      updated_at: String(raw.updated_at ?? ""),
    };
    (isNew ? current : legacy).push(g);
  });
  const have = new Set(current.map((g) => `${g.house}|${g.email}`));
  return [...current, ...legacy.filter((g) => !have.has(`${g.house}|${g.email}`))];
}

export function useGuests() {
  return useQuery({ queryKey: ["guests"], queryFn: fetchGuests });
}

// Profil eines Gasts in einem bestimmten Haus (oder undefined).
export function findGuest(guests: Guest[], house: HouseId, email: string): Guest | undefined {
  const e = normEmail(email);
  if (!e) return undefined;
  return guests.find((g) => g.house === house && g.email === e);
}

function normName(s: string): string {
  return (s ?? "").normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

// Nur Ziffern, Ländervorwahl +49/0049 → 0 — damit "+49 176 22…" und "0176 22…" gleich sind.
export function normPhone(phone: string): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("0049")) return "0" + d.slice(4);
  if (d.startsWith("49") && (phone ?? "").trim().startsWith("+")) return "0" + d.slice(2);
  return d;
}

// Zusatzprofile für eine zweite E-Mail-Adresse (Import aus der alten Gästeliste) tragen
// dieselben Daten wie das Hauptprofil — bei Treffern über Name/Telefon nur einmal zeigen.
function dedupeSamePerson(list: Guest[]): Guest[] {
  const isAlias = (g: Guest) => g.personNotes.startsWith("Zweite E-Mail-Adresse");
  const sorted = [...list].sort((a, b) => Number(isAlias(a)) - Number(isAlias(b)));
  const seen = new Set<string>();
  return sorted.filter((g) => {
    const k = [normName(g.name), normPhone(g.phone), normName(g.street), normName(g.city)].join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Gäste eines Hauses per Name: Vor- + Nachname müssen passen. Nur Nachname (ohne Vorname)
// zählt nur, wenn es genau einen Gast mit diesem Nachnamen gibt (sonst zu viele "Müller").
export function findGuestsByName(guests: Guest[], house: HouseId, firstName: string, lastName: string): Guest[] {
  const first = normName(firstName);
  const last = normName(lastName);
  if (!last) return [];
  const inHouse = guests.filter((g) => g.house === house);
  const lastOf = (g: Guest) => normName(g.lastName || splitGuestName(g.name).last);
  const firstOf = (g: Guest) => normName(g.firstName || splitGuestName(g.name).first);
  if (first) {
    return dedupeSamePerson(inHouse.filter((g) =>
      (lastOf(g) === last && firstOf(g) === first) || normName(g.name) === `${first} ${last}`));
  }
  const byLast = dedupeSamePerson(inHouse.filter((g) => lastOf(g) === last));
  return byLast.length === 1 ? byLast : [];
}

// Gäste eines Hauses per Telefonnummer (mind. 6 Ziffern, damit Bruchstücke nicht treffen).
export function findGuestsByPhone(guests: Guest[], house: HouseId, phone: string): Guest[] {
  const p = normPhone(phone);
  if (p.length < 6) return [];
  return dedupeSamePerson(guests.filter((g) => g.house === house && (normPhone(g.phone) === p || normPhone(g.landline) === p)));
}

// Altes Profil (ID = E-Mail) mit ins neue Haus-Anne-Profil übernehmen, damit beim ersten
// Speichern nach der Umstellung Notizen/Einwilligung/Adresse nicht verloren gehen.
async function legacyFieldsFor(house: HouseId, email: string): Promise<Record<string, unknown>> {
  if (house !== LEGACY_HOUSE) return {};
  try {
    const [neu, alt] = await Promise.all([getDoc(doc(db, "guests", guestDocId(house, email))), getDoc(doc(db, "guests", email))]);
    if (neu.exists() || !alt.exists()) return {};
    const raw = alt.data() as Record<string, unknown>;
    if (isHouseId(raw.house)) return {};
    const rest = { ...raw };
    delete rest.updated_at;
    return rest;
  } catch {
    return {};
  }
}

// Best-effort: wird nach jedem Speichern einer Buchung mit E-Mail aufgerufen, damit
// Adresse/Kontaktdaten für künftige Buchungen desselben Gasts im selben Haus
// wiedererkannt werden. Ein Fehler hier darf das eigentliche Speichern nicht beeinflussen.
export async function upsertGuestFromBooking(data: Partial<BookingFormData>, propertyId?: string): Promise<void> {
  const email = normEmail(data.email ?? "");
  const prop = data.property_id || propertyId;
  if (!email || !prop) return;
  const house = houseIdOf(prop);
  try {
    const carried = await legacyFieldsFor(house, email);
    await setDoc(
      doc(db, "guests", guestDocId(house, email)),
      {
        ...carried,
        house,
        email,
        name: data.guest_name ?? "",
        firstName: data.guest_first_name ?? "",
        lastName: data.guest_last_name ?? "",
        phone: data.phone ?? "",
        // Festnetz nur setzen, wenn angegeben — eine Buchung ohne Festnetz löscht es nicht
        ...(data.landline ? { landline: data.landline } : {}),
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

// Personennotizen/Werbemail-Einwilligung/Stammgast-Status sind personenbezogen und
// gelten nur für das Haus der Buchung — werden separat aus dem Buchungsformular gepflegt.
export async function upsertGuestFields(
  house: HouseId,
  email: string,
  fields: { personNotes: string; marketingConsent: boolean; isRegularGuest: boolean },
): Promise<void> {
  const key = normEmail(email);
  if (!key) return;
  try {
    const carried = await legacyFieldsFor(house, key);
    await setDoc(
      doc(db, "guests", guestDocId(house, key)),
      { ...carried, house, email: key, ...fields, updated_at: serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    console.warn("Gast-Stammdaten konnten nicht gespeichert werden:", e);
  }
}

// Manuelle Bearbeitung über die Gäste-Übersicht: aktualisiert das Gast-Profil des Hauses
// UND spiegelt Vor-/Nachname/Telefon/E-Mail/Adresse in ALLE übergebenen Buchungen dieser
// Person zurück (nur Buchungen desselben Hauses) — im Gegensatz zu upsertGuestFromBooking/
// upsertGuestFields läuft das nicht best-effort, Fehler sollen den Aufrufer erreichen.
export interface GuestEditFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  landline: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  country: string;
  personNotes: string;
  marketingConsent: boolean;
  isRegularGuest: boolean;
}

export async function updateGuestAndBookings(
  house: HouseId,
  oldEmail: string,
  fields: GuestEditFields,
  bookingIds: string[],
): Promise<void> {
  const newEmail = normEmail(fields.email);
  if (!newEmail) throw new Error("E-Mail darf nicht leer sein.");
  const oldKey = normEmail(oldEmail);
  const name = [fields.firstName, fields.lastName].filter(Boolean).join(" ").trim();

  const batch = writeBatch(db);
  batch.set(
    doc(db, "guests", guestDocId(house, newEmail)),
    {
      house,
      email: newEmail,
      name,
      firstName: fields.firstName,
      lastName: fields.lastName,
      phone: fields.phone,
      landline: fields.landline,
      street: fields.street,
      houseNumber: fields.houseNumber,
      zip: fields.zip,
      city: fields.city,
      country: fields.country,
      personNotes: fields.personNotes,
      marketingConsent: fields.marketingConsent,
      isRegularGuest: fields.isRegularGuest,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
  if (oldKey && oldKey !== newEmail) {
    batch.delete(doc(db, "guests", guestDocId(house, oldKey)));
    // Altes Profil ohne Haus (nur Haus Anne) ebenfalls entfernen, sonst taucht es wieder auf.
    if (house === LEGACY_HOUSE) batch.delete(doc(db, "guests", oldKey));
  }
  bookingIds.forEach((id) => {
    batch.update(doc(db, "bookings", id), {
      guest_name: name,
      guest_first_name: fields.firstName,
      guest_last_name: fields.lastName,
      phone: fields.phone,
      landline: fields.landline,
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
