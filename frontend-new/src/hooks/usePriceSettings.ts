import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PriceGroupSettings, PriceGroupId } from "@/types";

// Bewusst kein userId-Filter: Preise sind Stammdaten des ganzen Betriebs, nicht
// pro Account (genau wie die App-weit geteilten Buchungen), keine per-Nutzer-Kopien.
async function fetchPriceSettings(): Promise<PriceGroupSettings[]> {
  const snap = await getDocs(collection(db, "priceSettings"));
  return snap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      id: d.id as PriceGroupId,
      maxPersons: Number(raw.maxPersons ?? 4),
      flatRate: Boolean(raw.flatRate),
      cleaningFee: Number(raw.cleaningFee ?? 0),
      extraFees: Array.isArray(raw.extraFees) ? raw.extraFees as PriceGroupSettings["extraFees"] : [],
      dogFee: Number(raw.dogFee ?? 0),
      years: Array.isArray(raw.years) ? raw.years as PriceGroupSettings["years"] : [],
    };
  });
}

export function usePriceSettings() {
  return useQuery({ queryKey: ["priceSettings"], queryFn: fetchPriceSettings });
}

export function useUpdatePriceGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: PriceGroupId; data: Partial<PriceGroupSettings> }) => {
      await setDoc(doc(db, "priceSettings", id), data, { merge: true });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["priceSettings"] }),
  });
}

// Legt alle 7 Preisgruppen mit den echten Baltrumdirekt-Werten für 2026 (+ 2027 bei
// Anne, wo bereits hinterlegt) an. Nur sinnvoll solange die Collection leer ist —
// überschreibt nichts, wenn schon Dokumente existieren (siehe PriceSettings.tsx).
export function useSeedPriceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groups: PriceGroupSettings[]) => {
      await Promise.all(groups.map((g) => setDoc(doc(db, "priceSettings", g.id), g)));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["priceSettings"] }),
  });
}
