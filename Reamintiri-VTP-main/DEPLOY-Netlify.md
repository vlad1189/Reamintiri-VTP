# Deploy pe Netlify ✅

## Pasul 1: Git repo (dacă nu există)
```
git init
git add .
git commit -m "Refactor Firebase + Netlify ready"
git remote add origin https://github.com/TAUusername/reamintiri-vtp.git  # creează repo GitHub
git push -u origin main
```

## Pasul 2: Netlify
1. https://app.netlify.com → New site from Git
2. GitHub repo → Connect `reamintiri-vtp`
3. **Build settings:**
   ```
   Build command: yarn build
   Publish directory: .next
   ```
4. **Environment variables** (din .env.local):
   ```
   FIREBASE_PROJECT_ID=reamintiri-vtp
   FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@reamintiri-vtp.iam.gserviceaccount.com
   VONAGE_API_KEY=73228500
   VONAGE_API_SECRET=Eo4uC0h838wEgYMM
   VONAGE_SENDER_ID=Ena Instal
   DB_NAME=reamintiri-vtp  # fallback
   ```
5. Deploy → URL: https://amazing-name-123.netlify.app

## netlify.toml (aplicat):
```
[build]
command = "yarn build"
publish = ".next"
```

## Funcții Edge:
API routes → Netlify Edge Functions (experimental.runtime = 'edge')

## Test deploy:
1. Build local: `yarn build`
2. Preview: netlify dev (instalează CLI: `npm i -g netlify-cli`)

**Warnings dev:** fs.existsSync deprecation = OK (Next.js/dotenv). Ignoră.

Ready! 🚀
