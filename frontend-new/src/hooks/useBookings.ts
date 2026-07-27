import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  collection, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { properties } from "@/lib/properties";
import { CHANNEL_OPTIONS } from "@/lib/channels";
import { diffBooking } from "@/lib/bookingHistory";
import type { Booking, BookingFormData, BookingStatus, FieldChange } from "@/types";

// Schreibt einen Historien-Eintrag in die Sub-Collection bookings/{id}/history.
// Best-effort: ein Fehler hier darf das eigentliche Speichern der Buchung nicht beeinflussen.
async function writeHistory(bookingId: string, changes: FieldChange[], note?: string) {
  if (!changes.length && !note) return;
  try {
    await addDoc(collection(db, "bookings", bookingId, "history"), {
      changes,
      note: note ?? "",
      userId: auth.currentUser?.uid ?? "",
      created_at: serverTimestamp(),
    });
  } catch (e) {
    console.warn("Historien-Eintrag konnte nicht geschrieben werden:", e);
  }
}

const VALID_STATUSES: BookingStatus[] = ["anfrage", "reserviert", "bestaetigt", "bezahlt", "problem", "abgeschlossen"];

// Status für Altbestand ohne status-Feld ableiten: bezahlt → "bezahlt", sonst "anfrage"
function resolveStatus(raw: Record<string, unknown>): BookingStatus {
  const s = raw.status as BookingStatus | undefined;
  if (s && VALID_STATUSES.includes(s)) return s;
  return raw.is_paid || raw.paid ? "bezahlt" : "anfrage";
}

// Maps old apartment name (e.g. "Upstalsboom 2") to new property id (e.g. "ups-2")
function resolvePropertyId(raw: Record<string, unknown>): string {
  if (raw.property_id && typeof raw.property_id === "string") return raw.property_id;
  const name = (raw.apartment ?? raw.propertyName ?? "") as string;
  return properties.find((p) => p.name === name)?.id ?? "ups-2";
}

// Normalisiert Alt-/Freitext-Kanalwerte (z.B. aus iCal-Feeds oder früherer Freitext-Eingabe)
// auf die vier festen Optionen — nötig für konsistente Statistik-Auswertung.
function resolveChannel(raw: Record<string, unknown>): string {
  const c = String(raw.channel ?? "").trim();
  const exact = CHANNEL_OPTIONS.find((opt) => opt.toLowerCase() === c.toLowerCase());
  if (exact) return exact;
  const lower = c.toLowerCase();
  if (lower.includes("baltrum")) return "BaltrumDirekt";
  if (lower.includes("traum") || lower.includes("ferienwohnung")) return "Traumferienwohnungen";
  if (lower.includes("webseite") || lower.includes("website")) return "Webseite";
  return "Manuell";
}

// Normalises a raw Firestore doc — handles both old (camelCase) and new (snake_case) shapes
function normaliseBooking(id: string, raw: Record<string, unknown>): Booking {
  return {
    id,
    property_id:  resolvePropertyId(raw),
    booking_number: (raw.booking_number ?? "") as string,
    status:       resolveStatus(raw),
    guest_name:   (raw.guest_name   ?? raw.guestName   ?? "") as string,
    contact_info: (raw.contact_info ?? raw.email ?? raw.phone ?? "") as string,
    check_in:     (raw.check_in     ?? raw.checkIn     ?? "") as string,
    check_out:    (raw.check_out    ?? raw.checkOut    ?? "") as string,
    ferry_time:   (raw.ferry_time   ?? raw.ferryTime   ?? "") as string,
    ferry_time_departure: (raw.ferry_time_departure ?? "") as string,
    is_paid:      Boolean(raw.is_paid ?? raw.paid),
    adults:       Number(raw.adults  ?? raw.persons    ?? 1),
    children:     Number(raw.children ?? 0),
    kinderAlter:  Array.isArray(raw.kinderAlter) ? (raw.kinderAlter as unknown[]).map(Number) : [],
    dog:          Boolean(raw.dog    ?? raw.hasDog),
    kinderbett:      Boolean(raw.kinderbett),
    rausfallschutz:  Boolean(raw.rausfallschutz),
    kinderstuhl:     Boolean(raw.kinderstuhl),
    price:        Number(raw.price   ?? 0),
    channel:      resolveChannel(raw),
    ical_uid:     (raw.ical_uid ?? "") as string,
    notes:        (raw.notes ?? raw.specialRequests ?? "") as string,
    source:       (raw.source ?? "manual") as Booking["source"],
    userId:       (raw.userId ?? "") as string,
    created_at:   (raw.created_at   ?? raw.createdAt  ?? "") as string,
    updated_at:   (raw.updated_at   ?? raw.updatedAt  ?? "") as string,
    deletedAt:    (raw.deletedAt ?? null) as string | null,
  };
}

