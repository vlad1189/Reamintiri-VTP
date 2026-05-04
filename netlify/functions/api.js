// Netlify Firestore API - Firebase + Vonage SMS (WORKING VONAGE - REST API)


const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const DEFAULT_SETTINGS = {
  messageTwoWeeks: 'Buna ziua {nume}, va reamintim ca peste 2 saptamani (la {data}) este scadenta verificarea centralei {model}. Va rugam sa programati. Ena Instal.',
  messageDueDate: 'Buna ziua {nume}, astazi ({data}) este scadenta pentru verificarea centralei {model}. Contactati Ena Instal.',
  contactPhone: '+40752832309',
};

let db = null;
function getDb() {
  if (db) return db;
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\\\n/g, '\\n').replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
  db = admin.firestore();
  return db;
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
  // Folosim API-ul REST Vonage direct
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  const from = process.env.VONAGE_SENDER_ID || 'Ena Instal';
  
  const params = new URLSearchParams();
  params.append('api_key', apiKey);
  params.append('api_secret', apiSecret);
  params.append('to', normalizePhone(to));
  params.append('from', from);
  params.append('text', text);
  
  try {
    const response = await axios.post('https://rest.nexmo.com/sms/json', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log('Vonage response:', response.data);
    const messages = response.data.messages || [];
    const msg = messages[0];
    
    if (msg && msg.status === '0') {
      return { ok: true, messageId: msg['message-id'], error: null };
    } else {
      return { ok: false, messageId: null, error: msg ? msg['error-text'] : 'Unknown error' };
    }
  } catch (err) {
    console.error('Vonage error:', err.message);
    if (err.response) {
      console.error('Response data:', err.response.data);
    }
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
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders };
  }

  try {
    const dbInstance = getDb();
    const path = event.path.replace(/^\/api\//, '');
    const method = event.httpMethod;
    let body = {};
    if (method !== 'GET') {
      try {
        body = JSON.parse(event.body || '{}');
      } catch (e) {
        console.log('Body parse error:', e);
      }
    }

    console.log('API request:', method, path, body);

    // Settings
    if (path === 'settings') {
      if (method === 'GET') {
        const settings = await getSettings(dbInstance);
        return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(settings) };
      }
      if (method === 'PUT') {
        await dbInstance.collection('settings').doc('main').set(body, { merge: true });
        const settings = await getSettings(dbInstance);
        return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(settings) };
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
          ...corsHeaders
        }, 
        body: csv 
      };
    }

    // Parse path /clients/ID/sub
    const parts = path.split('/').filter(Boolean);
    let id = null, sub = null;
    if (parts[0] === 'clients' && parts[1]) {
      id = parts[1];
      sub = parts.slice(2).join('/');
    }

    // Client operations
    if (id) {
      const doc = await dbInstance.collection('clients').doc(id).get();
      if (!doc.exists) {
        return { statusCode: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Client not found' }) };
      }
      const client = { id: doc.id, ...doc.data() };

      if (method === 'GET') return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(client) };

      if (method === 'PUT') {
        // If lastVerification is being updated, recalculate dueDate
        const updateData = { ...body };
        if (body.lastVerification) {
          const newDueDate = new Date(new Date(body.lastVerification).setFullYear(new Date(body.lastVerification).getFullYear() + 2)).toISOString().slice(0, 10);
          updateData.dueDate = newDueDate;
        }
        await dbInstance.collection('clients').doc(id).update(updateData);
        return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
      }

      if (method === 'DELETE') {
        await dbInstance.collection('clients').doc(id).delete();
        return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
      }

      if (sub === 'send-sms' && method === 'POST') {
        console.log('Sending SMS to', client.phone);
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
        console.log('SMS result:', r);
        return { statusCode: r.ok ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(r) };
      }

      if (sub === 'verify' && method === 'POST') {
        const today = new Date().toISOString().slice(0, 10);
        const newDueDate = new Date(new Date(today).setFullYear(new Date(today).getFullYear() + 2)).toISOString().slice(0, 10);
        
        // Add to verification history
        const verificationEntry = {
          id: uuidv4(),
          date: today,
          notes: 'Verificare periodică'
        };
        
        // Get existing history or empty array
        const existingHistory = client.verificationHistory || [];
        
        await dbInstance.collection('clients').doc(id).update({
          lastVerification: today,
          dueDate: newDueDate,
          smsTwoWeeksSent: false,
          smsDueDateSent: false,
          verificationHistory: [...existingHistory, verificationEntry]
        });
        
        console.log('Verification updated for client', id, 'new due date:', newDueDate);
        return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, newDueDate }) };
      }
    }

    // Clients list/create
    if (path === 'clients') {
      if (method === 'GET') {
        const snapshot = await dbInstance.collection('clients').orderBy('dueDate').get();
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(list) };
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
        return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(client) };
      }
    }

    // SMS history
    if (path === 'sms-history') {
      const snapshot = await dbInstance.collection('sms_history').orderBy('sentAt', 'desc').limit(500).get();
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(list) };
    }

    // Cron check - automatic SMS sending
    if (path === 'cron/check' && method === 'POST') {
      const settings = await getSettings(dbInstance);
      const snapshot = await dbInstance.collection('clients').orderBy('dueDate').get();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let sentCount = 0;
      const results = [];

      for (const doc of snapshot.docs) {
        const client = { id: doc.id, ...doc.data() };
        const dueDate = new Date(client.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const daysUntilDue = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));

        // Check if SMS was already sent today for this client (safety check)
        const recentHistory = await dbInstance.collection('sms_history')
          .where('clientId', '==', doc.id)
          .where('type', 'in', ['2_weeks', 'due_date'])
          .orderBy('sentAt', 'desc')
          .limit(1)
          .get();
        
        const lastSent = recentHistory.empty ? null : recentHistory.docs[0].data();
        const sentToday = lastSent && new Date(lastSent.sentAt).toDateString() === today.toDateString();

        // Send SMS 2 weeks before due date (between 14 and 1 days before)
        if (daysUntilDue <= 14 && daysUntilDue >= 1 && !client.smsTwoWeeksSent && !sentToday) {
          const text = settings.messageTwoWeeks
            .replace(/{nume}/g, client.name || '')
            .replace(/{model}/g, client.model || '')
            .replace(/{data}/g, client.dueDate?.slice(0,10) || '')
            .replace(/{adresa}/g, client.address || '')
            .replace(/{telefon}/g, client.phone || '');

          const r = await sendSMS(client.phone, text);
          
          await dbInstance.collection('sms_history').add({
            clientId: doc.id,
            clientName: client.name,
            phone: client.phone,
            model: client.model,
            type: '2_weeks',
            message: text,
            status: r.ok ? 'sent' : 'failed',
            messageId: r.messageId,
            error: r.error,
            sentAt: new Date().toISOString()
          });

          if (r.ok) {
            await dbInstance.doc(doc.id).update({
              smsTwoWeeksSent: true,
              smsCount: admin.firestore.FieldValue.increment(1)
            });
            sentCount++;
          }

          results.push({ clientId: doc.id, daysUntilDue, status: r.ok ? 'sent' : 'failed' });
        }

        // Send SMS on due date
        if (daysUntilDue === 0 && !client.smsDueDateSent && !sentToday) {
          const text = settings.messageDueDate
            .replace(/{nume}/g, client.name || '')
            .replace(/{model}/g, client.model || '')
            .replace(/{data}/g, client.dueDate?.slice(0,10) || '')
            .replace(/{adresa}/g, client.address || '')
            .replace(/{telefon}/g, client.phone || '');

          const r = await sendSMS(client.phone, text);
          
          await dbInstance.collection('sms_history').add({
            clientId: doc.id,
            clientName: client.name,
            phone: client.phone,
            model: client.model,
            type: 'due_date',
            message: text,
            status: r.ok ? 'sent' : 'failed',
            messageId: r.messageId,
            error: r.error,
            sentAt: new Date().toISOString()
          });

          if (r.ok) {
            await dbInstance.doc(doc.id).update({
              smsDueDateSent: true,
              smsCount: admin.firestore.FieldValue.increment(1)
            });
            sentCount++;
          }

          results.push({ clientId: doc.id, daysUntilDue, status: r.ok ? 'sent' : 'failed' });
        }
      }

      console.log(`Cron check completed. Sent ${sentCount} SMS messages.`);
      return { 
        statusCode: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ ok: true, sent: sentCount, results }) 
      };
    }

    return { statusCode: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not found', path, method }) };
  } catch (e) {
    console.error('Netlify error:', e);
    return { statusCode: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message, stack: e.stack }) };
  }
};