import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  collection, query, where, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { fetchIcal } from "@/lib/ical";
import { generateBookingNumber } from "@/lib/bookingNumber";
import type { IcalFeed, Booking } from "@/types";

// ── Feed CRUD ──────────────────────────────────────────────────────────────────

async function fetchFeeds(): Promise<IcalFeed[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(query(collection(db, "icalFeeds"), where("userId", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as IcalFeed));
}

export function useIcalFeeds() {
  return useQuery({ queryKey: ["icalFeeds"], queryFn: fetchFeeds });
}

export function useCreateIcalFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<IcalFeed, "id" | "userId" | "last_synced">) => {
      await addDoc(collection(db, "icalFeeds"), {
        ...data,
        userId: auth.currentUser!.uid,
        last_synced: "",
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["icalFeeds"] }),
  });
}

export function useUpdateIcalFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Omit<IcalFeed, "id" | "userId">> }) => {
      await updateDoc(doc(db, "icalFeeds", id), data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["icalFeeds"] }),
  });
}

export function useDeleteIcalFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDoc(doc(db, "icalFeeds", id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["icalFeeds"] }),
  });
}

// ── Sync ───────────────────────────────────────────────────────────────────────

export interface SyncResult {
  feed: IcalFeed;
  imported: number;
  updated: number;
  errors: string[];
}

async function syncFeed(feed: IcalFeed): Promise<SyncResult> {
  const uid = auth.currentUser!.uid;
  const result: SyncResult = { feed, imported: 0, updated: 0, errors: [] };

  let events;
  try {
    events = await fetchIcal(feed.url);
  } catch (e) {
    result.errors.push((e as Error).message);
    return result;
  }

  // Load existing ical bookings for this property to detect duplicates
  const existingSnap = await getDocs(
    query(collection(db, "bookings"),
      where("userId", "==", uid),
      where("property_id", "==", feed.property_id),
      where("source", "==", "ical"),
    )
  );
  const existingByUid = new Map<string, string>(); // ical_uid → doc id
  existingSnap.docs.forEach((d) => {
    const icalUid = (d.data() as Record<string, unknown>).ical_uid as string;
    if (icalUid) existingByUid.set(icalUid, d.id);
  });

  // Bereits vergebene Buchungsnummern des Nutzers laden (für kollisionsfreie Generierung)
  const allSnap = await getDocs(query(collection(db, "bookings"), where("userId", "==", uid)));
  const usedNumbers = new Set<string>();
  allSnap.docs.forEach((d) => {
    const num = (d.data() as Record<string, unknown>).booking_number as string;
    if (num) usedNumbers.add(num);
  });

  for (const ev of events) {
    if (!ev.dtstart || !ev.dtend) continue;

    // iCal DTEND for all-day events is exclusive (day after last night) — correct for check_out
    const bookingData: Omit<Booking, "id" | "created_at" | "updated_at"> = {
      property_id:  feed.property_id,
      booking_number: "", // bei neuen Importen unten gesetzt
      status:       "anfrage",
      guest_name:   ev.summary || "iCal-Buchung",
      contact_info: "",
      check_in:     ev.dtstart,
      check_out:    ev.dtend,
      ferry_time:   "",
      ferry_time_departure: "",
      is_paid:      false,
      adults:       1,
      children:     0,
      kinderAlter:  [],
      dog:          false,
      kinderbett:      false,
      rausfallschutz:  false,
      kinderstuhl:     false,
      price:        0,
      channel:      feed.name,
      ical_uid:     ev.uid,
      notes:        ev.description,
      source:       "ical",
      userId:       uid,
      deletedAt:    null,
    };

    const existingDocId = existingByUid.get(ev.uid);
    if (existingDocId) {
      // Update existing (dates or summary may have changed)
      // booking_number und status NICHT überschreiben (vom Nutzer evtl. gesetzt)
      const { booking_number: _bn, status: _st, ...updatable } = bookingData;
      await updateDoc(doc(db, "bookings", existingDocId), {
        ...updatable,
        updated_at: serverTimestamp(),
      });
      result.updated++;
    } else {
      // New booking — eindeutige Buchungsnummer erzeugen
      const number = generateBookingNumber(feed.property_id, ev.dtstart, usedNumbers);
      usedNumbers.add(number);
      // use setDoc with UID-based ID to ensure idempotency
      const safeId = `ical_${feed.property_id}_${ev.uid.replace(/[^a-zA-Z0-9]/g, "_")}`;
      await setDoc(doc(db, "bookings", safeId), {
        ...bookingData,
        booking_number: number,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      result.imported++;
    }
  }

  // Mark last_synced on the feed
  await updateDoc(doc(db, "icalFeeds", feed.id), {
    last_synced: new Date().toISOString(),
  });

  return result;
}

export function useSyncIcalFeeds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (feeds: IcalFeed[]) => {
      const results = await Promise.all(feeds.map(syncFeed));
      return results;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookingsAll"] });
      qc.invalidateQueries({ queryKey: ["icalFeeds"] });
    },
  });
}
