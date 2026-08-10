import { useAuth } from "@/hooks/useAuth";
import { useAllowedUsers } from "@/hooks/useAllowedUsers";

// Rolle des aktuell eingeloggten Nutzers ("admin" solange kein Eintrag/Feld existiert
// oder noch geladen wird — bewusst fail-open in der UI, die eigentliche Durchsetzung
// übernehmen die Firestore Security Rules).
export function useUserRole() {
  const { user } = useAuth();
  const { data: allowedUsers = [] } = useAllowedUsers();
  const email = (user?.email ?? "").trim().toLowerCase();
  const entry = allowedUsers.find((u) => u.email.toLowerCase() === email);
  const role = entry?.role ?? "admin";
  return { role, isViewer: role === "viewer" };
}
