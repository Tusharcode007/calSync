# calSync — Daily Routine Calendar

Voice-enabled daily routine manager that syncs to Google Calendar.

## How it works

```
User creates a routine ──> Toggle "Show on calendar" ──> Pick a date ──> Sync
                              │
                              ▼
                     Google Calendar event created
```

- **Routines** are recurring tasks (e.g. "Gym at 7am", "Standup at 10:30") with a title, time, and duration
- Each routine has a **`[ ] Show on calendar` checkbox** — when enabled, it acts as an "external date" marker in your Google Calendar
- Select any date and click **Sync to Calendar** to push all enabled routines as calendar events
- **Voice input** lets you say "gym at 7pm" or "meeting at 12:30" and it parses the time automatically

## Flow

1. **Sign in with Google** — OAuth 2.0 with Calendar API scope
2. **Create routines** — via form or voice input
3. **Toggle on/off** — each routine's checkbox controls whether it appears on the calendar
4. **Pick a date** — the date picker lets you view/manage any date
5. **Sync** — click "Sync to Calendar" → enabled routines become Google Calendar events
6. **View** — the right panel shows synced events with a ✓ badge

## Tech stack

| Layer | Tech |
|-------|------|
| **Frontend** | React + Vite |
| **Backend** | Node.js + Express |
| **Auth** | Passport.js + Google OAuth 2.0 |
| **Calendar** | Google Calendar API v3 |
| **Voice** | Web Speech API (browser native) |
| **Storage** | JSON file (`data.json`) |
| **Styling** | Plain CSS |

## Setup

1. Enable the **Google Calendar API** at https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=459098609083
2. Create OAuth 2.0 credentials (Web app) with redirect URI `http://localhost:5173/auth/callback`
3. Copy `.env.example` to `.env` and fill in your credentials
4. Run:
   ```bash
   npm run install:all
   npm run dev
   ```
5. Open `http://localhost:5173`

## Project structure

```
├── server/
│   ├── index.js       Express API — auth, routines CRUD, sync, voice parsing
│   ├── calendar.js    Google Calendar helpers (create/update/delete events)
│   └── db.js          JSON file read/write
├── client/
│   └── src/
│       ├── App.jsx    Main UI — login, routine list, calendar events, voice
│       └── App.css    Styling
└── data.json          Auto-created local data (gitignored)
```
