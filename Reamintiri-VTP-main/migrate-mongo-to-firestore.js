const { MongoClient } = require('mongodb')
const admin = require('firebase-admin')
require('dotenv').config({ path: '.env.local' })

async function migrate() {
  // Firebase
  const projectId = process.env.FIREBASE_PROJECT_ID
  const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, privateKey, clientEmail })
  })
  const db = admin.firestore()

  // Mongo
  const mongoClient = new MongoClient(process.env.MONGO_URL)
  await mongoClient.connect()
  const mongoDb = mongoClient.db(process.env.DB_NAME)

  console.log('🔄 Migrating clients...')
  const clientsSnap = await mongoDb.collection('clients').find({}).toArray()
  for (const c of clientsSnap) {
    // Remove Mongo _id, use client.id as doc ID
    delete c._id
    await db.collection('clients').doc(c.id).set(c)
    console.log(`  → Client ${c.name}`)
  }
  console.log(`✅ Migrated ${clientsSnap.length} clients`)

  console.log('🔄 Migrating settings...')
  const settingsSnap = await mongoDb.collection('settings').find({}).toArray()
  for (const s of settingsSnap) {
    delete s._id
    await db.collection('settings').doc(s.id).set(s)
  }
  console.log('✅ Migrated settings')

  console.log('🔄 Migrating SMS history...')
  const smsSnap = await mongoDb.collection('sms_history').find({}).toArray()
  for (const s of smsSnap) {
    delete s._id
    await db.collection('sms_history').add(s)
  }
  console.log(`✅ Migrated ${smsSnap.length} SMS`)

  await mongoClient.close()
  console.log('🎉 Migration complete!')
}

migrate().catch(console.error)

