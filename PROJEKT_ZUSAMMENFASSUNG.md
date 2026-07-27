# Traumferienwohnung Manager – Projektzusammenfassung

## Was ist das?

Eine Web-App zur Verwaltung von Ferienwohnungsbuchungen auf der Insel Baltrum (Nordsee). Der Besitzer verwaltet mehrere Wohnungen in zwei Häusern und möchte Buchungen übersichtlich planen, tracken und mit externen Buchungsplattformen synchronisieren.

**Live-URL:** https://traumferienwohnung-manager.vercel.app  
**GitHub:** https://github.com/nicolashuechting/traumferienwohnung-manager (privat)  
**Lokales Verzeichnis:** `/Users/nicolashuchting/Desktop/traumferienwohnung-manager/frontend-new/`

---

## Tech-Stack

- **Frontend:** Vite + React 19 + TypeScript + Tailwind CSS v4
- **Backend/Datenbank:** Firebase (Firestore + Firebase Auth) — keine eigene API, alles direkt im Client
- **State Management:** TanStack React Query v5 (queryKey `["bookingsAll"]`)
- **Drag & Drop:** dnd-kit (`@dnd-kit/core`)
- **Deployment:** Vercel (automatisches Redeploy bei git push auf `main`)

---

## Objekte (Wohnungen)

Hardcoded in `src/lib/properties.ts`, zwei Häuser:

**Upstalsboom** (6 Wohnungen, alle hundefreundlich):
- Upstalsboom 1–6 (`ups-1` bis `ups-6`)

**Haus Anne** (5 Wohnungen, teils hundefreundlich):
- Anne 1 (`anne-1`) — Hund erlaubt
- Anne 2 (`anne-2`) — kein Hund
- Anne 3 (`anne-3`) — Hund erlaubt
- Anne 4 (`anne-4`) — kein Hund
- Anne 5 (`anne-5`) — kein Hund

---

## Datenmodell (Firestore)

### Collections

**`bookings/{bookingId}`**
```typescript
{
  id: string
  property_id: string             // z.B. "ups-1"
  booking_number: string          // z.B. "UPS-2026-0001", "" für iCal-Import
  status: BookingStatus           // siehe unten
  guest_name: string
  contact_info: string
  check_in: string                // "YYYY-MM-DD"
  check_out: string               // "YYYY-MM-DD" — INKLUSIV (Rendering: d <= check_out)
  ferry_time: string              // Anreise-Fähre "HH:MM" (Neßmersiel → Baltrum)
  ferry_time_departure: string    // Abreise-Fähre "HH:MM" (Baltrum → Neßmersiel)
  is_paid: boolean
  adults: number
  children: number
  kinderAlter: number[]           // Alter pro Kind, z.B. [3, 7, 10]
  dog: boolean
  kinderbett: boolean
  rausfallschutz: boolean
  kinderstuhl: boolean
  price: number                   // EUR, 0 = nicht angegeben
  channel: string                 // "Manuell" | "Ferienwohnungen.de" | etc.
  ical_uid: string                // iCal UID für Deduplizierung, "" bei manuell
  notes: string
  source: "manual" | "blocked" | "ical"
  userId: string                  // Firebase Auth UID des Erstellers
  created_at: string
  updated_at: string
  deletedAt: string | null        // Soft-Delete: null = aktiv, ISO-String = gelöscht
}
```

**`bookings/{bookingId}/history/{historyId}`** (Subcollection)
- Änderungshistorie jeder Buchung
- Felder: `changes: FieldChange[]`, `note`, `userId`, `created_at`
- `FieldChange`: `{ field, from, to }`

**`icalFeeds/{feedId}`**
- iCal-Feed-URLs für externe Buchungsplattformen
- Felder: `userId`, `property_id`, `name`, `url`, `last_synced`

**`allowedUsers/{email}`**
- Whitelist autorisierter Nutzer
- Dokument-ID = E-Mail in Kleinbuchstaben
- Felder: `email: string`

### BookingStatus (Workflow)
```
anfrage       → hellgrau   — Anfrage eingegangen, unbestätigt
reserviert    → dunkelgrau — Anfrage beim Mieter, wartet auf Rückmeldung
bestaetigt    → blau       — bestätigt, Bestätigung verschickt
bezahlt       → grün       — Zahlung eingegangen
problem       → gelb       — z.B. falscher Betrag
abgeschlossen → dunkelgrün — ausgecheckt
```

---

