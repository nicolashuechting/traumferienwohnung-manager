import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/notifications";
import type { NotificationSettings } from "@/types";

// Ein einzelnes, globales Dokument — analog houseSettings/priceSettings sind die
// Schwellenwerte Geschäftsregeln des ganzen Betriebs, keine persönliche Präferenz
// pro Nutzer. Bewusst kein userId-Filter.
const DOC_PATH = ["notificationSettings", "global"] as const;

async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const snap = await getDoc(doc(db, ...DOC_PATH));
  if (!snap.exists()) return DEFAULT_NOTIFICATION_SETTINGS;
  const raw = snap.data() as Record<string, unknown>;
  return {
    vertragOffenTage: Number(raw.vertragOffenTage ?? DEFAULT_NOTIFICATION_SETTINGS.vertragOffenTage),
    zahlungOffenTage: Number(raw.zahlungOffenTage ?? DEFAULT_NOTIFICATION_SETTINGS.zahlungOffenTage),
    reservierungOffenTage: Number(raw.reservierungOffenTage ?? DEFAULT_NOTIFICATION_SETTINGS.reservierungOffenTage),
    anfrageOffenTage: Number(raw.anfrageOffenTage ?? DEFAULT_NOTIFICATION_SETTINGS.anfrageOffenTage),
    anreiseBaldTage: Number(raw.anreiseBaldTage ?? DEFAULT_NOTIFICATION_SETTINGS.anreiseBaldTage),
  };
}

export function useNotificationSettings() {
  return useQuery({ queryKey: ["notificationSettings"], queryFn: fetchNotificationSettings });
}

export function useUpdateNotificationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: NotificationSettings) => {
      await setDoc(doc(db, ...DOC_PATH), data, { merge: true });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificationSettings"] }),
  });
}
