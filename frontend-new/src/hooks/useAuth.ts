import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { isEmailAllowed } from "@/lib/whitelist";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    // Nach erfolgreichem Login prüfen ob E-Mail noch in der Whitelist steht.
    // Schützt vor dem Fall, dass jemand nachträglich entfernt wurde.
    const allowed = await isEmailAllowed(email);
    if (!allowed) {
      await signOut(auth);
      throw new Error(
        "Diese E-Mail-Adresse ist nicht für die Nutzung der App freigeschaltet. " +
        "Bitte wenden Sie sich an den Administrator."
      );
    }
    return result;
  };

  const logout = () => signOut(auth);

  return { user, loading, login, logout };
}
