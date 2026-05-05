import { NextResponse } from 'next/server'
import admin from 'firebase-admin'
import { v4 as uuidv4 } from 'uuid'
import { Vonage } from '@vonage/server-sdk'

// ---------- Firebase Admin (singleton) ----------
async function getFirestore() {
  if (admin.apps.length > 0) return admin.firestore()

  const projectId = process.env.FIREBASE_PROJECT_ID
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL

  if (!projectId || !privateKey || !clientEmail) {
    throw new Error('Missing Firebase env vars')
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      privateKey,
      clientEmail,
    }),
  })
  return admin.firestore()
}

// ---------- Vonage ----------
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
})
const SENDER_ID = process.env.VONAGE_SENDER_ID || 'Ena Instal'

// Defaults
const DEFAULT_SETTINGS = {
  messageTwoWeeks: 'Buna {nume}, peste 2 sapt {data} scadenta VTP {model}. Ena Instal.',
  messageDueDate: 'Buna {nume}, azi {data} scadenta VTP {model}. Contactati Ena Instal.',
  contactPhone: '+40752832309',
}

// Helpers
function addYears(dateStr, years) {
  const d = new Date(dateStr)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

function formatRoDate(dateStr) {
  const d = new Date(dateStr)
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
}

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0,0,0,0)
  const target = new Date(dateStr)
  target.setHours(0,0,0,0)
  return Math.round((target - today) / (1000 * 60 * 60 * 24))
}

function renderTemplate(tpl, client) {
  return tpl.replaceAll('{nume}', client.name || '').replaceAll('{model}', client.model || '').replaceAll('{data}', formatRoDate(client.dueDate))
}

function normalizePhone(phone) {
  let p = String(phone).replace(/[\s\-\(\)]/g, '')
  if (p.startsWith('0') && p.length === 10) p = '40' + p.slice(1)
  return p
}

async function sendVonageSMS({ to, text }) {
  try {
    const resp = await vonage.sms.send({
      to: normalizePhone(to),
      from: SENDER_ID,
      text,
    })
    const msg = resp.messages[0]
    return msg.status === '0' ? { ok: true, messageId: msg.messageId } : { ok: false, error: msg.errorText }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function logSMS(db, entry) {
  await db.collection('sms_history').add({
    ...entry,
    id: uuidv4(),
    sentAt: new Date().toISOString(),
  })
}

async function getSettings(db) {
  const doc = await db.collection('settings').doc('main').get()
  if (!doc.exists) {
    await db.collection('settings').doc('main').set(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
  return doc.data()
}

// Cron
async function runCronChecks(db) {
  const settings = await getSettings(db)
  const clients = await db.collection('clients').orderBy('dueDate').get()
  const sent = []
  for (const doc of clients.docs) {
    const c = doc.data()
    const days = daysUntil(c.dueDate)
    if (days <= 14 && days >= 1 && !c.smsTwoWeeksSent) {
      const r = await sendVonageSMS({ to: c.phone, text: renderTemplate(settings.messageTwoWeeks, c) })
      await logSMS(db, { ...c, type: '2_weeks', status: r.ok ? 'sent' : 'failed' })
      if (r.ok) await db.doc(doc.id).update({ smsTwoWeeksSent: true, smsCount: admin.firestore.FieldValue.increment(1) })
    }
    // due date similar...
  }
  return { sent }
}

// Route handler
async function handle(request, { params }) {
  const path = (params.path || []).join('/')
  const db = await getFirestore()
  const method = request.method

  try {
    // Health
    if (path === 'health') return NextResponse.json({ ok: true })

    // Settings
    if (path === 'settings') {
      if (method === 'GET') return NextResponse.json(await getSettings(db))
      if (method === 'PUT') {
        const body = await request.json()
        await db.collection('settings').doc('main').update(body)
        return NextResponse.json(await getSettings(db))
      }
    }

    // Clients
    if (path === 'clients') {
      if (method === 'GET') {
        const snapshot = await db.collection('clients').orderBy('dueDate').get()
        return NextResponse.json(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
      }
      if (method === 'POST') {
        const body = await request.json()
        const id = uuidv4()
        const client = {
          id,
          ...body,
          dueDate: addYears(body.lastVerification || new Date().toISOString().slice(0,10), 2),
          smsCount: 0,
          smsTwoWeeksSent: false,
          smsDueDateSent: false,
          createdAt: new Date().toISOString(),
        }
        await db.collection('clients').doc(id).set(client)
        return NextResponse.json(client)
      }
    }

    // Client ID routes
    const [ , id, sub ] = path.match(/^clients\/([^\/]+)(?:\/([^\/]+))?/) || []
    if (id) {
      const doc = await db.collection('clients').doc(id).get()
      if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const client = { id: doc.id, ...doc.data() }

      if (!sub) {
        if (method === 'GET') return NextResponse.json(client)
        if (method === 'PUT') {
          const body = await request.json()
          // If lastVerification is being updated, recalculate dueDate
          const updateData = { ...body }
          if (body.lastVerification) {
            updateData.dueDate = addYears(body.lastVerification, 2)
          }
          await db.doc(doc.id).update(updateData)
          return NextResponse.json({ ok: true })
        }
        if (method === 'DELETE') {
          await db.doc(doc.id).delete()
          return NextResponse.json({ ok: true })
        }
      }

      if (sub === 'send-sms' && method === 'POST') {
        let body = {}
        try {
          body = await request.json()
        } catch {}

        const settings = await getSettings(db)
        const text = renderTemplate(settings.messageTwoWeeks, client)
        const r = await sendVonageSMS({ to: client.phone, text })
        await logSMS(db, { clientId: id, phone: client.phone, message: text, status: r.ok ? 'sent' : 'failed', ...body })
        if (r.ok) {
          await db.doc(doc.id).update({ smsCount: admin.firestore.FieldValue.increment(1) })
        }
        return NextResponse.json(r)
      }

      if (sub === 'verify' && method === 'POST') {
        const today = new Date().toISOString().slice(0, 10)
        const newDueDate = addYears(today, 2)
        
        // Add to verification history
        const verificationEntry = {
          id: uuidv4(),
          date: today,
          notes: 'Verificare periodică'
        }
        
        // Get existing history or empty array
        const existingHistory = client.verificationHistory || []
        
        await db.doc(doc.id).update({
          lastVerification: today,
          dueDate: newDueDate,
          smsTwoWeeksSent: false,
          smsDueDateSent: false,
          verificationHistory: [...existingHistory, verificationEntry]
        })
        
        return NextResponse.json({ ok: true, newDueDate })
      }
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle

