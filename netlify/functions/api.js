const admin = require('firebase-admin');

exports.handler = async (event, context) => {
  try {
    if (event.path.includes('/api/health')) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, service: 'netlify-firestore' })
      };
    }
    
    // Firebase init test
    if (!admin.apps.length) {
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/(\\n|\\\\n)/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL
      };
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    
    const db = admin.firestore();
    const clientsSnap = await db.collection('clients').limit(1).get();
    
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, clients: clientsSnap.size })
    };
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
