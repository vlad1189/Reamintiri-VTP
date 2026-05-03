const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const Vonage = require('@vonage/server-sdk');

// Vonage
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
});
const SENDER_ID = process.env.VONAGE_SENDER_ID || 'Ena Instal';

// Firebase singleton
let db = null;
function getDb() {
  if (db) return db;
  if (!admin.apps.length) {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g, '\\n').replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  db = admin.firestore();
  return db;
}

// Defaults
const DEFAULT_SETTINGS = {
  id: 'main',
  messageTwoWeeks: 'Buna ziua {nume}, va reamintim ca peste 2 saptamani (la {data}) este scadenta verificarea tehnica periodica a centralei {model}. Va rugam sa programati verificarea. Ena Instal.',
  messageDueDate: 'Buna ziua {nume}, astazi ({data}) este data scadenta pentru verificarea tehnica periodica a centralei {model}. Va rugam sa ne contactati pentru programare. Ena Instal.',
  contactPhone: '+40752832309',
};

// Helpers
function addYears(dateStr, years) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function formatRoDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return 9999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function renderTemplate(tpl, client) {
  return (tpl || '')
    .replaceAll('{nume}', client.name || '')
    .replaceAll('{model}', client.model || '')
    .replaceAll('{data}', formatRoDate(client.dueDate))
    .replaceAll('{adresa}', client.address || '')
    .replaceAll('{telefon}', client.phone || '');
}

function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/[\s\-\(\)]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0') && p.length === 10) p = '40' + p.slice(1);
  return p;
}

