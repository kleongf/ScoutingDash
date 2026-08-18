# Scouting Dashboard

A React/TypeScript dashboard for running an FRC scouting workflow. It loads event schedules and teams from The Blue Alliance, stores competition and scouting data in Firestore, imports QR-coded scouting records, calculates team metrics/OPR, and supports pit scouting and draggable picklists.

## Features

- load a real TBA event or generate a deterministic test competition
- browse qualification and practice matches
- scan and parse scouting QR codes
- inspect team pages, match history, and calculated metrics
- record pit-scouting data
- rank teams in a drag-and-drop picklist
- seed and update competition data in Firestore

## Setup

1. Install Node.js 20 or newer and dependencies:

   ```bash
   npm install
   ```

2. Create a local `.env` containing your own credentials:

   ```dotenv
   VITE_TBA_API_KEY=your_tba_read_api_key
   VITE_API_KEY=your_firebase_web_api_key
   VITE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_PROJECT_ID=your-project-id
   VITE_STORAGE_BUCKET=your-project.appspot.com
   VITE_MESSAGING_SENDER_ID=your_sender_id
   VITE_APP_ID=your_app_id
   VITE_MEASUREMENT_ID=your_measurement_id
   ```

   Obtain a TBA Read API key from [The Blue Alliance account page](https://www.thebluealliance.com/account) and the web configuration from Firebase Project Settings. Do not commit `.env` or reuse credentials found in repository history.

3. Start the application:

   ```bash
   npm run dev
   ```

Open the Vite URL, normally [http://localhost:5173](http://localhost:5173).

## Commands

```bash
npm run build
npm run lint
npm run preview
```

Firestore access and security rules must permit the reads and writes performed by the dashboard. The current app does not include an authentication flow, so deploy it only with rules appropriate for your environment.
