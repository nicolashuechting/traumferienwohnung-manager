import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Prüft ob eine E-Mail in der "allowedUsers" Whitelist-Collection steht.
// Dokument-ID = normalisierte E-Mail (lowercase, getrimmt) → O(1)-Lookup ohne Query.
// Lesbar für nicht-eingeloggte Nutzer (Firestore Rule: allow read: if true)
// damit die Prüfung vor der Kontoerstellung funktioniert.
export async function isEmailAllowed(email: string): Promise<boolean> {
  const normalised = email.trim().toLowerCase();
  const snap = await getDoc(doc(db, "allowedUsers", normalised));
  return snap.exists();
}
