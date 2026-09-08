import type { Booking } from "@/types";
import { resolveLastName } from "@/lib/pdfConfirmation";

// Haus Anne hat einen eigenen, ausführlicheren Begleittext für die Mail zur
// Buchungsbestätigung (Anreise, Gepäck, Insel-Tipps) — von Elke Rothengaß fest
// vorgegebener Wortlaut, deshalb bewusst als statischer Text hinterlegt statt aus
// Bausteinen der Haus-Einstellungen zusammengesetzt. Upstalsboom nutzt weiterhin den
// kurzen Standardtext in BookingModal.tsx.
export function hausAnneConfirmationEmailBody(booking: Booking): string {
  return (
    `Moin Frau/Herr/Familie ${resolveLastName(booking)},\n\n` +
    `wir freuen uns, dass Sie sich für einen Urlaub bei uns auf Baltrum entschieden haben! Im Anhang finden Sie die Buchungsbestätigung sowie eine Karte der Insel. Bitte einmal alles durchsehen, die fehlenden Angaben ergänzen und uns die Bestätigung zeitnah zurücksenden.\n\n` +
    `Das Haus Anne finden Sie auf der Karte im Quadrat K4. Von dort sind es zu Fuß etwa eine halbe Stunde vom Hafen bis zum Haus. Am Hafen stellen wir Ihnen gerne eine Gepäckkarre bereit – sagen Sie uns dafür am besten kurz Bescheid, mit welcher Fähre Sie ankommen (oder tragen Sie es einfach auf der Bestätigung ein).\n\n` +
    `Wer nicht laufen möchte: Beim Fuhrunternehmen Munier (Tel. 04939-2634299, auch per WhatsApp: 04939 220) kann man sich mit der Kutsche vom Hafen bis zum Haus Anne bringen lassen.\n\n` +
    `Falls Sie Gepäck vorschicken möchten, hier die Adresse:\n` +
    `Haus Anne, Andreas Rothengaß, Ostdorf 230, 26579 Baltrum\n\n` +
    `Zur Wohnung gehören ein Fahrrad zum Einkaufen und ein Bollerwagen, außerdem kann bei uns Sandspielzeug ausgeliehen werden. Die Strandabschnitte B und C liegen am nächsten – falls gewünscht, lohnt es sich, vorab online unter www.baltrum.de einen Strandkorb zu reservieren.\n\n` +
    `Ihre Gästekarte können Sie ebenfalls online unter www.baltrum.de buchen, bitte dort bei den Vermietern nach „Andreas Hüchting Haus Anne GbR" suchen.\n\n` +
    `Ein paar Tipps für die Insel: Im Hotel Inselquartier gibt es ein Frühstücksbuffet, dafür ist eine kurze Voranmeldung nötig – per Mail an info@iq-baltrum.de oder telefonisch unter 04939320. Und wer Lust auf Tennis hat, kann sich unter 0151-68598688 einen Platz mieten.\n\n` +
    `Zur Vorbereitung empfehlen wir außerdem die kostenlose Baltrum-App – dort lassen sich auch aktuelle Änderungen im Fährfahrplan einsehen.\n\n` +
    `Wir freuen uns auf Ihren Besuch und wünschen bis dahin eine schöne Vorfreude!\n\n` +
    `Herzliche Grüße\n` +
    `Elke Rothengaß`
  );
}
