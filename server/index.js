require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const calendar = require('./calendar');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.CLIENT_URL}/auth/callback`,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const data = db.read();
    let user = data.users.find(u => u.google_id === profile.id);
    if (!user) {
      user = {
        id: uuidv4(),
        google_id: profile.id,
        email: profile.emails?.[0]?.value,
        name: profile.displayName,
        avatar: profile.photos?.[0]?.value,
        access_token: accessToken,
        refresh_token: refreshToken,
        created_at: new Date().toISOString(),
      };
      data.users.push(user);
    } else {
      user.access_token = accessToken;
      user.refresh_token = refreshToken;
      user.name = profile.displayName;
      user.avatar = profile.photos?.[0]?.value;
    }
    db.write(data);
    done(null, user);
  } catch (err) {
    done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const data = db.read();
  const user = data.users.find(u => u.id === id);
  done(null, user || null);
});

app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar'],
  accessType: 'offline',
  prompt: 'consent',
}));

app.get('/auth/callback', passport.authenticate('google', {
  successRedirect: `${process.env.CLIENT_URL}/`,
  failureRedirect: `${process.env.CLIENT_URL}/login`,
}));

app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ id: req.user.id, email: req.user.email, name: req.user.name, avatar: req.user.avatar });
});

app.get('/api/logout', (req, res) => {
  req.logout(() => res.redirect(process.env.CLIENT_URL));
});

// ---- Routines ----

app.get('/api/routines', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const data = db.read();
  const routines = data.routines.filter(r => r.user_id === req.user.id).sort((a, b) => a.time.localeCompare(b.time));
  res.json(routines);
});

app.post('/api/routines', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { title, time, duration, description, show_on_calendar } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const data = db.read();
  const routine = {
    id: uuidv4(),
    user_id: req.user.id,
    title,
    time: time || '09:00',
    duration: duration || 60,
    description: description || '',
    show_on_calendar: show_on_calendar !== undefined ? (show_on_calendar ? 1 : 0) : 1,
    created_at: new Date().toISOString(),
  };
  data.routines.push(routine);
  db.write(data);
  res.json(routine);
});

app.put('/api/routines/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const data = db.read();
  const idx = data.routines.findIndex(r => r.id === req.params.id && r.user_id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Routine not found' });

  const r = data.routines[idx];
  const oldShow = r.show_on_calendar;
  const updates = req.body;
  if (updates.title !== undefined) r.title = updates.title;
  if (updates.time !== undefined) r.time = updates.time;
  if (updates.duration !== undefined) r.duration = updates.duration;
  if (updates.description !== undefined) r.description = updates.description;
  if (updates.show_on_calendar !== undefined) r.show_on_calendar = updates.show_on_calendar ? 1 : 0;

  if (updates.show_on_calendar !== undefined && r.show_on_calendar !== oldShow) {
    const events = data.routine_events.filter(e => e.routine_id === r.id);
    if (!r.show_on_calendar) {
      for (const ev of events) {
        if (ev.google_event_id) {
          try { await calendar.deleteEvent(req.user, ev.google_event_id); } catch (e) { console.error('Delete error:', e.message); }
        }
      }
      data.routine_events = data.routine_events.filter(e => e.routine_id !== r.id);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      await syncRoutineToCalendar(req.user, r, today);
    }
  }

  db.write(data);
  res.json(r);
});

app.delete('/api/routines/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const data = db.read();
  const idx = data.routines.findIndex(r => r.id === req.params.id && r.user_id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Routine not found' });

  const events = data.routine_events.filter(e => e.routine_id === req.params.id);
  for (const ev of events) {
    if (ev.google_event_id) {
      try { await calendar.deleteEvent(req.user, ev.google_event_id); } catch (e) { console.error('Delete error:', e.message); }
    }
  }
  data.routine_events = data.routine_events.filter(e => e.routine_id !== req.params.id);
  data.routines.splice(idx, 1);
  db.write(data);
  res.json({ success: true });
});

// ---- Calendar Sync ----

async function syncRoutineToCalendar(user, routine, date, errors) {
  const data = db.read();
  let ev = data.routine_events.find(e => e.routine_id === routine.id && e.date === date);

  try {
    if (ev) {
      if (ev.google_event_id) {
        await calendar.updateEvent(user, ev.google_event_id, {
          title: routine.title, date, time: routine.time,
          duration: routine.duration, description: routine.description,
        });
      } else {
        const created = await calendar.createEvent(user, {
          title: routine.title, date, time: routine.time,
          duration: routine.duration, description: routine.description,
        });
        ev.google_event_id = created.id;
        db.write(data);
      }
    } else {
      const created = await calendar.createEvent(user, {
        title: routine.title, date, time: routine.time,
        duration: routine.duration, description: routine.description,
      });
      data.routine_events.push({
        id: uuidv4(),
        routine_id: routine.id,
        user_id: user.id,
        date,
        google_event_id: created.id,
        created_at: new Date().toISOString(),
      });
      db.write(data);
    }
  } catch (err) {
    console.error(`Sync error for "${routine.title}":`, err.message);
    if (errors) errors.push({ routine: routine.title, error: err.message });
  }
}

app.post('/api/sync-date', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required' });

  const data = db.read();
  const routines = data.routines.filter(r => r.user_id === req.user.id && r.show_on_calendar === 1);

  const errors = [];
  await Promise.all(routines.map(r => syncRoutineToCalendar(req.user, r, date, errors)));

  const data2 = db.read();
  const events = data2.routine_events
    .filter(e => e.user_id === req.user.id && e.date === date)
    .map(e => {
      const r = data2.routines.find(rr => rr.id === e.routine_id);
      return { ...e, title: r?.title, time: r?.time, duration: r?.duration, description: r?.description, show_on_calendar: r?.show_on_calendar };
    });

  res.json({ events, synced: routines.length - errors.length, errors: errors.length > 0 ? errors : undefined });
});

app.get('/api/events/:date', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const data = db.read();
  const events = data.routine_events
    .filter(e => e.user_id === req.user.id && e.date === req.params.date)
    .map(e => {
      const r = data.routines.find(rr => rr.id === e.routine_id);
      return { ...e, title: r?.title, time: r?.time, duration: r?.duration, description: r?.description, show_on_calendar: r?.show_on_calendar };
    });
  res.json(events);
});

// ---- Voice: parse natural language into a routine ----

app.post('/api/voice-routine', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });

  let time = '09:00';
  let title = text.trim();

  const timePatterns = [
    { re: /\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i, fn: (m) => ({ h: +m[1], m: m[2], ap: m[3] }) },
    { re: /\b(\d{1,2}):(\d{2})\b/i, fn: (m) => ({ h: +m[1], m: m[2], ap: null }) },
    { re: /\b(\d{1,2})\s*(am|pm)\b/i, fn: (m) => ({ h: +m[1], m: '00', ap: m[2] }) },
    { re: /\b(\d{1,2})\b/i, fn: (m) => ({ h: +m[1], m: '00', ap: null }) },
  ];

  for (const { re, fn } of timePatterns) {
    const m = title.match(re);
    if (m) {
      const { h, m: min, ap } = fn(m);
      if (h >= 1 && h <= 12 && +min <= 59) {
        let hour = h;
        if (ap?.toLowerCase() === 'pm' && h < 12) hour += 12;
        if (ap?.toLowerCase() === 'am' && h === 12) hour = 0;
        if (!ap && h <= 12 && h >= 5) hour = h < 12 ? h + 12 : h;
        time = `${String(hour).padStart(2, '0')}:${min}`;
        title = title.replace(m[0], '').trim();
      }
      break;
    }
  }

  title = title.replace(/\b(at|from|to|for|by|after|before)\b/gi, '').replace(/\s+/g, ' ').trim();
  if (!title) title = 'New routine';
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const data = db.read();
  const routine = {
    id: uuidv4(),
    user_id: req.user.id,
    title: title || 'New routine',
    time,
    duration: 60,
    description: '',
    show_on_calendar: 1,
    created_at: new Date().toISOString(),
  };
  data.routines.push(routine);
  db.write(data);
  res.json(routine);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
