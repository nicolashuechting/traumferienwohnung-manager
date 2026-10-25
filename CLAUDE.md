# Hinweise für Claude

- **Die App liegt in `frontend-new/`** (Vite/React, Firebase). Der alte Ordner `frontend/` und das frühere Projekt `~/Desktop/insel-booking-blick` sind Vorgänger und werden nicht mehr benutzt.
- Die Testdaten-Seite `/seed` ist abgeschaltet (schrieb in die echte Datenbank) — nicht wieder einbinden.

- **iCal-Import ist abgeschaltet** (seit Okt. 2026, `ICAL_IMPORT_ENABLED` in `frontend-new/src/lib/features.ts`). Neue Buchungen kommen nicht mehr über iCal-Feeds, sondern werden manuell angelegt. Ältere Buchungen mit `source: "ical"` sind Altbestand aus früheren Importen.
- **Fährzeiten bestimmen die Kalenderbalken nicht mehr** (`FERRY_TIMES_IN_CALENDAR`): Anreise immer 15:00, Abreise 10:00. Fährzeiten bleiben in Buchung und PDF erhalten.
- **Buchungsbestätigung = Rechnung** mit fortlaufenden Nummern `AN-/UB-<Anreisejahr>-0001` (Zähler in `houseSettings/<haus>.invoiceCounters`, siehe `frontend-new/src/lib/invoice.ts`). Lokal (`npm run dev`) läuft alles im Testmodus mit `TEST-`-Nummern und eigenen Ordnern.
- **"Bezahlt" ergibt sich aus dem Status** (Bezahlt/Abgeschlossen); `is_paid` bedeutet nur bei stornierten Buchungen "Stornogebühren bezahlt".
- Firestore-Regeln liegen nur in der Firebase Console (nicht im Repo); neue Collections sind dort gesperrt.
- Das Browser-Fenster in der Claude-App unterdrückt `confirm()`-Dialoge – App-Abläufe mit Rückfragen im normalen Browser testen.
- Der User ist kein Entwickler: auf Deutsch und in einfacher Sprache erklären.
