import { useState, useEffect } from "react";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  sendEmailVerification, type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { isEmailAllowed } from "@/lib/whitelist";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Ein Konto, dessen E-Mail nicht per Link bestätigt wurde, gilt in der App als
      // NICHT angemeldet. Sonst könnte jemand mit der (freigeschalteten) Adresse eines
      // anderen ein Konto anlegen und sich als diese Person einloggen, ohne je Zugriff
      // auf deren Postfach zu haben. Die eigentliche Sperre erzwingen die Firestore-Regeln.
      setUser(currentUser && currentUser.emailVerified ? currentUser : null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    if (!result.user.emailVerified) {
      try {
        await sendEmailVerification(result.user);
      } catch {
        // z.B. "zu viele Anfragen" — die Mail wurde dann kurz zuvor schon verschickt,
        // der Hinweis unten bleibt trotzdem richtig.
      }
      await signOut(auth);
      throw new Error(
        "Bitte bestätige zuerst deine E-Mail-Adresse: Wir haben dir eine Bestätigungsmail " +
        "geschickt (auch im Spam-Ordner nachsehen). Klicke dort auf den Link und melde dich " +
        "danach hier erneut an."
      );
    }
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

  const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);

  return { user, loading, login, logout, resetPassword };
}
