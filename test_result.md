#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

user_problem_statement: |
  Romanian SMS reminder app for gas boiler engineer. Clients are stored, and each client should
  receive 2 automatic SMS reminders before their 2-yearly verification: one 2 weeks before due date,
  and one on the due date itself. Vonage SMS integration. Settings page must allow editing of
  message templates. Design must match provided screenshots (mobile-first, dark navy header, red/green
  accents). Vonage credentials provided.

backend:
  - task: "Clients CRUD (GET/POST/PUT/DELETE /api/clients)"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Created CRUD endpoints with UUID-based ids, auto-calculates dueDate as +2 years."
        - working: true
          agent: "testing"
          comment: "All CRUD operations working correctly. GET /api/clients returns list, POST creates with correct dueDate (+2 years), GET /api/clients/{id} returns single client, PUT updates and recalculates dueDate when lastVerification changes, DELETE removes client and returns 404 on subsequent GET. No MongoDB _id leaking through, only UUID-based id field."
  - task: "Settings GET/PUT /api/settings"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Fixed initial duplicate-key race using upsert with $setOnInsert."
        - working: true
          agent: "testing"
          comment: "Settings endpoints working correctly. GET /api/settings returns default settings if not exists (messageTwoWeeks, messageDueDate, contactPhone). PUT /api/settings updates and persists changes. No MongoDB _id in responses."
  - task: "Send SMS now POST /api/clients/{id}/send-sms (Vonage)"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Uses @vonage/server-sdk v3.27 with sender id 'Ena Instal'. Phone normalized to E.164 without +."
        - working: true
          agent: "testing"
          comment: "SMS sending working correctly. Tested with verified number +40752832309 - returns ok:true, sentText with placeholders replaced ({nume}, {model}, {data}, {adresa}, {telefon}). smsCount increments on success. Custom messages work. Non-verified numbers return proper JSON without crashing. SMS entries logged to sms_history collection."
  - task: "Mark verified today POST /api/clients/{id}/verify"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Resets lastVerification to today and dueDate to +2yrs, clears sent flags."
        - working: true
          agent: "testing"
          comment: "Verify endpoint working correctly. Sets lastVerification to today, calculates dueDate as today+2years, resets smsTwoWeeksSent and smsDueDateSent flags to false. Date calculation matches backend logic exactly."
  - task: "Auto-cron POST /api/cron/check"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Sends 2-week-before SMS once and due-date SMS once per client. Triggered on app load."
        - working: true
          agent: "testing"
          comment: "Cron check working correctly. Iterates all clients, sends 2-week SMS for clients with dueDate 12-14 days away (if smsTwoWeeksSent=false), sends due-date SMS for clients with dueDate 0 to -1 days (if smsDueDateSent=false). Returns checked count and sent array. SMS flags are set after successful send to prevent duplicates."
  - task: "SMS history GET /api/sms-history"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Returns last 200 logged SMS entries sorted desc."
        - working: true
          agent: "testing"
          comment: "SMS history endpoint working correctly. Returns array of SMS entries with all required fields (id, clientId, clientName, phone, type, message, status, error, sentAt). No MongoDB _id in responses. Sorted by sentAt descending, limited to 200 entries."
  - task: "CSV Export GET /api/export/csv"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "NEW in round 2. Returns CSV file with UTF-8 BOM, Content-Type text/csv, Content-Disposition attachment with filename pattern clienti_ena_instal_YYYY-MM-DD.csv. Columns: Nume, Telefon, Adresa, Model centrala, Ultima verificare, Data scadenta, SMS trimise, Notite. Dates in DD.MM.YYYY format. Proper CSV escaping for quotes, commas, newlines."
        - working: true
          agent: "testing"
          comment: "CSV export working perfectly. Returns 200 with correct Content-Type (text/csv; charset=utf-8), Content-Disposition with attachment and filename pattern. CSV starts with UTF-8 BOM (\uFEFF), header matches expected columns, dates in DD.MM.YYYY format, properly handles special characters (comma, quotes). All 8 sub-tests passed."
  - task: "Client notes field on POST/PUT /api/clients"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "CHANGED in round 2. POST /api/clients now accepts notes field and creates verificationHistory array with initial entry {id, date, notes}. PUT /api/clients/{id} now accepts notes field for updating."
        - working: true
          agent: "testing"
          comment: "Client notes field working correctly on both POST and PUT. POST creates verificationHistory array with initial entry containing id, date, and notes. PUT accepts and persists notes field. All verifications passed."
  - task: "Verification history pushed on POST /api/clients/{id}/verify with optional notes"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "CHANGED in round 2. POST /api/clients/{id}/verify now accepts optional body {notes} and PUSHES new verificationHistory entry. Existing entries preserved."
        - working: true
          agent: "testing"
          comment: "Verify endpoint with notes working perfectly. lastVerification set to today, dueDate set to today+2years, verificationHistory array grows by 1 (PUSH operation confirmed), new entry has correct data (id, date, notes), previous entries preserved. All 5 sub-tests passed."
  - task: "SMS history entries include model field"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "CHANGED in round 2. POST /api/clients/{id}/send-sms now logs model field in sms_history collection."
        - working: true
          agent: "testing"
          comment: "SMS history entries now correctly include model field. Tested by sending SMS and verifying latest sms_history entry contains model field matching client's model. Working correctly."
  - task: "Server-side cron singleton"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "NEW in round 2. Server-side cron singleton runs every hour using globalThis.__VTP_CRON_STARTED__ flag to avoid duplicates in dev. Runs same logic as /api/cron/check."
        - working: true
          agent: "testing"
          comment: "Cron singleton working correctly. Manual /api/cron/check endpoint still works (returns 200 with checked count). Cron startup message '[cron] background scheduler started (runs every 1h)' found in nextjs logs, confirming initialization. No crashes detected."

