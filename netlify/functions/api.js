// Core Firestore API - Vonage SMS disabled (Netlify bundling issue)
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_SETTINGS = {
  id: 'main',
  messageTwoWeeks: 'Buna ziua {nume}, va reamintim ca peste 2 saptamani (la {data}) este scadenta verificarea tehnica periodica a centralei {model}.',
  messageDueDate: 'Buna ziua {nume}, astazi ({data}) este data scadenta pentru verificarea centralei {model}.',
  contactPhone: '+40752832309',
};

let db = null;
function getDb() {
  if (db) return db;
  if (!admin.apps.length) {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\\\n/g, '\\n').replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  db = admin.firestore();
  return db;
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
  const header = ['Nume', 'Telefon', 'Adresa', 'Model centrala', 'Ultima verificare', 'Data scadenta', 'SMS trimise', 'Notite'];
  const rows = clients.map((c) => [
    c.name || '',
    c.phone || '',
    c.address || '',
    c.model || '',
    c.lastVerification ? c.lastVerification.slice(0, 10) : '',
    c.dueDate ? c.dueDate.slice(0, 10) : '',
    String(c.smsCount || 0),
    c.notes || '',
  ]);
  const escape = (v) => {
    const s = String(v);
    if (s.includes('"') || s.includes(',')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return '\uFEFF' + [header, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
}

exports.handler = async (event) => {
  try {
    const dbInstance = getDb();
    const path = event.path.replace(/^\/api\//, '');
    const method = event.httpMethod;
    let body = {};

    // Parse body
    if (method !== 'GET') {
      try {
        body = JSON.parse(event.body || '{}');
      } catch {}
    }

    // Health
    if (path === 'health') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({ ok: true, service: 'reamintiri-firestore-core' })
      };
    }

    // OPTIONS preflight
    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: ''
      };
    }

    // Settings GET/PUT
    if (path === 'settings') {
      if (method === 'GET') {
        const s = await getSettings(dbInstance);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(s)
        };
      }
      if (method === 'PUT') {
        const update = {
          messageTwoWeeks: body.messageTwoWeeks,
          messageDueDate: body.messageDueDate,
          contactPhone: body.contactPhone
        };
        await dbInstance.collection('settings').doc('main').set(update, { merge: true });
        const s = await getSettings(dbInstance);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(s)
        };
      }
    }

    // CSV export
    if (path === 'export/csv') {
      const clientsSnap = await dbInstance.collection('clients').orderBy('name').get();
      const clients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const csv = clientsToCsv(clients);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="clienti_${new Date().toISOString().slice(0, 10)}.csv"`,
          'Access-Control-Allow-Origin': '*'
        },
        body: csv
      };
    }

    // Clients list/POST
    if (path === 'clients') {
      if (method === 'GET') {
        const clientsSnap = await dbInstance.collection('clients').orderBy('dueDate').get();
        const list = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(list)
        };
      }
      if (method === 'POST') {
        const clientId = uuidv4();
        const lastVerification = body.lastVerification || new Date().toISOString().slice(0, 10);
        const dueDate = lastVerification.split('-')[0] ? new Date(lastVerification).setFullYear(new Date(lastVerification).getFullYear() + 2) : addYears(lastVerification, 2);
        const client = {
          id: clientId,
          name: body.name,
          phone: body.phone,
          address: body.address,
          model: body.model,
          notes: body.notes,
          lastVerification,
          dueDate,
          smsCount: 0,
          smsTwoWeeksSent: false,
          smsDueDateSent: false,
          verificationHistory: [{ id: uuidv4(), date: lastVerification, notes: body.notes }],
          createdAt: new Date().toISOString(),
        };
        await dbInstance.collection('clients').doc(clientId).set(client);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(client)
        };
      }
    }

    // Client detail/PUT/DELETE
    const clientMatch = path.match(/^clients\/(.+)$/);
    if (clientMatch) {
      const id = clientMatch[1];
      const clientDoc = await dbInstance.collection('clients').doc(id).get();
      if (!clientDoc.exists) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Client not found' })
        };
      }
      const client = { id: clientDoc.id, ...clientDoc.data() };

      if (method === 'GET') {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(client)
        };
      }

      if (method === 'PUT') {
        const update = {};
        Object.keys(body).forEach(key => {
          update[key] = body[key];
        });
        if (body.lastVerification) {
          update.dueDate = addYears(body.lastVerification, 2);
          update.smsTwoWeeksSent = false;
          update.smsDueDateSent = false;
        }
        await dbInstance.collection('clients').doc(id).update(update);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ ok: true })
        };
      }

      if (method === 'DELETE') {
        await dbInstance.collection('clients').doc(id).delete();
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ ok: true })
        };
      }
    }

    // SMS history
    if (path === 'sms-history') {
      const historySnap = await dbInstance.collection('sms_history').orderBy('sentAt', 'desc').limit(50).get();
      const list = historySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(list)
      };
    }

    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Endpoint not found', path })
    };
  } catch (error) {
    console.error('Netlify API error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};

