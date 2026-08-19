# Traumferienwohnung Manager – Projektzusammenfassung

## Was ist das?

Eine Web-App zur Verwaltung von Ferienwohnungsbuchungen auf der Insel Baltrum (Nordsee). Der Besitzer verwaltet mehrere Wohnungen in zwei Häusern (Hus Upstalsboom, Haus Anne) und plant/trackt Buchungen, synchronisiert mit externen Buchungsplattformen und verschickt Buchungsbestätigungen als PDF. Mehrere Nutzer (Admin + Viewer/Vermieterin) arbeiten gemeinsam auf denselben Daten.

**GitHub:** https://github.com/nicolashuechting/traumferienwohnung-manager (privat)
**Lokales Verzeichnis:** `/Users/nicolashuchting/Desktop/traumferienwohnung-manager/frontend-new/`
**Firebase-Projekt:** `traumferienwohnung-manager`

---

## Tech-Stack

- **Frontend:** Vite + React 19 + TypeScript + Tailwind CSS v4
- **Backend/Datenbank:** Firebase (Firestore + Firebase Auth + Firebase Storage) — keine eigene API, alles direkt im Client
- **Cloud Functions:** `functions/` (TypeScript, Cloud Functions v2, Region `europe-west3`) — aktuell nur das tägliche Firestore-Backup (siehe unten)
- **Firebase Extension:** "Trigger Email" (zweimal installiert, je Haus eine eigene Mail-Warteschlange-Collection) für die Änderungs-/Stornierungs-Benachrichtigungen
- **State Management:** TanStack React Query v5 (queryKey `["bookingsAll"]` für Buchungen)
- **Drag & Drop:** dnd-kit (`@dnd-kit/core`)
- **PDF-Erzeugung:** `pdf-lib` (inkl. echter ausfüllbarer Formularfelder) + `qrcode` (GiroCode/EPC-QR für Überweisungen)

---

## Objekte (Wohnungen)

Hardcoded in `src/lib/properties.ts`, zwei Häuser:

**Upstalsboom** (6 Wohnungen, alle hundefreundlich):
- Upstalsboom 2–7 (`ups-2` bis `ups-7`)

**Haus Anne** (5 Wohnungen, teils hundefreundlich):
- Anne 1 (`anne-1`) — Hund erlaubt
- Anne 2 (`anne-2`) — kein Hund
- Anne 3 (`anne-3`) — Hund erlaubt
- Anne 4 (`anne-4`) — kein Hund
- Anne 5 (`anne-5`) — kein Hund

---

## Datenmodell (Firestore)

### Collections

**`bookings/{bookingId}`** — zentrale Collection, **nicht** pro Nutzer gefiltert (alle eingeloggten Nutzer sehen dieselben Buchungen).
```typescript
{
  id: string
  property_id: string
  booking_number: string          // z.B. "UPS-2026-1234", vierstellig 1000–9999 (siehe unten)
  status: BookingStatus           // siehe Workflow unten
  guest_name: string              // kombiniert, aus Vor-/Nachname abgeleitet — für Anzeige
  guest_first_name: string
  guest_last_name: string         // primäres Feld für Anrede; bei Altbestand surname()-Heuristik als Fallback
  contact_info: string            // Altfeld, nur noch lesend als Fallback für phone/email
  phone: string
  email: string
  street: string
  houseNumber: string
  zip: string
  city: string
  country: string
  check_in: string                // "YYYY-MM-DD"
  check_out: string                // "YYYY-MM-DD" — Abreisetag, kein +1 (siehe unten)
  ferry_time: string               // Anreise-Fähre "HH:MM"
  ferry_time_departure: string     // Abreise-Fähre "HH:MM"
  is_paid: boolean                 // bei status "storniert" wiederverwendet für "Stornogebühren bezahlt"
  adults: number
  children: number
  kinderAlter: number[]
  dogCount: number                 // 0–3
  kinderbett: boolean
  babybett: boolean                 // NUR Haus Anne
  rausfallschutz: boolean
  kinderstuhl: boolean
  price: number                     // regulärer Preis — bleibt bei Stornierung als Referenz erhalten
  priceIsManual: boolean
  priceBreakdown?: PriceBreakdown    // nur gesetzt wenn automatisch berechnet
  cancellationFee: number           // Stornogebühren bei status "storniert"
  channel: string
  ical_uid: string
  notes: string
  source: "manual" | "blocked" | "ical"
  userId: string
  created_at: string
  updated_at: string
  deletedAt: string | null          // Soft-Delete
}
```

