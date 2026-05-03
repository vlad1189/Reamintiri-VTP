// Netlify Firestore API - Fixed SMS path parsing
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const Vonage = require('@vonage/server-sdk').default;

const DEFAULT_SETTINGS = {
  messageTwoWeeks: 'Buna ziua {nume}, va reamintim ca peste 2 saptamani (la {data}) este scadenta verificarea centralei {model}. Va rugam sa programati. Ena Instal.',
  messageDueDate: 'Buna ziua {nume}, astazi ({data}) este scadenta pentru verificarea centralei {model}. Contactati Ena Instal.',
  contactPhone: '+40752832309',
};

let db = null;
let vonage = null;
function getDb() {
  if (db) return db;
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\\\n/g, '\\n').replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  }
  db = admin.firestore();
  return db;
}

function getVonage() {
  if (vonage) return vonage;
  vonage = new Vonage({
    apiKey: process.env.VONAGE_API_KEY,
    apiSecret: process.env.VONAGE_API_SECRET,
  });
  return vonage;
}

async function getSettings(dbInstance) {
  const doc = await dbInstance.collection('settings').doc('main').get();
  if (!doc.exists) {
    await dbInstance.collection('settings').doc('main').set(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return doc.data();
}

function renderTemplate(tpl, client) {
  return tpl
    .replace(/{nume}/g, client.name || '')
    .replace(/{model}/g, client.model || '')
    .replace(/{data}/g, client.lastVerification?.slice(0,10) || '');
}

function normalizePhone(phone) {
  let p = String(phone).replace(/[\s\-\(\)]/g, '');
  if (p.startsWith('0') && p.length === 10) p = '40' + p.slice(1);
  return p;
}

async function sendSMS(to, text) {
  const vonageInstance = getVonage();
  try {
    const resp = await vonageInstance.sms.send({
      to: normalizePhone(to),
      from: process.env.VONAGE_SENDER_ID || 'Ena Instal',
      text,
    });
    const msg = resp.messages[0];
    return { ok: msg.status === '0', messageId: msg.messageId, error: msg.errorText };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function clientsToCsv(clients) {
  const header = ['Nume','Telefon','Adresa','Model centrala','Ultima verificare','Data scadenta','SMS trimise','Notite'];
  const rows = clients.map(c => [
    c.name || '',
    c.phone || '',
    c.address || '',
    c.model || '',
    c.lastVerification?.slice(0,10) || '',
    c.dueDate?.slice(0,10) || '',
    c.smsCount || 0,
    c.notes || ''
  ]);
  const escape = v => {
    const s = String(v);
    if (s.includes('"') || s.includes(',')) return `"${s.replace(/"/g,'""')}"`;
    return s;
  };
  return '\uFEFF' + [header,...rows].map(row => row.map(escape).join(',')).join('\r\n');
}

exports.handler = async (event) => {
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

    if (method === 'OPTIONS') {
      return { statusCode: 200, headers: { 
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 
        'Access-Control-Allow-Headers': 'Content-Type' 
      }};
    }

    // Settings
    if (path === 'settings') {
      if (method === 'GET') return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(await getSettings(dbInstance)) };
      if (method === 'PUT') {
        await dbInstance.collection('settings').doc('main').set(body, { merge: true });
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(await getSettings(dbInstance)) };
      }
    }

    // CSV export
    if (path === 'export/csv') {
      const snapshot = await dbInstance.collection('clients').orderBy('name').get();
      const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const csv = clientsToCsv(clients);
      return { 
        statusCode: 200, 
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="clienti_${new Date().toISOString().slice(0,10)}.csv"`,
          'Access-Control-Allow-Origin': '*'
        }, 
        body: csv 
      };
    }

    // Parse path for client/id/subroute
    const parts = path.split('/').filter(Boolean);
    let id = null, sub = null;
    if (parts[0] === 'clients' && parts[1]) {
      id = parts[1];
      sub = parts[2];
    }

    // Client operations
    if (id) {
      const doc = await dbInstance.collection('clients').doc(id).get();
      if (!doc.exists) {
        return { statusCode: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Client not found' }) };
      }
      const client = { id: doc.id, ...doc.data() };

      if (method === 'GET') return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(client) };

      if (method === 'PUT') {
        await dbInstance.collection('clients').doc(id).update(body);
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true }) };
      }

      if (method === 'DELETE') {
        await dbInstance.collection('clients').doc(id).delete();
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true }) };
      }

      if (sub === 'send-sms' && method === 'POST') {
        const settings = await getSettings(dbInstance);
        const text = renderTemplate(settings.messageTwoWeeks, client);
        const r = await sendSMS(client.phone, text);
        await dbInstance.collection('sms_history').add({
          clientId: id,
          clientName: client.name,
          phone: client.phone,
          type: 'manual',
          message: text,
          status: r.ok ? 'sent' : 'failed',
          messageId: r.messageId,
          error: r.error,
          sentAt: new Date().toISOString()
        });
        if (r.ok) {
          await dbInstance.collection('clients').doc(id).update({ smsCount: admin.firestore.FieldValue.increment(1) });
        }
        return { statusCode: r.ok ? 200 : 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(r) };
      }
    }

    // Clients list/create
    if (path === 'clients') {
      if (method === 'GET') {
        const snapshot = await dbInstance.collection('clients').orderBy('dueDate').get();
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(list) };
      }
      if (method === 'POST') {
        const id = uuidv4();
        const client = {
          id,
          name: body.name,
          phone: body.phone,
          address: body.address || '',
          model: body.model || '',
          notes: body.notes || '',
          lastVerification: body.lastVerification || new Date().toISOString().slice(0,10),
          dueDate: new Date(new Date(body.lastVerification || new Date()).setFullYear(new Date(body.lastVerification || new Date()).getFullYear() + 2)).toISOString().slice(0,10),
          smsCount: 0,
          smsTwoWeeksSent: false,
          smsDueDateSent: false,
          createdAt: new Date().toISOString(),
        };
        await dbInstance.collection('clients').doc(id).set(client);
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(client) };
      }
    }

    // SMS history
    if (path === 'sms-history') {
      const snapshot = await dbInstance.collection('sms_history').orderBy('sentAt', 'desc').limit(500).get();
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(list) };
    }

    return { statusCode: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Not found', path }) };
  } catch (e) {
    console.error('Netlify error:', e);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};

