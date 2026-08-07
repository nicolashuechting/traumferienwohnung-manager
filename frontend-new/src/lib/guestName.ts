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