**`bookings/{bookingId}/history/{historyId}`** — Änderungshistorie je Buchung. `changes: FieldChange[]`, `note?`, `userId`, `userEmail?` (löst sich in der UI über `allowedUsers.displayName` in einen Klarnamen auf), `created_at`.

**`guests/{email}`** — ein Dokument pro Person (Doc-ID = normalisierte lowercase E-Mail), aktualisiert bei jedem Speichern einer Buchung mit E-Mail. Enthält Adresse, `personNotes` (personenbezogen, nicht buchungsbezogen), `marketingConsent`. Beim Anlegen einer neuen Buchung schlägt die App bereits bekannte Gäste anhand der E-Mail vor.

**`houseSettings/{houseId}`** (`haus-anne` | `upstalsboom`) — Stammdaten je Haus für die PDF-Bestätigung: Adresse, Bankdaten (nur hier, nie im Code!), `contactEmail` (Absender für Buchungsbestätigungen & Änderungsbenachrichtigungen), `notifyEmail` (Empfänger für Änderungs-/Stornierungsbenachrichtigungen), Check-in/-out-Zeiten, Stornotext.

**`priceSettings/{groupId}`** — Saisonpreise je Preisgruppe (`kamin`, `terrasse`, `anne-1`…`anne-5`), nach Jahr.

**`icalFeeds/{feedId}`** — externe iCal-Feed-URLs. `userId`, `property_id`, `name`, `url`, `last_synced`.

**`allowedUsers/{email}`** — Whitelist + Rollen. Doc-ID = lowercase E-Mail. Felder: `email`, `displayName` (für Historie/Anzeige), `role: "admin" | "viewer"` (fehlt = admin, für Altbestand).

**`mail_anne/{docId}`, `mail_upstalsboom/{docId}`** — Mail-Warteschlangen der "Trigger Email"-Extension (je Haus getrennt, eigene SMTP-Zugangsdaten). Client schreibt nur (`allow create`), Extension verarbeitet und versendet.

### BookingStatus (Workflow)
```
anfrage                 — hellgrau  — Anfrage eingegangen, unbestätigt
reserviert               — dunkelgrau — Anfrage beim Mieter, wartet auf Rückmeldung
bestaetigt                — blau     — bestätigt, Bestätigung verschickt
vertrag_unterschrieben    — türkis   — Vertrag unterschrieben zurück, noch nicht bezahlt
bezahlt                    — grün    — Zahlung eingegangen
problem                    — gelb    — z.B. falscher Betrag
abgeschlossen               — dunkelgrün — ausgecheckt
storniert                   — grau, schraffiert — Gast storniert, ggf. mit Stornogebühren
```
Reihenfolge/Farben/Badges zentral in `src/lib/bookingStatus.ts` (`STATUS_ORDER`, `STATUS_CONFIG`, `CONFIRMED_STATUSES`, `NUMBERED_STATUSES`).

Besonderheiten:
- Sprung von `bestaetigt`/`reserviert`/`anfrage` direkt auf `bezahlt` (Zwischenschritt "Vertrag unterschrieben" übersprungen) löst eine kurze Rückfrage aus.
- `storniert` steht in `STATUS_ORDER` bewusst ganz am Ende (nicht in der normalen Fortschrittskette) — von überall aus direkt anwählbar, kein ungewollter "Status zurücksetzen?"-Dialog.
- Stornierte Buchungen: Zeitraum fällt komplett aus der Kollisionsprüfung (`findCollision`/`hasCollision` in `bookingDrag.ts` prüfen den Status beider Seiten), zählen nicht zur Auslastung, werden im Kalender als dünner, schraffierter Streifen dargestellt (Grün/Grau je nach `is_paid` = Stornogebühren bezahlt), verschwinden nie hinter einer neuen Buchung im selben Zeitraum.

---

## Firestore Security Rules (aktuell, Muster)

Rollen-basiert statt pro-Nutzer, über die `allowedUsers`-Collection:

