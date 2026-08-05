import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { HouseSettings, HouseId } from "@/types";

// Bewusst kein userId-Filter: Haus-Konfiguration (inkl. Bankdaten) ist Stammdaten
// des ganzen Betriebs, nicht pro Account — genau wie priceSettings/bookings.
// Bankdaten liegen bewusst NUR hier in Firestore, nicht im Quellcode/Git.
async function fetchHouseSettings(): Promise<HouseSettings[]> {
  const snap = await getDocs(collection(db, "houseSettings"));
  return snap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      id: d.id as HouseId,
      name: String(raw.name ?? ""),
      address: String(raw.address ?? ""),
      logoAssetPath: String(raw.logoAssetPath ?? ""),
      kontoinhaber: String(raw.kontoinhaber ?? ""),
      iban: String(raw.iban ?? ""),
      bank: String(raw.bank ?? ""),
      contactEmail: String(raw.contactEmail ?? ""),
      phone: String(raw.phone ?? ""),
      website: String(raw.website ?? ""),
      footerName: String(raw.footerName ?? ""),
      kurtaxeSuchname: String(raw.kurtaxeSuchname ?? ""),
      checkInTime: String(raw.checkInTime ?? "15:00"),
      checkOutTime: String(raw.checkOutTime ?? "10:00"),
      stornoText: Array.isArray(raw.stornoText) ? (raw.stornoText as string[]) : [],
    };
  });
}

export function useHouseSettings() {
  return useQuery({ queryKey: ["houseSettings"], queryFn: fetchHouseSettings });
}

export function useUpdateHouseSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: HouseId; data: Partial<HouseSettings> }) => {
      await setDoc(doc(db, "houseSettings", id), data, { merge: true });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["houseSettings"] }),
  });
}
