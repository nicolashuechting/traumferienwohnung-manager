import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { BookingHistoryEntry } from "@/types";

async function fetchHistory(bookingId: string): Promise<BookingHistoryEntry[]> {
  if (!bookingId) return [];
  const q = query(
    collection(db, "bookings", bookingId, "history"),
    orderBy("created_at", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BookingHistoryEntry, "id">) }));
}

export function useBookingHistory(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["bookingHistory", bookingId],
    queryFn: () => fetchHistory(bookingId!),
    enabled: !!bookingId,
  });
}
