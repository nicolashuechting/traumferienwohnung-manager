import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import type { NotificationRuleKey, NotificationSnooze } from "@/types";

// Team-weit geteilt (Doc-ID enthält bewusst KEIN userId) — ein Snooze gilt für alle
// Admins, damit nicht mehrere Leute dieselbe überfällige Buchung parallel abarbeiten.
function snoozeId(bookingId: string, ruleKey: NotificationRuleKey): string {
  return `${bookingId}_${ruleKey}`;
}

async function fetchSnoozes(): Promise<NotificationSnooze[]> {
  const snap = await getDocs(collection(db, "notificationSnoozes"));
  return snap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      bookingId: (raw.bookingId ?? "") as string,
      ruleKey: (raw.ruleKey ?? "") as NotificationRuleKey,
      snoozedUntil: (raw.snoozedUntil ?? "") as string,
      userId: (raw.userId ?? "") as string,
      created_at: "",
    };
  });
}

export function useNotificationSnoozes() {
  return useQuery({ queryKey: ["notificationSnoozes"], queryFn: fetchSnoozes });
}

export function useSetNotificationSnooze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, ruleKey, days }: { bookingId: string; ruleKey: NotificationRuleKey; days: number }) => {
      const snoozedUntil = new Date(Date.now() + days * 86400000).toISOString();
      await setDoc(doc(db, "notificationSnoozes", snoozeId(bookingId, ruleKey)), {
        bookingId,
        ruleKey,
        snoozedUntil,
        userId: auth.currentUser?.uid ?? "",
        created_at: serverTimestamp(),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificationSnoozes"] }),
  });
}
