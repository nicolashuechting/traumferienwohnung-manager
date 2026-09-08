// Gemeinsame Heuristik für Altbestand ohne getrennte Vor-/Nachname-Felder:
// letztes Wort = Nachname, Rest = Vorname. Wird sowohl bei Buchungen
// (guest_first_name/guest_last_name) als auch bei Gast-Stammdaten
// (Guest.firstName/lastName) zum Vorbefüllen der Bearbeitungsformulare genutzt.
export function splitGuestName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: "", last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

// Deduplizierungs-Key für eine Person über mehrere Buchungen hinweg: E-Mail oder
// Telefon wenn vorhanden, sonst Name (lowercase). Ursprünglich nur in Guests.tsx,
// jetzt auch von useGuestStats() genutzt, um denselben Gast überall gleich zu erkennen.
export function guestKey(email: string, phone: string, name: string): string {
  const e = (email ?? "").trim();
  if (e) return e.toLowerCase();
  const p = (phone ?? "").trim();
  if (p) return p.toLowerCase();
  return `__name__${name.toLowerCase().trim()}`;
}
