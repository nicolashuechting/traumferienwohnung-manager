import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Prüft ob eine E-Mail in der "allowedUsers" Whitelist-Collection steht.
// Dokument-ID = normalisierte E-Mail (lowercase, getrimmt) → O(1)-Lookup ohne Query.
// Läuft erst NACH dem Login (die Liste ist nicht mehr öffentlich lesbar): ein
// angemeldeter Nutzer darf nur sein eigenes Dokument lesen (Firestore-Regel auf
// allowedUsers), das genügt für diese Prüfung.
export async function isEmailAllowed(email: string): Promise<boolean> {
  const normalised = email.trim().toLowerCase();
  const snap = await getDoc(doc(db, "allowedUsers", normalised));
  return snap.exists();
}