## Firestore Security Rules (aktuell)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /bookings/{bookingId} {
      allow read, update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      match /history/{historyId} {
        allow read, write: if request.auth != null
            && get(/databases/$(database)/documents/bookings/$(bookingId)).data.userId == request.auth.uid;
      }
    }
    match /icalFeeds/{feedId} {
      allow read, update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
    }
    match /allowedUsers/{email} {
      allow read: if true;   // öffentlich lesbar — für Pre-Login-Whitelist-Check
      allow write: if false; // nur Firebase Console
    }
  }
}
```

**Wichtige Eigenheit:** Die Rules erlauben aktuell jedem Nutzer nur seine EIGENEN Buchungen zu sehen (`userId == request.auth.uid`). Für echten Multi-User-Betrieb (alle sehen alle Buchungen) müsste das auf `request.auth != null` vereinfacht werden.

---

## Autorisierung / Whitelist

- Nur E-Mails in der Firestore-Collection `allowedUsers` können sich registrieren oder einloggen
- Implementiert in `src/lib/whitelist.ts` → `isEmailAllowed(email): Promise<boolean>`
- Registrierung: Prüfung VOR `createUserWithEmailAndPassword` (in `Register.tsx`)
- Login: Prüfung NACH Firebase Auth, bei Ablehnung sofort `signOut` (in `useAuth.ts`)

**Aktuell autorisierte E-Mails:**
- `boombremen@gmail.com`
- `ahuechting@translinkcf.com`
- `nicolashuechting@gmail.com`

---

## Seiten / Routes

| Route | Komponente | Beschreibung |
|---|---|---|
| `/` | `Home` | Dashboard / Startseite |
| `/calendar` | `Calendar` | Kalenderansichten |
| `/bookings` | `Bookings` | Buchungsliste |
| `/analytics` | `Analytics` | Auswertungen |
| `/guests` | `Guests` | Gästeverwaltung |
| `/trash` | `Trash` | Gelöschte Buchungen (Soft-Delete) |
| `/settings` | `Settings` | iCal, Export, Konto |
| `/seed` | `Seed` | Testdaten einfügen (nur Entwicklung) |
| `/login` | `Login` | Login-Formular |
| `/register` | `Register` | Registrierung (Whitelist-geschützt) |

---

## Kalender-Features

### CalendarGrid (Übersicht)
- Zeigt alle Wohnungen gleichzeitig, jede Wohnung eine Zeile
- Wochen-basiertes Raster (horizontal = Tage)
- **Drag & Drop (Move):** Buchung ziehen → verschiebt Zeitraum (delta.x in Tage umrechnen)
- **Drag & Drop (Resize):** Start- oder End-Handle ziehen → verändert nur Anreise/Abreise-Datum
- Kollisionserkennung live während des Ziehens (rote Preview bei Überschneidung)

### SingleCalendarView (Einzelansicht)
- Monatsraster, eine Wohnung auf einmal
- 2D-Grid (Wochen übereinander) — `dateUnderPoint(x, y)` für Tages-Snapping über `elementFromPoint()`
- **Drag & Drop (Move):** `previewDates`-State statt DragOverlay (DragOverlay wurde entfernt, blockierte `elementFromPoint`)
- **Drag & Drop (Resize):** Live-Preview-Bar während Resize
- Kollisionserkennung: grüner/roter Box-Shadow auf Preview-Bar

### Fähr-Segment-System
- Jeder Tag wird in 5 Segmente eingeteilt: `[0, 9, 12, 15, 18]` Uhr
- Buchungsbalken beginnen/enden visuell je nach Fährzeit im entsprechenden Segment
- Implementiert in `src/lib/daySegments.ts`:
  - `segmentIndexOf(hhmm)` → Segment 0–4
  - `arrivalFraction(ferryTime)` → Bruchteil 0–1 für CSS-Positionierung
  - `departureFraction(ferryTimeDeparture)` → dto.
- **check_out ist INKLUSIV** (Rendering: `d <= check_out`), kein +1 nötig

---

## iCal-Synchronisierung

- Externe Buchungsplattformen (Ferienwohnungen.de, Baltrumdirekt.de, Airbnb, Booking.com) können als iCal-Feed eingetragen werden
- Manuelles "Jetzt synchronisieren" in den Einstellungen
- Importierte Buchungen: `source: "ical"`, `ical_uid` für Deduplizierung
- Implementiert in `src/lib/ical.ts` und `src/hooks/useIcalFeeds.ts`

---

## Weitere Features

### Buchungshistorie
- Jede Änderung an einer Buchung wird in der Subcollection `history` gespeichert
- Zeigt welches Feld sich von was zu was geändert hat
- Implementiert in `src/lib/bookingHistory.ts`, `src/hooks/useBookingHistory.ts`
- UI: `src/components/BookingHistoryPanel.tsx`

### Soft-Delete / Papierkorb
- Buchungen werden nicht gelöscht, sondern `deletedAt` gesetzt (ISO-Timestamp)
- Wiederherstellbar über `/trash`

### Datensicherung / Export
- JSON-Export aller Buchungen inkl. History und iCal-Feeds
- Button in Einstellungen → `src/lib/backupExport.ts`

### Buchungsnummern
- Automatische Vergabe: `UPS-2026-0001` (Upstalsboom) / `ANNE-2026-0001` (Haus Anne)
- Implementiert in `src/lib/bookingNumber.ts`

### BookingModal
- Formular für neue/bestehende Buchungen
- Alle Felder des Booking-Typs editierbar
- `src/components/BookingModal.tsx`

---

## Was noch fehlt / mögliche nächste Features

- **Multi-User-Daten sichtbar:** Alle autorisierten Nutzer sehen aktuell nur ihre eigenen Buchungen (Rules-Problem, siehe oben). Für geteilte Verwaltung müsste `userId == request.auth.uid` auf `request.auth != null` geändert werden.
- Analytics-Seite ist vorhanden, aber Umfang unklar
- Guests-Seite ist vorhanden, aber Umfang unklar
- Automatische iCal-Synchronisierung (aktuell manuell)
- Preisberechnung / Abrechnungsfeatures
- Gäste-Kommunikation / E-Mail-Vorlagen

---

## Wichtige technische Details

- `.env` darf NIE committed werden (`.gitignore` schützt sie)
- Firebase-Konfiguration nur über `VITE_FIREBASE_*` Umgebungsvariablen
- `check_out` ist der Abreisetag selbst (inklusiv), NICHT der Tag danach — kritisch für Drag & Drop und Kollisionsprüfung
- Keine UTC-Konvertierung bei Datumsverarbeitung (`T00:00:00` ohne Z anhängen um Zeitzonenverschiebung zu vermeiden)
- `spansOverlap()` in `bookingDrag.ts` berücksichtigt Fährzeiten bei gemeinsamen Übergangstagen (Abreise + Anreise am selben Tag ist kein Konflikt wenn Segmente passen)