```
function isSignedIn() { return request.auth != null; }
function myRole() {
  return exists(/databases/$(database)/documents/allowedUsers/$(request.auth.token.email.lower()))
    ? get(/databases/$(database)/documents/allowedUsers/$(request.auth.token.email.lower())).data.get('role', 'admin')
    : 'none';
}
function isAdmin() { return isSignedIn() && myRole() != 'viewer' && myRole() != 'none'; }
```
Angewendet als `allow read: if isSignedIn(); allow create, update, delete: if isAdmin();` auf `bookings` (+ `history`), `icalFeeds`, `priceSettings`, `houseSettings`, `guests`. `allowedUsers` bleibt `allow read: if true; allow write: if false;` (öffentlich lesbar für den Pre-Login-Whitelist-Check, nur über die Console änderbar). `mail_anne`/`mail_upstalsboom`: `allow create: if isSignedIn();`, sonst gesperrt.

**Wichtig:** Diese Regeln sind nur in der Firebase Console gepflegt, **nicht** im Repo versioniert (kein `firestore.rules` eingecheckt). Bei Änderungen direkt in der Console anpassen.

---

## Autorisierung / Rollen

- Nur E-Mails in `allowedUsers` können sich registrieren/einloggen (`src/lib/whitelist.ts` → `isEmailAllowed`).
- Rolle **admin** (Standard, auch wenn `role`-Feld fehlt): volle Rechte.
- Rolle **viewer**: nur Lesezugriff — Bearbeiten/Löschen/Drag & Drop im Kalender, Neue-Buchung-Button, Einstellungen-Formulare sind gesperrt (`useUserRole()`-Hook, geprüft in `BookingModal`, `CalendarGrid`, `SingleCalendarView`, `Calendar`, `Bookings`, `Guests`, `Trash`, `HouseSettings`, `PriceSettings`).
- Neue Nutzer (admin oder viewer) werden einfach als neues Dokument in `allowedUsers` mit passendem `role`-Feld angelegt.

---

## Seiten / Routes

| Route | Komponente | Beschreibung |
|---|---|---|
| `/` | `Home` | Dashboard / Startseite |
| `/calendar` | `Calendar` | Kalenderansichten (Übersicht + Einzelansicht, Haus-Filter) |
| `/bookings` | `Bookings` | Buchungsliste mit Filtern |
| `/analytics` | `Analytics` | Umsatz/Auslastung, Haus-Filter |
| `/guests` | `Guests` | Gästeverwaltung |
| `/trash` | `Trash` | Gelöschte Buchungen (Soft-Delete) |
| `/settings` | `Settings` | iCal, Export, Konto |
| `/settings/preise` | `PriceSettings` | Saisonpreise je Wohnungsgruppe |
| `/settings/haeuser` | `HouseSettingsPage` | Haus-Konfiguration (Adresse, Bankdaten, Kontakt-/Benachrichtigungs-E-Mail) |
| `/seed` | `Seed` | Testdaten einfügen (nur Entwicklung) |
| `/login` | `Login` | Login, "Passwort vergessen?", Passwort ein-/ausblenden |
| `/register` | `Register` | Registrierung (Whitelist-geschützt) |

---

## Kalender-Features

### CalendarGrid (Übersicht)
- Alle Wohnungen gleichzeitig, Wochenraster, optionaler Haus-Filter (Alle/Upstalsboom/Haus Anne — derselbe Regler wie bei Analytics, per `properties`-Prop an `CalendarGrid` gereicht)
- Drag & Drop (Move/Resize) mit Live-Kollisionserkennung
- Drag-Erstellen (über Tage ziehen → neue Buchung): Anreise-/Abreisedatum entsprechen exakt den gezogenen Tagen, keine Verschiebung (siehe "Wichtige technische Details" zu `toLocalISO`)

### SingleCalendarView (Einzelansicht)
- Monatsraster, eine Wohnung, 2D-Grid, gleiche Drag&Drop-/Kollisionslogik wie oben

### Fähr-Segment-System
- 5 Tages-Segmente `[0, 9, 12, 15, 18]` Uhr, Buchungsbalken beginnen/enden je nach Fährzeit visuell im passenden Segment (`src/lib/daySegments.ts`)
- `check_out` ist der Abreisetag selbst, **kein** Tag danach — kritisch für Rendering und Kollisionsprüfung

---

## iCal-Synchronisierung

- Externe Plattformen (Ferienwohnungen.de, Baltrumdirekt.de, Airbnb, Booking.com) als iCal-Feed hinterlegbar, manuelles "Jetzt synchronisieren"
- Importierte Buchungen: `source: "ical"`, `ical_uid` für Deduplizierung
- Beim Resync werden Kontakt-/Adress-/Namensfelder bestehender iCal-Buchungen **nicht** überschrieben (nur Daten/Status kommen aus dem Feed)
- `src/lib/ical.ts`, `src/hooks/useIcalFeeds.ts`

