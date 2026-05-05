# Pași GitHub Repo pentru Netlify Deploy

## 1. Verifică Git status
```
git status
```
(Dacă nu ai Git, instalează: https://git-scm.com)

## 2. Inițializează Git (dacă nu există .git)
```
git init
git add .
git commit -m "Initial Firebase refactor + Netlify ready"
```

## 3. Creează repo pe GitHub
1. https://github.com/new
2. Nume: `reamintiri-vtp`
3. Public/Private
4. **Nu** adaugă README/.gitignore (deja ai)
5. **Create repository**

## 4. Conectează local → remote
```
git remote add origin https://github.com/TAUNAME/reamintiri-vtp.git
git branch -M main
git push -u origin main
```

## 5. Netlify auto-deploy
- Netlify → New site from Git → GitHub → `reamintiri-vtp`
- Build: `yarn build` | Dir: `.next`
- Env vars: Copiază din `.env.local` (FIREBASE_*, VONAGE_*)

## 6. Update deploy
```
git add .
git commit -m "Update feature"
git push
```
→ Netlify auto-build/deploy!

## Exclude sensibili (.gitignore verificat):
```
.env.local
node_modules/
.next/
*.json  # service account
```

**Repo gata!** Push → Netlify live. 🎉
