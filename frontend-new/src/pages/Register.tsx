import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Mail, Lock, AlertCircle, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { createUserWithEmailAndPassword, sendEmailVerification, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwörter stimmen nicht überein."); return; }
    if (password.length < 6) { setError("Passwort muss mindestens 6 Zeichen haben."); return; }
    setError("");
    setLoading(true);
    try {
      // Die Freigabeliste (allowedUsers) ist nicht mehr öffentlich lesbar, deshalb gibt es
      // hier keine Vorab-Prüfung mehr. Zugang bekommt man erst, wenn die E-Mail per Link
      // bestätigt ist UND auf der Freigabeliste steht — beides prüfen die Firestore-Regeln.
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
      await signOut(auth);
      setSentTo(email.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-blue-100 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Fast geschafft</h2>
          <p className="text-sm text-gray-600">
            Wir haben eine Bestätigungsmail an <span className="font-semibold">{sentTo}</span> geschickt
            (auch im Spam-Ordner nachsehen). Klicke dort auf den Link und melde dich danach an.
          </p>
          <p className="text-xs text-gray-400 mt-3">
            Zugang bekommst du nur, wenn der Administrator deine E-Mail-Adresse freigeschaltet hat.
          </p>
          <Link to="/login" className="inline-block mt-5 text-blue-600 hover:text-blue-700 font-semibold text-sm">
            Zur Anmeldung
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="" className="w-16 h-16 mx-auto mb-4 rounded-2xl shadow-md" />
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Baltrumplaner</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-blue-100">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Konto erstellen</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email-Adresse</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="deine@email.de" required
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Passwort</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mindestens 6 Zeichen" required
                  className="w-full pl-9 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Passwort bestätigen</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type={showConfirm ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••" required
                  className="w-full pl-9 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  aria-label={showConfirm ? "Passwort verbergen" : "Passwort anzeigen"}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50 mt-2">
              {loading ? "Erstellt Konto..." : "Konto erstellen"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 mt-5">
            Bereits ein Konto?{" "}
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-semibold">Anmelden</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
