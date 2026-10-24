import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  collection, query, where, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { fetchIcal } from "@/lib/ical";
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
  const invoicedIds = new Set<string>(); // Buchungen mit Rechnung — werden beim Sync nicht mehr verändert
  existingSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const icalUid = data.ical_uid as string;
    if (icalUid) existingByUid.set(icalUid, d.id);
    if (data.invoice) invoicedIds.add(d.id);
  });

  for (const ev of events) {
    if (!ev.dtstart || !ev.dtend) continue;

    // iCal DTEND for all-day events is exclusive (day after last night) — correct for check_out
    const bookingData: Omit<Booking, "id" | "created_at" | "updated_at"> = {
      property_id:  feed.property_id,
      booking_number: "", // Nummer entsteht erst mit der Rechnung
      status:       "anfrage",
      guest_name:   ev.summary || "iCal-Buchung",
      guest_title:  "",
      guest_first_name: "",
      guest_last_name:  "",
      contact_info: "",
      phone:        "",
      landline:     "",
      email:        "",
      street:       "",
      houseNumber:  "",
      zip:          "",
      city:         "",
      country:      "",
      check_in:     ev.dtstart,
      check_out:    ev.dtend,
      ferry_time:   "",
      ferry_time_departure: "",
      is_paid:      false,
      adults:       1,
      children:     0,
      kinderAlter:  [],
      dogCount:     0,
      kinderbett:      false,
      babybett:        false,
      rausfallschutz:  false,
      kinderstuhl:     false,
      price:        0,
      priceIsManual: true, // iCal-Importe haben keinen eigenen Preis, nicht automatisch überschreiben
      cancellationFee: 0,
      status_changed_at: new Date().toISOString(),
      channel:      feed.name,
      ical_uid:     ev.uid,
      notes:        ev.description,
      source:       "ical",
      userId:       uid,
      deletedAt:    null,
      invoice:      null,
    };

    const existingDocId = existingByUid.get(ev.uid);
    if (existingDocId && invoicedIds.has(existingDocId)) {
      // Rechnung ist schon erstellt → Daten sind festgeschrieben, Feed-Änderungen ignorieren.
      continue;
    } else if (existingDocId) {
      // Update existing (dates or summary may have changed)
      // booking_number, status sowie Kontakt-/Adressdaten NICHT überschreiben — die kommen
      // aus dem iCal-Feed ohnehin immer leer und würden sonst vom Nutzer nachträglich
      // eingetragene Daten bei jedem Sync wieder auf "" zurücksetzen. status_changed_at
      // gehört zu status dazu — der ändert sich beim Resync ja nicht wirklich.
      const {
        booking_number: _bn, status: _st, status_changed_at: _sca,
        contact_info: _ci, phone: _ph, landline: _ll, email: _em,
        street: _st2, houseNumber: _hn, zip: _zip, city: _city, country: _country,
        guest_title: _gt, guest_first_name: _gfn, guest_last_name: _gln,
        invoice: _inv,
        ...updatable
      } = bookingData;
      await updateDoc(doc(db, "bookings", existingDocId), {
        ...updatable,
        updated_at: serverTimestamp(),
      });
      result.updated++;
    } else {
      // Neue Buchung — bekommt (wie jede Buchung) erst mit der Rechnung eine Nummer.
      // use setDoc with UID-based ID to ensure idempotency
      const safeId = `ical_${feed.property_id}_${ev.uid.replace(/[^a-zA-Z0-9]/g, "_")}`;
      await setDoc(doc(db, "bookings", safeId), {
        ...bookingData,
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