---

## Buchungsbestätigung (PDF)

- Erzeugt in `src/lib/pdfConfirmation.ts` (`generateConfirmationPdf`), aus dem BookingModal heraus ("Bestätigung erstellen")
- Ein Template für beide Häuser, mit Verzweigungen anhand `house.id`/Preisgruppe (Anrede-Text, Babybett-Option nur bei Haus Anne)
- GiroCode/EPC-QR-Code für die Überweisung (Banking-App scannt Empfänger/IBAN/Betrag/Verwendungszweck automatisch)
- **Echte ausfüllbare PDF-Formularfelder** (pdf-lib `createTextField`): Anschrift, Telefonnummer, E-Mail, "Sonstiges", Fährzeiten, Datum/Ort in der Unterschriftszeile — jeweils nur interaktiv wenn der Wert noch nicht bekannt ist, sonst gedruckt (Prinzip: Gedrucktes = von uns bekannt, leeres Feld = Gast trägt ein)
- Klickt man "Bestätigung erstellen" mit ungespeicherten Änderungen im Formular, wird zuerst automatisch gespeichert (inkl. gewohnter Änderungs-/Kollisionsbestätigung) und danach die PDF mit den aktuellen Daten erzeugt — nie mit veralteten Werten
- Ablage der erzeugten PDF in Firebase Storage (`confirmations/{bookingId}/...`), Download-/E-Mail-Buttons im BookingModal; Upload läuft unabhängig vom UI-Loading-State mit 20s-Timeout
- Gäste können eigene/unterschriebene PDFs hochladen (`confirmations/{id}/own/`, `confirmations/{id}/signed/`)

---

## Gäste-Verwaltung

- `guests`-Collection (siehe Datenmodell), gepflegt über `src/hooks/useGuests.ts`
- Beim Anlegen einer neuen Buchung: Vorschlag "Gast bekannt" bei Treffer auf die E-Mail, Name-Kollisions-Hinweis
- Bearbeiten in der Gäste-Übersicht (`GuestEditModal`) propagiert Name/Telefon/Adresse in **alle** Buchungen dieses Gasts (Firestore-Transaktion)
- `personNotes`/`marketingConsent` sind Gast-Stammdaten (nicht pro Buchung); Newsletter-Checkbox in der PDF entfällt automatisch, wenn bereits Einwilligung vorliegt

---

## Weitere Features

### Buchungshistorie
- Jede Änderung wird in der Subcollection `history` gespeichert, inkl. Nutzer (Klarname aus `allowedUsers.displayName`), mit "Wiederherstellen"-Funktion pro Eintrag
- `src/lib/bookingHistory.ts`, `src/hooks/useBookingHistory.ts`, `src/components/BookingHistoryPanel.tsx`

### Soft-Delete / Papierkorb
- Buchungen werden nicht gelöscht, sondern `deletedAt` gesetzt, wiederherstellbar über `/trash`

### Datensicherung / Export
- Manueller JSON-Export aller Buchungen inkl. History/iCal-Feeds über Einstellungen (`src/lib/backupExport.ts`)
- **Automatisches tägliches Firestore-Backup** (Cloud Function, siehe unten) — zusätzliche, unabhängige Absicherung

### Buchungsnummern
- Format `PREFIX-JAHR-NNNN` (`UPS`/`ANNE`), NNNN zufällig **1000–9999** (bewusst nicht ab 0001, damit die Nummer nicht verrät, die wievielte Buchung im Jahr es war), kollisionsfrei geprüft gegen bekannte Nummern (Prüfung läuft client-seitig — bei zwei gleichzeitigen Speicherungen für dasselbe Haus theoretisch nicht 100% garantiert, praktisch bei diesem Nutzerkreis vernachlässigbar)
- Wird automatisch vergeben, sobald eine Buchung erstmals einen Status aus `NUMBERED_STATUSES` erreicht (`bestaetigt`, `vertrag_unterschrieben`, `bezahlt`, `problem`, `abgeschlossen`, `storniert`) — nicht für reine Anfragen/Reservierungen. Einmal vergeben bleibt die Nummer erhalten, auch bei späterem Zurücksetzen des Status. Wird sofort im Formular sichtbar, egal ob per Schnellaktion oder direktem Statuswechsel (auch bei übersprungenen Zwischenschritten).
- `src/lib/bookingNumber.ts`

