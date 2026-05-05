# Firebase Refactor TODO

## Status: 0/7 ✅ Pending

**Legend**: ⏳ Pending | 🔄 In Progress | ✅ Done  

1. ⏳ [ ] Create TODO.md (this file)
2. ✅ [x] Update package.json: Add firebase-admin, remove mongodb, update scripts
3. ✅ [x] Execute `yarn install`
4. ✅ [x] Update env.txt → .env.local with Firebase credentials
5. ✅ [x] Refactor app/api/[[...path]]/route.js to Firestore
6. ✅ [x] Delete docker-compose.yml and test-mongo.js
7. ✅ [x] Data migration script + test locally (script created: migrate-mongo-to-firestore.js - run if Mongo data exists)
8. ⏳ [ ] Test app (yarn dev), verify Firestore writes/reads/SMS

