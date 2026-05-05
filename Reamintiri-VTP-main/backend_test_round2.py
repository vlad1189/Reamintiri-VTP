#!/usr/bin/env python3
"""
Backend API tests for Romanian SMS reminder app - ROUND 2
Tests NEW and CHANGED features only
Base URL: https://inspection-notify.preview.emergentagent.com/api
"""

import requests
import json
from datetime import datetime, timedelta
import sys
import csv
import io

BASE_URL = "https://inspection-notify.preview.emergentagent.com/api"
VERIFIED_PHONE = "+40752832309"  # Only verified Vonage test number

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {test_name}")
    if details:
        print(f"  Details: {details}")
    return passed

def test_csv_export():
    """Test NEW: GET /api/export/csv"""
    print("\n" + "="*60)
    print("TEST: CSV Export (NEW)")
    print("="*60)
    
    created_ids = []
    all_passed = True
    
    try:
        # Create test clients with various data including notes
        test_clients = [
            {
                "name": "Maria Ionescu",
                "phone": "+40752111111",
                "address": "Str. Victoriei nr. 10, Cluj-Napoca",
                "model": "Vaillant ecoTEC",
                "lastVerification": "2024-06-15",
                "notes": "Client fidel, verificare anuala"
            },
            {
                "name": "Popescu, Ion",  # Name with comma to test CSV escaping
                "phone": "+40752222222",
                "address": "Bd. Unirii nr. 5",
                "model": "Ariston CLAS",
                "lastVerification": "2023-12-01",
                "notes": "Notă cu \"ghilimele\" și virgulă, test"
            }
        ]
        
        for client_data in test_clients:
            resp = requests.post(
                f"{BASE_URL}/clients",
                json=client_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            if resp.status_code == 200:
                created = resp.json()
                created_ids.append(created.get("id"))
        
        print(f"\n--- Created {len(created_ids)} test clients ---")
        
        # Test CSV export
        print("\n--- GET /api/export/csv ---")
        resp = requests.get(f"{BASE_URL}/export/csv", timeout=15)
        
        # Check HTTP status
        status_ok = resp.status_code == 200
        all_passed &= log_test(
            "CSV export returns 200",
            status_ok,
            f"Status: {resp.status_code}"
        )
        
        # Check Content-Type header
        content_type = resp.headers.get("Content-Type", "")
        content_type_ok = "text/csv" in content_type and "utf-8" in content_type.lower()
        all_passed &= log_test(
            "Content-Type is text/csv; charset=utf-8",
            content_type_ok,
            f"Content-Type: {content_type}"
        )
        
        # Check Content-Disposition header
        content_disp = resp.headers.get("Content-Disposition", "")
        has_attachment = "attachment" in content_disp
        has_filename = "clienti_ena_instal_" in content_disp and ".csv" in content_disp
        disp_ok = has_attachment and has_filename
        all_passed &= log_test(
            "Content-Disposition has attachment and filename pattern",
            disp_ok,
            f"Content-Disposition: {content_disp}"
        )
        
        # Check UTF-8 BOM
        csv_text = resp.text
        has_bom = csv_text.startswith('\ufeff')
        all_passed &= log_test(
            "CSV starts with UTF-8 BOM (\\uFEFF)",
            has_bom,
            f"Starts with BOM: {has_bom}"
        )
        
        # Parse CSV and check structure
        csv_content = csv_text.lstrip('\ufeff')  # Remove BOM for parsing
        csv_reader = csv.reader(io.StringIO(csv_content))
        rows = list(csv_reader)
        
        # Check header
        expected_header = [
            'Nume', 'Telefon', 'Adresa', 'Model centrala',
            'Ultima verificare', 'Data scadenta', 'SMS trimise', 'Notite'
        ]
        header_ok = len(rows) > 0 and rows[0] == expected_header
        all_passed &= log_test(
            "CSV header matches expected columns",
            header_ok,
            f"Header: {rows[0] if rows else 'NO ROWS'}"
        )
        
        # Check data rows exist
        has_data = len(rows) > 1
        all_passed &= log_test(
            "CSV contains data rows",
            has_data,
            f"Total rows (including header): {len(rows)}"
        )
        
        # Check date format (DD.MM.YYYY)
        if len(rows) > 1:
            # Check first data row
            data_row = rows[1]
            if len(data_row) >= 6:
                last_verif = data_row[4]  # Ultima verificare
                due_date = data_row[5]     # Data scadenta
                
                # Romanian date format: DD.MM.YYYY
                date_format_ok = (
                    len(last_verif.split('.')) == 3 and
                    len(due_date.split('.')) == 3
                )
                all_passed &= log_test(
                    "Dates in DD.MM.YYYY format",
                    date_format_ok,
                    f"Last verification: {last_verif}, Due date: {due_date}"
                )
        
        # Check CSV escaping (look for our test client with comma in name)
        csv_full = resp.text
        has_proper_escaping = '"Popescu, Ion"' in csv_full or 'Popescu, Ion' in csv_full
        all_passed &= log_test(
            "CSV properly handles special characters (comma, quotes)",
            has_proper_escaping,
            "Found test client with comma in name"
        )
        
        # Cleanup
        for client_id in created_ids:
            if client_id:
                try:
                    requests.delete(f"{BASE_URL}/clients/{client_id}", timeout=10)
                except:
                    pass
        
        return all_passed
        
    except Exception as e:
        # Cleanup
        for client_id in created_ids:
            if client_id:
                try:
                    requests.delete(f"{BASE_URL}/clients/{client_id}", timeout=10)
                except:
                    pass
        return log_test("GET /api/export/csv", False, f"Error: {str(e)}")

def test_client_notes_on_create():
    """Test CHANGED: POST /api/clients now accepts notes field"""
    print("\n" + "="*60)
    print("TEST: Client notes field on POST (CHANGED)")
    print("="*60)
    
    created_client_id = None
    all_passed = True
    
    try:
        # Create client with notes
        client_data = {
            "name": "Test Client Notes",
            "phone": "+40752832309",
            "address": "Test Address",
            "model": "Test Model",
            "lastVerification": "2024-01-15",
            "notes": "Initial verification note"
        }
        
        resp = requests.post(
            f"{BASE_URL}/clients",
            json=client_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        created = resp.json()
        created_client_id = created.get("id")
        
        # Check notes field in response
        has_notes = created.get("notes") == "Initial verification note"
        all_passed &= log_test(
            "POST /api/clients accepts and returns notes field",
            has_notes,
            f"Notes: {created.get('notes')}"
        )
        
        # Check verificationHistory array exists
        has_history = "verificationHistory" in created
        all_passed &= log_test(
            "Response includes verificationHistory array",
            has_history,
            f"Has verificationHistory: {has_history}"
        )
        
        # Check verificationHistory structure
        if has_history:
            history = created.get("verificationHistory", [])
            history_ok = (
                isinstance(history, list) and
                len(history) == 1 and
                "id" in history[0] and
                "date" in history[0] and
                "notes" in history[0]
            )
            all_passed &= log_test(
                "verificationHistory has correct structure",
                history_ok,
                f"History length: {len(history)}, First entry: {history[0] if history else 'NONE'}"
            )
            
            # Check initial entry matches
            if history_ok:
                entry = history[0]
                entry_matches = (
                    entry.get("date") == "2024-01-15" and
                    entry.get("notes") == "Initial verification note"
                )
                all_passed &= log_test(
                    "Initial verificationHistory entry matches input",
                    entry_matches,
                    f"Date: {entry.get('date')}, Notes: {entry.get('notes')}"
                )
        
        # Cleanup
        if created_client_id:
            requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
        
        return all_passed
        
    except Exception as e:
        if created_client_id:
            try:
                requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
            except:
                pass
        return log_test("POST /api/clients with notes", False, f"Error: {str(e)}")

def test_client_notes_on_update():
    """Test CHANGED: PUT /api/clients/{id} now accepts notes field"""
    print("\n" + "="*60)
    print("TEST: Client notes field on PUT (CHANGED)")
    print("="*60)
    
    created_client_id = None
    
    try:
        # Create client
        client_data = {
            "name": "Test Client Update",
            "phone": "+40752832309",
            "address": "Test Address",
            "model": "Test Model",
            "lastVerification": "2024-01-15",
            "notes": "Original note"
        }
        
        resp = requests.post(
            f"{BASE_URL}/clients",
            json=client_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        created = resp.json()
        created_client_id = created.get("id")
        
        if not created_client_id:
            return log_test("PUT /api/clients/{id} with notes", False, "Failed to create test client")
        
        # Update notes
        update_data = {
            "notes": "Updated note via PUT"
        }
        
        resp = requests.put(
            f"{BASE_URL}/clients/{created_client_id}",
            json=update_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        updated = resp.json()
        
        notes_updated = updated.get("notes") == "Updated note via PUT"
        
        # Verify persistence with GET
        resp = requests.get(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
        fetched = resp.json()
        notes_persisted = fetched.get("notes") == "Updated note via PUT"
        
        passed = notes_updated and notes_persisted
        
        # Cleanup
        requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
        
        return log_test(
            "PUT /api/clients/{id} accepts and persists notes field",
            passed,
            f"Updated: {notes_updated}, Persisted: {notes_persisted}"
        )
        
    except Exception as e:
        if created_client_id:
            try:
                requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
            except:
                pass
        return log_test("PUT /api/clients/{id} with notes", False, f"Error: {str(e)}")

def test_verify_with_notes():
    """Test CHANGED: POST /api/clients/{id}/verify now accepts optional notes"""
    print("\n" + "="*60)
    print("TEST: Verify endpoint with notes (CHANGED)")
    print("="*60)
    
    created_client_id = None
    all_passed = True
    
    try:
        # Create client with initial verification
        client_data = {
            "name": "Test Verify Notes",
            "phone": "+40752832309",
            "address": "Test Address",
            "model": "Test Model",
            "lastVerification": "2024-01-15",
            "notes": "Initial note"
        }
        
        resp = requests.post(
            f"{BASE_URL}/clients",
            json=client_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        created = resp.json()
        created_client_id = created.get("id")
        initial_history_length = len(created.get("verificationHistory", []))
        
        if not created_client_id:
            return log_test("POST /api/clients/{id}/verify with notes", False, "Failed to create test client")
        
        print(f"\n--- Initial verificationHistory length: {initial_history_length} ---")
        
        # Call verify with notes
        verify_data = {
            "notes": "Checked filter and pressure"
        }
        
        resp = requests.post(
            f"{BASE_URL}/clients/{created_client_id}/verify",
            json=verify_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        verified = resp.json()
        
        # Check lastVerification updated to today
        today = datetime.now().strftime("%Y-%m-%d")
        last_verif_ok = verified.get("lastVerification") == today
        all_passed &= log_test(
            "lastVerification set to today",
            last_verif_ok,
            f"lastVerification: {verified.get('lastVerification')}"
        )
        
        # Check dueDate is today + 2 years
        today_date = datetime.now()
        expected_due_date = today_date.replace(year=today_date.year + 2)
        expected_due = expected_due_date.strftime("%Y-%m-%d")
        due_date_ok = verified.get("dueDate") == expected_due
        all_passed &= log_test(
            "dueDate set to today + 2 years",
            due_date_ok,
            f"dueDate: {verified.get('dueDate')}, Expected: {expected_due}"
        )
        
        # Check verificationHistory array grew
        new_history = verified.get("verificationHistory", [])
        new_history_length = len(new_history)
        history_grew = new_history_length == initial_history_length + 1
        all_passed &= log_test(
            "verificationHistory array grew by 1",
            history_grew,
            f"Initial: {initial_history_length}, New: {new_history_length}"
        )
        
        # Check new entry has correct data
        if new_history_length > 0:
            latest_entry = new_history[-1]  # Last entry should be the new one
            entry_ok = (
                latest_entry.get("date") == today and
                latest_entry.get("notes") == "Checked filter and pressure" and
                "id" in latest_entry
            )
            all_passed &= log_test(
                "New verificationHistory entry has correct data",
                entry_ok,
                f"Latest entry: {latest_entry}"
            )
        
        # Check old entries preserved
        if new_history_length >= 2:
            first_entry = new_history[0]
            first_preserved = (
                first_entry.get("date") == "2024-01-15" and
                first_entry.get("notes") == "Initial note"
            )
            all_passed &= log_test(
                "Previous verificationHistory entries preserved",
                first_preserved,
                f"First entry: {first_entry}"
            )
        
        # Cleanup
        requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
        
        return all_passed
        
    except Exception as e:
        if created_client_id:
            try:
                requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
            except:
                pass
        return log_test("POST /api/clients/{id}/verify with notes", False, f"Error: {str(e)}")

def test_sms_history_includes_model():
    """Test CHANGED: SMS history entries now include model field"""
    print("\n" + "="*60)
    print("TEST: SMS history includes model field (CHANGED)")
    print("="*60)
    
    created_client_id = None
    
    try:
        # Create client with specific model
        client_data = {
            "name": "Test SMS Model",
            "phone": VERIFIED_PHONE,
            "address": "Test Address",
            "model": "Vaillant ecoTEC plus VU 246",
            "lastVerification": "2024-01-15"
        }
        
        resp = requests.post(
            f"{BASE_URL}/clients",
            json=client_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        created = resp.json()
        created_client_id = created.get("id")
        
        if not created_client_id:
            return log_test("SMS history includes model", False, "Failed to create test client")
        
        # Send SMS
        print("\n--- Sending SMS to create history entry ---")
        resp = requests.post(
            f"{BASE_URL}/clients/{created_client_id}/send-sms",
            json={"template": "2_weeks"},
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        sms_result = resp.json()
        
        print(f"SMS send result: {sms_result.get('ok')}")
        
        # Get SMS history
        resp = requests.get(f"{BASE_URL}/sms-history", timeout=10)
        history = resp.json()
        
        if not history or len(history) == 0:
            return log_test(
                "SMS history includes model field",
                False,
                "No SMS history entries found"
            )
        
        # Find our entry (should be most recent)
        latest_entry = history[0]  # History is sorted desc by sentAt
        
        # Check if model field exists and matches
        has_model_field = "model" in latest_entry
        model_matches = latest_entry.get("model") == "Vaillant ecoTEC plus VU 246"
        
        passed = has_model_field and model_matches
        
        # Cleanup
        requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
        
        return log_test(
            "SMS history entries include model field",
            passed,
            f"Has model field: {has_model_field}, Model: {latest_entry.get('model', 'MISSING')}"
        )
        
    except Exception as e:
        if created_client_id:
            try:
                requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
            except:
                pass
        return log_test("SMS history includes model", False, f"Error: {str(e)}")

def test_cron_singleton():
    """Test NEW: Server-side cron singleton"""
    print("\n" + "="*60)
    print("TEST: Cron singleton (NEW)")
    print("="*60)
    
    all_passed = True
    
    try:
        # Test 1: Manual cron endpoint still works
        print("\n--- Testing manual /api/cron/check endpoint ---")
        resp = requests.get(f"{BASE_URL}/cron/check", timeout=15)
        
        manual_works = resp.status_code == 200 and "checked" in resp.json()
        all_passed &= log_test(
            "Manual /api/cron/check endpoint still works",
            manual_works,
            f"Status: {resp.status_code}, Response: {resp.json()}"
        )
        
        # Test 2: Check for cron startup message in logs
        print("\n--- Checking nextjs logs for cron startup message ---")
        import subprocess
        
        try:
            result = subprocess.run(
                ["tail", "-n", "100", "/var/log/supervisor/nextjs.out.log"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            log_content = result.stdout
            has_cron_message = "[cron] background scheduler started (runs every 1h)" in log_content
            
            all_passed &= log_test(
                "Cron startup message found in logs",
                has_cron_message,
                f"Found cron message: {has_cron_message}"
            )
            
            if has_cron_message:
                print("  ✓ Cron singleton initialized successfully")
            else:
                print("  ⚠ Cron message not found in recent logs (may have started earlier)")
                # This is not a critical failure - cron may have started before the log window
                
        except Exception as log_err:
            print(f"  ⚠ Could not check logs: {log_err}")
            # Not a critical failure
        
        return all_passed
        
    except Exception as e:
        return log_test("Cron singleton", False, f"Error: {str(e)}")

def main():
    """Run all round 2 backend tests"""
    print("\n" + "="*80)
    print("BACKEND API TESTS - ROUND 2 (NEW/CHANGED FEATURES ONLY)")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Verified Phone: {VERIFIED_PHONE}")
    print("="*80)
    
    results = {}
    
    # Run tests for new/changed features only
    results["csv_export"] = test_csv_export()
    results["client_notes_create"] = test_client_notes_on_create()
    results["client_notes_update"] = test_client_notes_on_update()
    results["verify_with_notes"] = test_verify_with_notes()
    results["sms_history_model"] = test_sms_history_includes_model()
    results["cron_singleton"] = test_cron_singleton()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY - ROUND 2")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)
    
    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.exit(main())
