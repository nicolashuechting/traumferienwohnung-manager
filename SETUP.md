# Setup-Anleitung

## Voraussetzungen

- Node.js 18+
- Firebase Account (kostenlos auf firebase.google.com)
- Git

## Schritt 1: Repository clonen

```bash
git clone https://github.com/nicolashuechting/traumferienwohnung-manager.git
cd traumferienwohnung-manager
```

## Schritt 2: Firebase Setup

1. Gehe zu [firebase.google.com](https://firebase.google.com)
2. Erstelle ein neues Projekt oder nutze deins
3. Aktiviere:
   - Firestore Database (Realtime)
   - Authentication (Email/Passwort + Email-Verifikation)
4. Kopiere deine Firebase Config in `frontend/.env.local`

```env
REACT_APP_FIREBASE_API_KEY=your_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

## Schritt 3: Frontend installieren

```bash
cd frontend
npm install
npm start
```

App läuft auf `http://localhost:3000`
