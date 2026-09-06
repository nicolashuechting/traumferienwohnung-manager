// Vor jedem Mailto-Link geprüft: falls beim Gast ein Titel hinterlegt ist, kurzer
// Hinweis, dass der Titel manuell in die E-Mail übernommen werden muss (der Titel
// fließt bewusst nirgends automatisch — weder PDF noch Mailtext — ein). Ohne Titel
// kein Hinweis, Mailto öffnet sich wie gewohnt direkt.
export function confirmEmailSend(guestTitle: string): boolean {
  const title = guestTitle.trim();
  if (!title) return true;
  return window.confirm(
    `Hinweis: Dieser Gast hat den Titel "${title}" angegeben. Bitte bei Bedarf händisch in die E-Mail einfügen.\n\nFortfahren?`,
  );
}
