const { google } = require('googleapis');

function getAuth(account) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.CLIENT_URL}/auth/callback`
  );
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });
  return oauth2Client;
}

async function createEvent(account, { title, date, time, duration, description }) {
  const auth = getAuth(account);
  const calendar = google.calendar({ version: 'v3', auth });

  const start = new Date(`${date}T${time}:00`);
  const end = new Date(start.getTime() + (duration || 60) * 60000);

  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: title,
      description: description || '',
      start: { dateTime: start.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: { dateTime: end.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    },
  });
  return res.data;
}

async function deleteEvent(account, googleEventId) {
  const auth = getAuth(account);
  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId });
}

async function updateEvent(account, googleEventId, { title, date, time, duration, description }) {
  const auth = getAuth(account);
  const calendar = google.calendar({ version: 'v3', auth });

  const start = new Date(`${date}T${time}:00`);
  const end = new Date(start.getTime() + (duration || 60) * 60000);

  const res = await calendar.events.update({
    calendarId: 'primary',
    eventId: googleEventId,
    requestBody: {
      summary: title,
      description: description || '',
      start: { dateTime: start.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: { dateTime: end.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    },
  });
  return res.data;
}

module.exports = { createEvent, deleteEvent, updateEvent };
