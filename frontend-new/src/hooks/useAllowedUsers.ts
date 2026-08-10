import { useQuery } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AllowedUser } from "@/types";

// Öffentlich lesbar (siehe src/lib/whitelist.ts) — Dokument-ID = normalisierte E-Mail.
async function fetchAllowedUsers(): Promise<AllowedUser[]> {
  const snap = await getDocs(collection(db, "allowedUsers"));
  return snap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      email: d.id,
      displayName: String(raw.displayName ?? ""),
      role: raw.role === "viewer" ? "viewer" : "admin",
    } as AllowedUser;
  });
}

export function useAllowedUsers() {
  return useQuery({ queryKey: ["allowedUsers"], queryFn: fetchAllowedUsers });
}
