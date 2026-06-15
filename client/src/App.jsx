import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [routines, setRoutines] = useState([])
  const [events, setEvents] = useState([])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [recording, setRecording] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', time: '09:00', duration: 60, description: '' })

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u) setUser(u) })
  }, [])

  useEffect(() => {
    if (!user) return
    fetchRoutines()
    loadEvents()
  }, [user, date])

  function fetchRoutines() {
    fetch('/api/routines', { credentials: 'include' })
      .then(r => r.json())
      .then(setRoutines)
  }

  function loadEvents() {
    fetch(`/api/events/${date}`, { credentials: 'include' })
      .then(r => r.json())
      .then(setEvents)
  }

  function syncDate() {
    setSyncMsg(null)
    fetch('/api/sync-date', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    })
      .then(r => r.json())
      .then(data => {
        setEvents(data.events || [])
        fetchRoutines()
        if (data.errors) {
          setSyncMsg({ type: 'error', text: data.errors.map(e => `${e.routine}: ${e.error}`).join('; ') })
        } else {
          setSyncMsg({ type: 'success', text: `Synced ${data.synced} routine(s) to calendar` })
        }
        setTimeout(() => setSyncMsg(null), 5000)
      })
      .catch(() => setSyncMsg({ type: 'error', text: 'Sync request failed' }))
  }

  function addRoutine() {
    fetch('/api/routines', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
      .then(r => r.json())
      .then(() => {
        setShowForm(false)
        setForm({ title: '', time: '09:00', duration: 60, description: '' })
        fetchRoutines()
      })
  }

  function toggleCalendar(routine) {
    fetch(`/api/routines/${routine.id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_on_calendar: !routine.show_on_calendar }),
    })
      .then(r => r.json())
      .then(() => fetchRoutines())
  }

  function deleteRoutine(id) {
    fetch(`/api/routines/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    }).then(() => {
      fetchRoutines()
      loadEvents()
    })
  }

  function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return alert('Voice input not supported in this browser')
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    let done = false
    setRecording(true)
    recognition.onresult = (e) => {
      if (done) return
      done = true
      recognition.stop()
      const text = Array.from(e.results).map(r => r[0].transcript).join(' ')
      fetch('/api/voice-routine', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
        .then(r => r.json())
        .then(() => {
          fetchRoutines()
          setRecording(false)
        })
    }
    recognition.onend = () => setRecording(false)
    recognition.onerror = () => { done = true; setRecording(false) }
    recognition.start()
  }

  if (!user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Daily Routine</h1>
          <p>Sync your routines to Google Calendar</p>
          <a href="/auth/google" className="google-btn">
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.54 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 0 0 0 24c0 3.77.87 7.35 2.56 10.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Sign in with Google
          </a>
        </div>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <h1>Daily Routines</h1>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="date-picker" />
        </div>
        <div className="header-right">
          {user.avatar && <img src={user.avatar} alt="" className="avatar" />}
          <span className="user-name">{user.name}</span>
          <a href="/api/logout" className="logout-btn">Logout</a>
        </div>
      </header>

      <main>
        <section className="toolbar">
          <button className="btn primary" onClick={() => setShowForm(true)}>+ New Routine</button>
          <button className={`btn voice-btn ${recording ? 'recording' : ''}`} onClick={startVoice}>
            {recording ? 'Listening...' : '🎤 Voice Input'}
          </button>
          {date >= today && (
            <button className="btn outline" onClick={syncDate}>
              ☀ Sync to Calendar
            </button>
          )}
          {syncMsg && (
            <span className={`sync-msg ${syncMsg.type}`}>{syncMsg.text}</span>
          )}
        </section>

        {showForm && (
          <div className="modal">
            <div className="modal-content">
              <h2>New Routine</h2>
              <input placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
              <input type="number" placeholder="Duration (min)" value={form.duration} onChange={e => setForm({ ...form, duration: +e.target.value })} />
              <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              <div className="modal-actions">
                <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn primary" onClick={addRoutine}>Add</button>
              </div>
            </div>
          </div>
        )}

        <div className="columns">
          <div className="col">
            <h2>Routines</h2>
            <p className="col-sub">Enable to show on calendar</p>
            <div className="routine-list">
              {routines.map(r => (
                <div key={r.id} className="routine-card">
                  <label className="toggle">
                    <input type="checkbox" checked={!!r.show_on_calendar} onChange={() => toggleCalendar(r)} />
                    <span className="slider"></span>
                  </label>
                  <div className="routine-info">
                    <strong>{r.title}</strong>
                    <span className="routine-time">{r.time} · {r.duration}min</span>
                    {r.description && <p className="routine-desc">{r.description}</p>}
                  </div>
                  <button className="delete-btn" onClick={() => deleteRoutine(r.id)}>✕</button>
                </div>
              ))}
              {routines.length === 0 && <p className="empty">No routines yet. Add one!</p>}
            </div>
          </div>

          <div className="col">
            <h2>Calendar Events</h2>
            <p className="col-sub">{date}</p>
            <div className="routine-list">
              {events.map(ev => (
                <div key={ev.id} className="event-card">
                  <div className="event-dot"></div>
                  <div className="routine-info">
                    <strong>{ev.title}</strong>
                    <span className="routine-time">{ev.time} · {ev.duration}min</span>
                    {ev.google_event_id && <span className="synced-badge">Synced ✓</span>}
                  </div>
                </div>
              ))}
              {events.length === 0 && <p className="empty">No events for this date.</p>}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
