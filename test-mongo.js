const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function test() {
  try {
    console.log('MONGO_URL:', process.env.MONGO_URL ? 'SET' : 'MISSING');
    const client = new MongoClient(process.env.MONGO_URL || 'mongodb://localhost:27017');
    await client.connect();
    console.log('✅ MongoDB Connected!');
    const db = client.db('reamintiri-vtp');
    await db.collection('test').insertOne({ test: true, time: new Date() });
    console.log('✅ Data saved OK!');
    await client.close();
  } catch (e) {
    console.error('❌ MongoDB ERROR:', e.message);
  }
}

test();