// Lädt ALLE Buchungen des Nutzers (aktive + soft-deleted). useBookings() und
// useTrashedBookings() teilen sich diesen einen Fetch/Cache-Eintrag und
// filtern nur per `select` — vermeidet einen zweiten Firestore-Read für den Papierkorb.
async function fetchBookings(): Promise<Booking[]> {
  if (!auth.currentUser) return [];
  const snap = await getDocs(collection(db, "bookings"));
  return snap.docs
    .map((d) => normaliseBooking(d.id, d.data() as Record<string, unknown>))
    .filter((b) => b.check_in && b.check_out);
}

export function useBookings() {
  return useQuery({
    queryKey: ["bookingsAll"],
    queryFn: fetchBookings,
    select: (data) => data.filter((b) => !b.deletedAt),
  });
}

export function useTrashedBookings() {
  return useQuery({
    queryKey: ["bookingsAll"],
    queryFn: fetchBookings,
    select: (data) =>
      data
        .filter((b) => !!b.deletedAt)
        .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")),
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: BookingFormData) => {
      const ref = await addDoc(collection(db, "bookings"), {
        ...data,
        deletedAt: null,
        userId: auth.currentUser!.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      // Erster Historien-Eintrag: Buchung erstellt
      await writeHistory(ref.id, [], "Buchung erstellt");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookingsAll"] }),
  });
}

interface UpdateBookingArgs {
  id: string;
  data: Partial<BookingFormData>;
  history?: { changes: FieldChange[]; note?: string };
}

export function useUpdateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data, history }: UpdateBookingArgs) => {
      await updateDoc(doc(db, "bookings", id), {
        ...data,
        updated_at: serverTimestamp(),
      });
      if (history) await writeHistory(id, history.changes, history.note);
    },
    // Optimistic UI: Cache sofort patchen, bei Fehler zurückrollen
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ["bookingsAll"] });
      const previous = qc.getQueryData<Booking[]>(["bookingsAll"]);
      qc.setQueryData<Booking[]>(["bookingsAll"], (old) =>
        old?.map((b) => (b.id === id ? { ...b, ...data } : b)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["bookingsAll"], ctx.previous);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["bookingsAll"] });
      qc.invalidateQueries({ queryKey: ["bookingHistory", vars.id] });
    },
  });
}

// Lokales Datum – bewusst kein toISOString() (verschiebt in Zeitzonen mit positivem
// UTC-Offset, z.B. Deutschland, das Datum um einen Tag zurück).
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Setzt bezahlte Buchungen nach der Abreise automatisch auf "abgeschlossen" — alle
// anderen Status (anfrage, reserviert, bestaetigt, problem) deuten auf noch offene
// Punkte hin und müssen bewusst manuell abgeschlossen werden.
export function useAutoCompleteBookings() {
  const { data: bookings } = useBookings();
  const update = useUpdateBooking();
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    if (!bookings) return;
    const today = todayISO();
    bookings
      .filter((b) => b.status === "bezahlt" && b.check_out < today && !attempted.current.has(b.id))
      .forEach((b) => {
        attempted.current.add(b.id);
        update.mutate({
          id: b.id,
          data: { status: "abgeschlossen" },
          history: {
            changes: diffBooking(b, { status: "abgeschlossen" }),
            note: "Automatisch abgeschlossen (Abreisedatum überschritten)",
          },
        });
      });
  }, [bookings, update]);
}

// Verschiebt eine Buchung in den Papierkorb: Dokument bleibt vollständig erhalten,
// nur `deletedAt` wird gesetzt. Verschwindet dadurch aus allen normalen Ansichten.
export function useSoftDeleteBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, "bookings", id), {
        deletedAt: nowIso,
        updated_at: serverTimestamp(),
      });
      await writeHistory(id, [], "In den Papierkorb verschoben");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookingsAll"] }),
  });
}

// Stellt eine Buchung aus dem Papierkorb wieder her.
export function useRestoreBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await updateDoc(doc(db, "bookings", id), {
        deletedAt: null,
        updated_at: serverTimestamp(),
      });
      await writeHistory(id, [], "Aus dem Papierkorb wiederhergestellt");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookingsAll"] }),
  });
}

// Löscht eine Buchung unwiderruflich. Nur aus dem Papierkorb aufrufbar.
export function useHardDeleteBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Historie der Buchung mit aufräumen (Sub-Collection wird nicht automatisch gelöscht)
      try {
        const snap = await getDocs(collection(db, "bookings", id, "history"));
        await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      } catch (e) {
        console.warn("Historie konnte nicht aufgeräumt werden:", e);
      }
      await deleteDoc(doc(db, "bookings", id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookingsAll"] }),
  });
}