### E-Mail-Benachrichtigung bei kurzfristigen Änderungen
- Bei Buchungen, deren Aufenthalt sich mit "heute bis +10 Tage" überschneidet, UND relevante Felder geändert werden (Daten, Fährzeiten, Personen, Hund, Notizen) bzw. bei Neuanlage/Stornierung: Bestätigungsdialog ("Ja, senden"/"Nein") vor drei Aktionen — Speichern im BookingModal, Drag & Drop im Kalender (nach Drop), Löschen/Stornieren
- Bei "Ja": Mail über die Firebase Extension "Trigger Email" (Absender = `houseSettings.contactEmail`, Empfänger = `houseSettings.notifyEmail`, Betreff mit "Achtung ..."-Präfix zur Unterscheidung von echten Gäste-Mails)
- `src/lib/bookingNotify.ts`, `src/lib/notifyEmail.ts`, `src/components/NotifyDialog.tsx`

### Automatisches Firestore-Backup
- Cloud Function `dailyFirestoreBackup` (`functions/src/index.ts`), Region `europe-west3`, läuft täglich 03:00 Europe/Berlin
- Firestore-Admin-Export (alle Collections) nach `gs://traumferienwohnung-manager-backups/daily/YYYY-MM-DD/`
- Am 1. Januar zusätzlich ein unabhängiger Export nach `yearly/YYYY/` (eigener Export statt Kopie — bei dieser Datenmenge vernachlässigbar teurer, einfacher/robuster)
- Aufräum-Regel (GCS Object Lifecycle, nur auf Präfix `daily/`) manuell in der Cloud Console gepflegt, nicht im Code — `yearly/` bleibt davon unberührt

### Login
- "Passwort vergessen?" über `sendPasswordResetEmail` (Firebase Auth, kein eigener Mailversand)
- Augen-Symbol zum Ein-/Ausblenden des eingegebenen Passworts (Login + Registrierung)

---

## Was noch fehlt / mögliche nächste Features

- **Keine automatisierten Tests** — jede Änderung wird manuell verifiziert, kein Test-Suite vorhanden
- **`firestore.rules` nicht versioniert** — nur in der Firebase Console, kein Diff/Rollback über Git möglich
- **Keine Staging-/Test-Umgebung** — Entwicklung läuft direkt gegen die Produktiv-Datenbank (bewusst so belassen, siehe Session-Diskussion; Papierkorb/Historie/Backup fangen die meisten Risiken ab)
- Automatische (statt manuelle) iCal-Synchronisierung
- Analytics/Guests: Umfang deckt aktuelle Bedürfnisse, könnte aber noch wachsen

---

## Wichtige technische Details

- `.env` darf NIE committed werden (`.gitignore` schützt sie); Firebase-Konfiguration nur über `VITE_FIREBASE_*`-Umgebungsvariablen
- `check_out` ist der Abreisetag selbst, NICHT der Tag danach — kritisch für Drag & Drop, Kollisionsprüfung und Kalender-Erstellen-per-Ziehen
- **Niemals `toISOString()` für lokale Kalendertage verwenden** — konvertiert nach UTC und verschiebt das Datum in Zeitzonen mit positivem UTC-Offset (Deutschland) um einen Tag zurück. Stattdessen lokale Y/M/D-Extraktion (`toLocalISO`-Helfer, mehrfach im Code vorhanden, z.B. `Calendar.tsx`, `SingleCalendarView.tsx`). Timestamps (`created_at`/`updated_at`/`last_synced`) sind davon ausgenommen — dort ist `toISOString()` korrekt, weil ein echter Zeitpunkt gemeint ist, kein Kalendertag.
- `spansOverlap()` in `bookingDrag.ts` berücksichtigt Fährzeiten bei gemeinsamen Übergangstagen (Abreise + Anreise am selben Tag ist kein Konflikt, wenn die Segmente passen) und schließt stornierte Buchungen auf beiden Seiten aus
- `STATUS_ORDER` (Vorwärts-/Rückwärts-Dialoge) und `NUMBERED_STATUSES` (Buchungsnummer-Vergabe) sind bewusst getrennte Listen in `bookingStatus.ts` — `storniert` steht in `STATUS_ORDER` nur aus Dialog-Gründen ganz hinten, das hat nichts mit der Nummernvergabe-Reihenfolge zu tun
- Bankdaten/Kontaktdaten liegen ausschließlich in Firestore (`houseSettings`), nie im Quellcode
