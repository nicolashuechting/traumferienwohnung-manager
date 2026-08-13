import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Mail, Lock, AlertCircle, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openReset = () => {
    setResetEmail(email);
    setResetError("");
    setResetSent(false);
    setShowReset(true);
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetLoading(true);
    try {
      await resetPassword(resetEmail);
      setResetSent(true);
    } catch (err) {
      setResetError((err as Error).message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl mx-auto mb-4 flex items-center justify-center">
            <span className="text-white text-xl font-bold">T</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Traumferienwohnung Manager</h1>
          <p className="text-gray-500 text-sm">Verwalte deine Ferienwohnungen effizient</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-blue-100">
          {showReset ? (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-6">Passwort zurücksetzen</h2>

              {resetSent ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-5 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-emerald-800">
                    Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde soeben eine E-Mail mit einem Link zum
                    Zurücksetzen des Passworts verschickt.
                  </p>
                </div>
              ) : (
                <>
                  {resetError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-5 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{resetError}</p>
                    </div>
                  )}
                  <form onSubmit={handleReset} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Email-Adresse</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="deine@email.de" required
                          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        />
                      </div>
                    </div>
                    <button
                      type="submit" disabled={resetLoading}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50 mt-2"
                    >
                      {resetLoading ? "Sendet…" : "Link zum Zurücksetzen senden"}
                    </button>
                  </form>
                </>
              )}

              <p className="text-center text-sm text-gray-600 mt-5">
                <button
                  type="button"
                  onClick={() => setShowReset(false)}
                  className="text-blue-600 hover:text-blue-700 font-semibold"
                >
                  Zurück zur Anmeldung
                </button>
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-6">Anmelden</h2>

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
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="deine@email.de" required
                      className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-gray-700">Passwort</label>
                    <button
                      type="button"
                      onClick={openReset}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      Passwort vergessen?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••" required
                      className="w-full pl-9 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
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

                <button
                  type="submit" disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50 mt-2"
                >
                  {loading ? "Anmeldung läuft..." : "Anmelden"}
                </button>
              </form>

              <p className="text-center text-sm text-gray-600 mt-5">
                Noch kein Konto?{" "}
                <Link to="/register" className="text-blue-600 hover:text-blue-700 font-semibold">
                  Jetzt registrieren
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