frontend:
  - task: "Mobile-first UI matching provided screenshots"
    implemented: true
    working: "NA"
    file: "/app/app/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Confirmed visually identical to screenshots in browser test."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        MVP built. Backend uses Vonage SMS via @vonage/server-sdk with credentials from .env.
        Use the verified test phone +40752832309 for SMS sending tests (this is the only verified
        Vonage trial number). Sender id is "Ena Instal". DB name reamintiri_vtp.
        Please test all backend endpoints. For real Vonage send-sms tests, use the verified number
        +40752832309 only. Other numbers will return non-zero status from Vonage in trial mode -
        that's still acceptable as long as our endpoint returns proper error info.
    - agent: "main"
      message: |
        ROUND 2 - new features added (please retest only NEW endpoints/changes):
        1) NEW: GET /api/export/csv -> returns CSV file with UTF-8 BOM and Content-Disposition. Should
           list all clients with columns Nume, Telefon, Adresa, Model, Ultima verificare, Data scadenta,
           SMS trimise, Notite.
        2) CHANGED: POST /api/clients now accepts `notes` field; on creation pushes initial entry into
           verificationHistory: [{ id, date, notes }].
        3) CHANGED: PUT /api/clients/{id} now accepts `notes` field for updating.
        4) CHANGED: POST /api/clients/{id}/verify now accepts optional body { notes } and PUSHES a new
           verificationHistory entry with that note. Existing entries must be preserved.
        5) CHANGED: SMS history entries now include `model` field.
        6) NEW: server-side cron singleton that runs every hour (uses globalThis flag to avoid duplicate
           in dev). Logic is identical to /api/cron/check. Just verify code is loaded without crashing
           and the manual /api/cron/check endpoint still works.
        Skip retesting things already working in round 1.
    - agent: "testing"
      message: |
        ✅ ALL BACKEND TESTS PASSED (8/8)
        
        Comprehensive backend testing completed. All endpoints working correctly:
        - Health check: ✅
        - Settings GET/PUT: ✅ (persists correctly)
        - Clients CRUD: ✅ (all operations, dueDate calculation correct)
        - Verify endpoint: ✅ (resets dates and flags)
        - Send SMS: ✅ (Vonage integration working, placeholders replaced, smsCount increments)
        - SMS history: ✅ (returns proper structure)
        - Cron check: ✅ (sends reminders based on due dates)
        
        Key verifications:
        ✓ No MongoDB _id leaking (only UUID-based id field)
        ✓ dueDate correctly calculated as lastVerification + 2 years
        ✓ Settings persist after PUT
        ✓ SMS with verified number (+40752832309) returns ok:true
        ✓ SMS with non-verified numbers returns proper JSON (no crash)
        ✓ Template placeholders {nume}, {model}, {data}, {adresa}, {telefon} replaced
        ✓ DELETE removes client and returns 404 on subsequent GET
        ✓ smsCount increments on successful SMS
        ✓ SMS entries logged to sms_history
        
        Backend is production-ready. All critical functionality verified.
    - agent: "testing"
      message: |
        ✅ ALL ROUND 2 BACKEND TESTS PASSED (6/6)
        
        Round 2 new/changed features testing completed. All new features working correctly:
        - CSV Export: ✅ (UTF-8 BOM, correct headers, DD.MM.YYYY dates, proper escaping)
        - Client notes on POST: ✅ (creates verificationHistory with initial entry)
        - Client notes on PUT: ✅ (accepts and persists notes)
        - Verify with notes: ✅ (PUSH to verificationHistory, preserves old entries)
        - SMS history model field: ✅ (model field included in sms_history entries)
        - Cron singleton: ✅ (initialized, manual endpoint works, no crashes)
        
        Key verifications:
        ✓ CSV export returns proper Content-Type and Content-Disposition headers
        ✓ CSV starts with UTF-8 BOM (\uFEFF) for Romanian diacritics
        ✓ CSV header matches specification exactly
        ✓ Dates formatted as DD.MM.YYYY (Romanian format)
        ✓ CSV properly escapes quotes, commas, and newlines
        ✓ verificationHistory array created on POST with initial entry
        ✓ verificationHistory grows by 1 on verify (PUSH operation confirmed)
        ✓ Previous verificationHistory entries preserved
        ✓ SMS history entries include model field matching client's model
        ✓ Cron startup message found in logs
        ✓ Manual /api/cron/check endpoint still functional
        
        All round 2 backend features production-ready. No issues found.