async function sendVonageSMS({ to, text }) {
  const recipient = normalizePhone(to);
  try {
    const resp = await vonage.sms.send({
      to: recipient,
      from: SENDER_ID,
      text,
    });
    const msg = resp?.messages?.[0] || {};
    if (msg.status === '0') {
      return { ok: true, messageId: msg.messageId || msg['message-id'], raw: resp };
    }
    return {
      ok: false,
      error: msg.errorText || msg['error-text'] || 'Unknown error',
      status: msg.status,
      raw: resp,
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function logSMS(dbInstance, entry) {
  await dbInstance.collection('sms_history').add({
    id: uuidv4(),
    sentAt: new Date().toISOString(),
    ...entry,
  });
}

async function getSettings(dbInstance) {
  const doc = await dbInstance.collection('settings').doc('main').get();
  if (!doc.exists) {
    await dbInstance.collection('settings').doc('main').set(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  const s = doc.data();
  return s;
}

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
  ];
  const rows = clients.map((c) => [
    c.name || '',
    c.phone || '',
    c.address || '',
    c.model || '',
    formatRoDate(c.lastVerification),
    formatRoDate(c.dueDate),
    String(c.smsCount || 0),
    (c.notes || '').replace(/\n/g, ' '),
  ]);
  const escape = (v) => {
    const s = String(v ?? '');
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  return (
    ['\uFEFF' + header.map(escape).join(','), ...rows.map(row => row.map(escape).join(','))].join('\r\n') + '\r\n'
  );
}

exports.handler = async (event, context) => {
  try {
    const dbInstance = getDb();
    const path = event.path.replace(/^\/api\//, '');
    const method = event.httpMethod;
    let body = {};

    if (method !== 'GET') {
      try {
        body = JSON.parse(event.body || '{}');
      } catch {}
    }

    // Health
    if (path === 'health' || path === '') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok: true, service: 'reamintiri-vtp-firestore' }),
      };
    }

    // Settings
    if (path === 'settings') {
      if (method === 'GET') {
        const s = await getSettings(dbInstance);
        delete s.id;
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(s),
        };
      }
      if (method === 'PUT') {
        const update = {
          messageTwoWeeks: body.messageTwoWeeks,
          messageDueDate: body.messageDueDate,
          contactPhone: body.contactPhone,
        };
        await dbInstance.collection('settings').doc('main').set(update, { merge: true });
        const s = await getSettings(dbInstance);
        delete s.id;
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(s),
        };
      }
    }

    // Export CSV
    if (path === 'export/csv' && method === 'GET') {
      const clientsSnap = await dbInstance.collection('clients').orderBy('name').get();
      const clients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const csv = clientsToCsv(clients);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="clienti_ena_instal_${new Date().toISOString().slice(0, 10)}.csv"`,
          'Access-Control-Allow-Origin': '*',
        },
        body: csv,
      };
    }

    // Clients list/post
    if (path === 'clients') {
      if (method === 'GET') {
        const clientsSnap = await dbInstance.collection('clients').orderBy('dueDate').get();
        const list = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(list),
        };
      }
      if (method === 'POST') {
        const lastVerification = body.lastVerification || new Date().toISOString().slice(0, 10);
        const dueDate = addYears(lastVerification, 2);
        const client = {
          id: uuidv4(),
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
        };
        await dbInstance.collection('clients').doc(client.id).set(client);
        delete client.id; // Firestore doc ID already set
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(client),
        };
      }
    }

    // SMS history
    if (path === 'sms-history' && method === 'GET') {
      const historySnap = await dbInstance.collection('sms_history').orderBy('sentAt', 'desc').limit(500).get();
      const list = historySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(list),
      };
    }

    // Client operations
    const m = path.match(/^clients\/([^\/]+)(?:\/(.+))?$/);
    if (m) {
      const id = m[1];
      const sub = m[2];
      const clientDoc = await dbInstance.collection('clients').doc(id).get();
      if (!clientDoc.exists) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Client not found' }),
        };
      }
      const client = { id: clientDoc.id, ...clientDoc.data() };

      if (!sub) {
        if (method === 'GET') {
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(client),
          };
        }
        if (method === 'PUT') {
          const update = {};
          if (body.name !== undefined) update.name = body.name;
          if (body.phone !== undefined) update.phone = body.phone;
          if (body.address !== undefined) update.address = body.address;
          if (body.model !== undefined) update.model = body.model;
          if (body.notes !== undefined) update.notes = body.notes;
          if (body.lastVerification !== undefined) {
            update.lastVerification = body.lastVerification;
            update.dueDate = addYears(body.lastVerification, 2);
            update.smsTwoWeeksSent = false;
            update.smsDueDateSent = false;
          }
          await dbInstance.collection('clients').doc(id).update(update);
          const updatedDoc = await dbInstance.collection('clients').doc(id).get();
          const updated = { id: updatedDoc.id, ...updatedDoc.data() };
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(updated),
          };
        }
        if (method === 'DELETE') {
          await dbInstance.collection('clients').doc(id).delete();
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ ok: true }),
          };
        }
      }

      if (sub === 'verify' && method === 'POST') {
        const bodyData = body || {};
        const today = new Date().toISOString().slice(0, 10);
        const dueDate = addYears(today, 2);
        const entry = {
          id: uuidv4(),
          date: today,
          notes: bodyData.notes || '',
        };
        await dbInstance.collection('clients').doc(id).update({
          lastVerification: today,
          dueDate,
          smsTwoWeeksSent: false,
          smsDueDateSent: false,
          verificationHistory: admin.firestore.FieldValue.arrayUnion(entry),
        });
        const updatedDoc = await dbInstance.collection('clients').doc(id).get();
        const updated = { id: updatedDoc.id, ...updatedDoc.data() };
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(updated),
        };
      }

      if (sub === 'send-sms' && method === 'POST') {
        const bodyData = body || {};
        const settings = await getSettings(dbInstance);
        const tpl = bodyData.template === 'due_date' ? settings.messageDueDate : bodyData.template === '2_weeks' ? settings.messageTwoWeeks : bodyData.message || settings.messageTwoWeeks;
        const text = bodyData.message ? bodyData.message : renderTemplate(tpl, client);
        const r = await sendVonageSMS({ to: client.phone, text });
        await logSMS(dbInstance, {
          clientId: client.id,
          clientName: client.name,
          phone: client.phone,
          model: client.model,
          type: bodyData.template || 'manual',
          message: text,
          status: r.ok ? 'sent' : 'failed',
          error: r.ok ? null : r.error,
          messageId: r.messageId || null,
        });
        if (r.ok) {
          await dbInstance.collection('clients').doc(id).update('smsCount', admin.firestore.FieldValue.increment(1));
        }
        return {
          statusCode: r.ok ? 200 : 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ ok: r.ok, error: r.error || null, sentText: text }),
        };
      }
    }

    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Not found', path, method }),
    };
  } catch (error) {
    console.error('API error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

