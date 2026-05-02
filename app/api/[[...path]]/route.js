import { NextResponse } from 'next/server'
import admin from 'firebase-admin'
import { v4 as uuidv4 } from 'uuid'
import { Vonage } from '@vonage/server-sdk'

// ---------- Firebase Admin (singleton) ----------
let cachedApp = null
async function getFirestore() {
  if (cachedApp) return admin.firestore()
  
  const projectId = process.env.FIREBASE_PROJECT_ID
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL

  if (!projectId || !privateKey || !clientEmail) {
    throw new Error('Missing Firebase env vars: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL')
  }

  cachedApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      privateKey,
      clientEmail,
    }),
  })
  return admin.firestore()
}

// ---------- Vonage client ----------
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
})
const SENDER_ID = process.env.VONAGE_SENDER_ID || 'Ena Instal'

// ---------- Defaults ----------
const DEFAULT_SETTINGS = {
  id: 'main',
  messageTwoWeeks:
    'Buna ziua {nume}, va reamintim ca peste 2 saptamani (la {data}) este scadenta verificarea tehnica periodica a centralei {model}. Va rugam sa programati verificarea. Ena Instal.',
  messageDueDate:
    'Buna ziua {nume}, astazi ({data}) este data scadenta pentru verificarea tehnica periodica a centralei {model}. Va rugam sa ne contactati pentru programare. Ena Instal.',
  contactPhone: '+40752832309',
}

// ---------- Helpers ----------
function addYears(dateStr, years) {
  const d = new Date(dateStr)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

function formatRoDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

function daysUntil(dateStr) {
  if (!dateStr) return 9999
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((target - today) / (1000 * 60 * 60 * 24))
}

function renderTemplate(tpl, client) {
  return (tpl || '')
    .replaceAll('{nume}', client.name || '')
    .replaceAll('{model}', client.model || '')
    .replaceAll('{data}', formatRoDate(client.dueDate))
    .replaceAll('{adresa}', client.address || '')
    .replaceAll('{telefon}', client.phone || '')
}

function normalizePhone(phone) {
  if (!phone) return ''
  let p = String(phone).replace(/[\s\-\(\)]/g, '')
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith('0') && p.length === 10) p = '40' + p.slice(1)
  return p
}

async function sendVonageSMS({ to, text }) {
  const recipient = normalizePhone(to)
  try {
    const resp = await vonage.sms.send({
      to: recipient,
      from: SENDER_ID,
      text,
    })
    const msg = resp?.messages?.[0] || {}
    if (msg.status === '0') {
      return { ok: true, messageId: msg.messageId || msg['message-id'], raw: resp }
    }
    return {
      ok: false,
      error: msg.errorText || msg['error-text'] || 'Unknown error',
      status: msg.status,
      raw: resp,
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

async function logSMS(db, entry) {
  await db.collection('sms_history').add({
    id: uuidv4(),
    sentAt: new Date().toISOString(),
    ...entry,
  })
}

async function getSettings(db) {
  const doc = await db.collection('settings').doc('main').get()
  if (!doc.exists) {
    await db.collection('settings').doc('main').set(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
  const s = doc.data()
  delete s.id // client doesn't need it
  return s
}

// ---------- Core cron logic ----------
async function runCronChecks(db) {
  const settings = await getSettings(db)
  const snapshot = await db.collection('clients').orderBy('dueDate').get()
  const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  const sent = []
  
  for (const c of clients) {
    const days = daysUntil(c.dueDate)
    if (days <= 14 && days >= 1 && !c.smsTwoWeeksSent) {
      const text = renderTemplate(settings.messageTwoWeeks, c)
      const r = await sendVonageSMS({ to: c.phone, text })
      await logSMS(db, {
        clientId: c.id,
        clientName: c.name,
        phone: c.phone,
        type: '2_weeks',
        message: text,
        status: r.ok ? 'sent' : 'failed',
        error: r.ok ? null : r.error,
        messageId: r.messageId || null,
      })
      if (r.ok) {
        await db.collection('clients').doc(c.id).update({
          smsTwoWeeksSent: true,
          smsCount: admin.firestore.FieldValue.increment(1)
        })
        sent.push({ client: c.name, type: '2_weeks' })
      }
    }
    if (days <= 0 && !c.smsDueDateSent) {
      const text = renderTemplate(settings.messageDueDate, c)
      const r = await sendVonageSMS({ to: c.phone, text })
      await logSMS(db, {
        clientId: c.id,
        clientName: c.name,
        phone: c.phone,
        type: 'due_date',
        message: text,
        status: r.ok ? 'sent' : 'failed',
        error: r.ok ? null : r.error,
        messageId: r.messageId || null,
      })
      if (r.ok) {
        await db.collection('clients').doc(c.id).update({
          smsDueDateSent: true,
          smsCount: admin.firestore.FieldValue.increment(1)
        })
        sent.push({ client: c.name, type: 'due_date' })
      }
    }
  }
  return { checked: clients.length, sent, ranAt: new Date().toISOString() }
}

// ---------- Server-side cron ----------
if (!globalThis.__VTP_CRON_STARTED__) {
  globalThis.__VTP_CRON_STARTED__ = true
  const ONE_HOUR = 60 * 60 * 1000

  const tick = async () => {
    try {
      const db = await getFirestore()
      const result = await runCronChecks(db)
      if (result.sent.length > 0) {
        console.log(`[cron] sent ${result.sent.length} SMS:`, result.sent)
      }
    } catch (e) {
      console.error('[cron] error:', e?.message || e)
    }
  }
  setTimeout(tick, 30 * 1000)
  setInterval(tick, ONE_HOUR)
  console.log('[cron] Firebase scheduler started (every 1h)')
}

// ---------- CSV builder ----------
function clientsToCsv(clients) {
  const header = [
    'Nume',
    'Telefon',
    'Adresa',
    'Model centrala',
    'Ultima verificare',
    'Data scadenta',
    'SMS trimise',
    'Notite',
  ]
  const rows = clients.map((c) => [
    c.name || '',
    c.phone || '',
    c.address || '',
    c.model || '',
    formatRoDate(c.lastVerification),
    formatRoDate(c.dueDate),
    String(c.smsCount || 0),
    (c.notes || '').replace(/\n/g, ' '),
  ])
  const escape = (v) => {
    const s = String(v ?? '')
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  return (
    [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n') +
    '\r\n'
  )
}

// ---------- Route handler ----------
async function handle(request, { params }) {
  const path = (params?.path || []).join('/')
  const method = request.method
  const db = await getFirestore()

  try {
    if (method === 'GET' && (path === '' || path === 'health')) {
      return NextResponse.json({ ok: true, service: 'reamintiri-vtp-firebase' })
    }

    // Settings
    if (path === 'settings') {
      if (method === 'GET') {
        const s = await getSettings(db)
        return NextResponse.json(s)
      }
      if (method === 'PUT') {
        const body = await request.json()
        await db.collection('settings').doc('main').update({
          messageTwoWeeks: body.messageTwoWeeks,
          messageDueDate: body.messageDueDate,
          contactPhone: body.contactPhone,
        })
        const s = await getSettings(db)
        return NextResponse.json(s)
      }
    }

    // Export CSV
    if (path === 'export/csv' && method === 'GET') {
      const snapshot = await db.collection('clients').orderBy('name').get()
      const clients = snapshot.docs.map(doc => doc.data())
      const csv = clientsToCsv(clients)
      return new NextResponse('\uFEFF' + csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="clienti_ena_instal_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    // Clients list/create
    if (path === 'clients') {
      if (method === 'GET') {
        const snapshot = await db.collection('clients').orderBy('dueDate').get()
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        return NextResponse.json(list)
      }
      if (method === 'POST') {
        const body = await request.json()
        const lastVerification = body.lastVerification || new Date().toISOString().slice(0, 10)
        const dueDate = addYears(lastVerification, 2)
        const clientId = uuidv4()
        const client = {
          id: clientId,
          name: body.name || '',
          phone: body.phone || '',
          address: body.address || '',
          model: body.model || '',
          notes: body.notes || '',
          lastVerification,
          dueDate,
          smsCount: 0,
          smsTwoWeeksSent: false,
          smsDueDateSent: false,
          verificationHistory: [
            { id: uuidv4(), date: lastVerification, notes: body.notes || '' },
          ],
          createdAt: new Date().toISOString(),
        }
        await db.collection('clients').doc(clientId).set(client)
        return NextResponse.json(client)
      }
    }

    // SMS history
    if (path === 'sms-history') {
      if (method === 'GET') {
        const snapshot = await db.collection('sms_history').orderBy('sentAt', 'desc').limit(500).get()
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        return NextResponse.json(list)
      }
    }

    // Manual cron
    if (path === 'cron/check' && (method === 'POST' || method === 'GET')) {
      const result = await runCronChecks(db)
      return NextResponse.json(result)
    }

    // Per-client
    const m = path.match(/^clients\/([^\/]+)(?:\/(.+))?$/ )
    if (m) {
      const id = m[1]
      const sub = m[2]
      const doc = await db.collection('clients').doc(id).get()
      if (!doc.exists) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      const client = { id: doc.id, ...doc.data() }

      if (!sub) {
        if (method === 'GET') return NextResponse.json(client)
        if (method === 'PUT') {
          const body = await request.json()
          const update = {}
          if (body.name !== undefined) update.name = body.name
          if (body.phone !== undefined) update.phone = body.phone
          if (body.address !== undefined) update.address = body.address
          if (body.model !== undefined) update.model = body.model
          if (body.notes !== undefined) update.notes = body.notes
          if (body.lastVerification !== undefined) {
            update.lastVerification = body.lastVerification
            update.dueDate = addYears(body.lastVerification, 2)
            update.smsTwoWeeksSent = false
            update.smsDueDateSent = false
          }
          await db.collection('clients').doc(id).update(update)
          const updatedDoc = await db.collection('clients').doc(id).get()
          const updated = { id: updatedDoc.id, ...updatedDoc.data() }
          return NextResponse.json(updated)
        }
        if (method === 'DELETE') {
          await db.collection('clients').doc(id).delete()
          return NextResponse.json({ ok: true })
        }
      }

      if (sub === 'verify' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const today = new Date().toISOString().slice(0, 10)
        const dueDate = addYears(today, 2)
        const entry = {
          id: uuidv4(),
          date: today,
          notes: body.notes || '',
        }
        await db.collection('clients').doc(id).update({
          lastVerification: today,
          dueDate,
          smsTwoWeeksSent: false,
          smsDueDateSent: false,
          verificationHistory: admin.firestore.FieldValue.arrayUnion(entry)
        })
        const updatedDoc = await db.collection('clients').doc(id).get()
        const updated = { id: updatedDoc.id, ...updatedDoc.data() }
        return NextResponse.json(updated)
      }

      if (sub === 'send-sms' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const settings = await getSettings(db)
        const tpl = body.template === 'due_date' ? settings.messageDueDate :
                    body.template === '2_weeks' ? settings.messageTwoWeeks :
                    body.message || settings.messageTwoWeeks
        const text = body.message ? body.message : renderTemplate(tpl, client)
        const r = await sendVonageSMS({ to: client.phone, text })
        await logSMS(db, {
          clientId: client.id,
          clientName: client.name,
          phone: client.phone,
          model: client.model,
          type: body.template || 'manual',
          message: text,
          status: r.ok ? 'sent' : 'failed',
          error: r.ok ? null : r.error,
          messageId: r.messageId || null,
        })
        if (r.ok) {
          await db.collection('clients').doc(id).update({
            smsCount: admin.firestore.FieldValue.increment(1)
          })
        }
        return NextResponse.json({ ok: r.ok, error: r.error || null, sentText: text }, { status: r.ok ? 200 : 500 })
      }
    }

    return NextResponse.json({ error: 'Not found', path, method }, { status: 404 })
  } catch (e) {
    console.error('API error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
export const PATCH = handle

