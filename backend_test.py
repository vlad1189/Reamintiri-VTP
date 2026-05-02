#!/usr/bin/env python3
"""
Backend API tests for Romanian SMS reminder app
Tests all endpoints at https://inspection-notify.preview.emergentagent.com/api
"""

import requests
import json
from datetime import datetime, timedelta
import sys

BASE_URL = "https://inspection-notify.preview.emergentagent.com/api"
VERIFIED_PHONE = "+40752832309"  # Only verified Vonage test number

# Test data
TEST_CLIENT_DATA = {
    "name": "Ion Popescu",
    "phone": "+40752832309",  # Using verified number
    "address": "Str. Mihai Viteazu nr. 15, Bucuresti",
    "model": "Vaillant ecoTEC plus",
    "lastVerification": "2024-01-15"
}

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {test_name}")
    if details:
        print(f"  Details: {details}")
    return passed

def test_health():
    """Test GET /api/health"""
    print("\n" + "="*60)
    print("TEST: Health Check")
    print("="*60)
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=10)
        data = resp.json()
        
        passed = (
            resp.status_code == 200 and
            data.get("ok") == True and
            data.get("service") == "reamintiri-vtp"
        )
        
        return log_test(
            "GET /api/health",
            passed,
            f"Status: {resp.status_code}, Response: {json.dumps(data)}"
        )
    except Exception as e:
        return log_test("GET /api/health", False, f"Error: {str(e)}")

def test_settings_get():
    """Test GET /api/settings"""
    print("\n" + "="*60)
    print("TEST: Get Settings")
    print("="*60)
    try:
        resp = requests.get(f"{BASE_URL}/settings", timeout=10)
        data = resp.json()
        
        # Check required fields
        required_fields = ["messageTwoWeeks", "messageDueDate", "contactPhone"]
        has_all_fields = all(field in data for field in required_fields)
        
        # Check no MongoDB _id leaked
        has_no_mongo_id = "_id" not in data
        
        passed = (
            resp.status_code == 200 and
            has_all_fields and
            has_no_mongo_id
        )
        
        return log_test(
            "GET /api/settings",
            passed,
            f"Status: {resp.status_code}, Has all fields: {has_all_fields}, No _id: {has_no_mongo_id}"
        ), data
    except Exception as e:
        return log_test("GET /api/settings", False, f"Error: {str(e)}"), None

def test_settings_put():
    """Test PUT /api/settings"""
    print("\n" + "="*60)
    print("TEST: Update Settings")
    print("="*60)
    try:
        # First get current settings
        get_resp = requests.get(f"{BASE_URL}/settings", timeout=10)
        original = get_resp.json()
        
        # Update with new values
        new_settings = {
            "messageTwoWeeks": "Test message 2 weeks: {nume}, {model}, {data}",
            "messageDueDate": "Test message due date: {nume}, {model}, {data}",
            "contactPhone": "+40752832309"
        }
        
        put_resp = requests.put(
            f"{BASE_URL}/settings",
            json=new_settings,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        updated = put_resp.json()
        
        # Verify update
        get_resp2 = requests.get(f"{BASE_URL}/settings", timeout=10)
        persisted = get_resp2.json()
        
        passed = (
            put_resp.status_code == 200 and
            updated.get("messageTwoWeeks") == new_settings["messageTwoWeeks"] and
            persisted.get("messageTwoWeeks") == new_settings["messageTwoWeeks"] and
            "_id" not in updated
        )
        
        # Restore original settings
        requests.put(
            f"{BASE_URL}/settings",
            json=original,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        return log_test(
            "PUT /api/settings",
            passed,
            f"Status: {put_resp.status_code}, Settings persisted: {persisted.get('messageTwoWeeks') == new_settings['messageTwoWeeks']}"
        )
    except Exception as e:
        return log_test("PUT /api/settings", False, f"Error: {str(e)}")

def test_clients_crud():
    """Test Clients CRUD operations"""
    print("\n" + "="*60)
    print("TEST: Clients CRUD")
    print("="*60)
    
    created_client_id = None
    all_passed = True
    
    try:
        # 1. GET /api/clients (list)
        print("\n--- GET /api/clients (list) ---")
        resp = requests.get(f"{BASE_URL}/clients", timeout=10)
        clients_list = resp.json()
        
        passed = resp.status_code == 200 and isinstance(clients_list, list)
        all_passed &= log_test(
            "GET /api/clients (list)",
            passed,
            f"Status: {resp.status_code}, Count: {len(clients_list)}"
        )
        
        # Check no _id in list
        if clients_list:
            has_no_id = all("_id" not in c for c in clients_list)
            all_passed &= log_test(
                "No MongoDB _id in clients list",
                has_no_id,
                f"All clients have no _id: {has_no_id}"
            )
        
        # 2. POST /api/clients (create)
        print("\n--- POST /api/clients (create) ---")
        resp = requests.post(
            f"{BASE_URL}/clients",
            json=TEST_CLIENT_DATA,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        created = resp.json()
        created_client_id = created.get("id")
        
        # Verify dueDate calculation (lastVerification + 2 years)
        expected_due = "2026-01-15"  # 2024-01-15 + 2 years
        actual_due = created.get("dueDate")
        
        passed = (
            resp.status_code == 200 and
            created_client_id is not None and
            created.get("name") == TEST_CLIENT_DATA["name"] and
            actual_due == expected_due and
            "_id" not in created and
            "id" in created
        )
        
        all_passed &= log_test(
            "POST /api/clients (create)",
            passed,
            f"Status: {resp.status_code}, ID: {created_client_id}, dueDate correct: {actual_due == expected_due}"
        )
        
        if not created_client_id:
            print("❌ Cannot continue CRUD tests without client ID")
            return False
        
        # 3. GET /api/clients/{id} (single)
        print("\n--- GET /api/clients/{id} (single) ---")
        resp = requests.get(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
        client = resp.json()
        
        passed = (
            resp.status_code == 200 and
            client.get("id") == created_client_id and
            client.get("name") == TEST_CLIENT_DATA["name"] and
            "_id" not in client
        )
        
        all_passed &= log_test(
            "GET /api/clients/{id}",
            passed,
            f"Status: {resp.status_code}, Name matches: {client.get('name') == TEST_CLIENT_DATA['name']}"
        )
        
        # 4. PUT /api/clients/{id} (update)
        print("\n--- PUT /api/clients/{id} (update) ---")
        update_data = {
            "name": "Ion Popescu Updated",
            "model": "Ariston CLAS ONE",
            "lastVerification": "2025-03-20"  # Change lastVerification to trigger dueDate recalc
        }
        
        resp = requests.put(
            f"{BASE_URL}/clients/{created_client_id}",
            json=update_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        updated = resp.json()
        
        # Verify dueDate recalculation
        expected_new_due = "2027-03-20"  # 2025-03-20 + 2 years
        actual_new_due = updated.get("dueDate")
        
        passed = (
            resp.status_code == 200 and
            updated.get("name") == update_data["name"] and
            updated.get("model") == update_data["model"] and
            actual_new_due == expected_new_due and
            "_id" not in updated
        )
        
        all_passed &= log_test(
            "PUT /api/clients/{id} with dueDate recalc",
            passed,
            f"Status: {resp.status_code}, dueDate recalculated: {actual_new_due == expected_new_due}"
        )
        
        # 5. DELETE /api/clients/{id}
        print("\n--- DELETE /api/clients/{id} ---")
        resp = requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
        delete_result = resp.json()
        
        passed = resp.status_code == 200 and delete_result.get("ok") == True
        all_passed &= log_test(
            "DELETE /api/clients/{id}",
            passed,
            f"Status: {resp.status_code}, OK: {delete_result.get('ok')}"
        )
        
        # 6. Verify deletion (should get 404)
        print("\n--- Verify client deleted (404) ---")
        resp = requests.get(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
        
        passed = resp.status_code == 404
        all_passed &= log_test(
            "GET deleted client returns 404",
            passed,
            f"Status: {resp.status_code}"
        )
        
        return all_passed
        
    except Exception as e:
        log_test("Clients CRUD", False, f"Error: {str(e)}")
        # Cleanup
        if created_client_id:
            try:
                requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
            except:
                pass
        return False

def test_verify_endpoint():
    """Test POST /api/clients/{id}/verify"""
    print("\n" + "="*60)
    print("TEST: Mark Client Verified")
    print("="*60)
    
    created_client_id = None
    
    try:
        # Create a test client
        resp = requests.post(
            f"{BASE_URL}/clients",
            json=TEST_CLIENT_DATA,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        created = resp.json()
        created_client_id = created.get("id")
        
        if not created_client_id:
            return log_test("POST /api/clients/{id}/verify", False, "Failed to create test client")
        
        # Mark as verified today
        resp = requests.post(f"{BASE_URL}/clients/{created_client_id}/verify", timeout=10)
        verified = resp.json()
        
        # Calculate expected dueDate (today + 2 years) - use same logic as backend
        today = datetime.now().strftime("%Y-%m-%d")
        today_date = datetime.now()
        expected_due_date = today_date.replace(year=today_date.year + 2)
        expected_due = expected_due_date.strftime("%Y-%m-%d")
        
        passed = (
            resp.status_code == 200 and
            verified.get("lastVerification") == today and
            verified.get("dueDate") == expected_due and
            verified.get("smsTwoWeeksSent") == False and
            verified.get("smsDueDateSent") == False and
            "_id" not in verified
        )
        
        # Cleanup
        requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
        
        return log_test(
            "POST /api/clients/{id}/verify",
            passed,
            f"Status: {resp.status_code}, lastVerification: {verified.get('lastVerification')}, dueDate: {verified.get('dueDate')}, Flags reset: {not verified.get('smsTwoWeeksSent')}"
        )
        
    except Exception as e:
        if created_client_id:
            try:
                requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
            except:
                pass
        return log_test("POST /api/clients/{id}/verify", False, f"Error: {str(e)}")

def test_send_sms():
    """Test POST /api/clients/{id}/send-sms"""
    print("\n" + "="*60)
    print("TEST: Send SMS")
    print("="*60)
    
    created_client_id = None
    all_passed = True
    
    try:
        # Create a test client with verified phone
        client_data = TEST_CLIENT_DATA.copy()
        client_data["phone"] = VERIFIED_PHONE
        
        resp = requests.post(
            f"{BASE_URL}/clients",
            json=client_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        created = resp.json()
        created_client_id = created.get("id")
        initial_sms_count = created.get("smsCount", 0)
        
        if not created_client_id:
            return log_test("POST /api/clients/{id}/send-sms", False, "Failed to create test client")
        
        # Test 1: Send SMS with template (2_weeks)
        print("\n--- Send SMS with template '2_weeks' ---")
        resp = requests.post(
            f"{BASE_URL}/clients/{created_client_id}/send-sms",
            json={"template": "2_weeks"},
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        result = resp.json()
        
        # Check response structure
        has_required_fields = "ok" in result and "sentText" in result
        has_placeholders_replaced = (
            "{nume}" not in result.get("sentText", "") and
            "{model}" not in result.get("sentText", "")
        )
        
        passed = (
            resp.status_code in [200, 500] and  # 500 is acceptable if Vonage fails
            has_required_fields and
            has_placeholders_replaced and
            isinstance(result.get("ok"), bool)
        )
        
        all_passed &= log_test(
            "POST /api/clients/{id}/send-sms with template",
            passed,
            f"Status: {resp.status_code}, OK: {result.get('ok')}, Has sentText: {'sentText' in result}, Placeholders replaced: {has_placeholders_replaced}"
        )
        
        # If SMS was successful, verify smsCount incremented
        if result.get("ok"):
            resp = requests.get(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
            updated_client = resp.json()
            new_sms_count = updated_client.get("smsCount", 0)
            
            count_incremented = new_sms_count == initial_sms_count + 1
            all_passed &= log_test(
                "smsCount incremented after successful SMS",
                count_incremented,
                f"Initial: {initial_sms_count}, New: {new_sms_count}"
            )
        
        # Test 2: Send SMS with custom message
        print("\n--- Send SMS with custom message ---")
        custom_msg = "Test custom SMS message for {nume}"
        resp = requests.post(
            f"{BASE_URL}/clients/{created_client_id}/send-sms",
            json={"message": custom_msg},
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        result = resp.json()
        
        passed = (
            resp.status_code in [200, 500] and
            "ok" in result and
            "sentText" in result
        )
        
        all_passed &= log_test(
            "POST /api/clients/{id}/send-sms with custom message",
            passed,
            f"Status: {resp.status_code}, OK: {result.get('ok')}"
        )
        
        # Test 3: Send to non-verified number (should not crash)
        print("\n--- Send SMS to non-verified number ---")
        # Create client with non-verified number
        non_verified_data = TEST_CLIENT_DATA.copy()
        non_verified_data["phone"] = "+40712345678"  # Non-verified
        
        resp = requests.post(
            f"{BASE_URL}/clients",
            json=non_verified_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        non_verified_client = resp.json()
        non_verified_id = non_verified_client.get("id")
        
        if non_verified_id:
            resp = requests.post(
                f"{BASE_URL}/clients/{non_verified_id}/send-sms",
                json={"template": "2_weeks"},
                headers={"Content-Type": "application/json"},
                timeout=15
            )
            result = resp.json()
            
            # Should return proper JSON, not crash
            passed = (
                resp.status_code in [200, 500] and
                isinstance(result, dict) and
                "ok" in result
            )
            
            all_passed &= log_test(
                "Send SMS to non-verified number (no crash)",
                passed,
                f"Status: {resp.status_code}, Returns JSON: {isinstance(result, dict)}, OK field: {result.get('ok')}"
            )
            
            # Cleanup non-verified client
            requests.delete(f"{BASE_URL}/clients/{non_verified_id}", timeout=10)
        
        # Cleanup
        requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
        
        return all_passed
        
    except Exception as e:
        if created_client_id:
            try:
                requests.delete(f"{BASE_URL}/clients/{created_client_id}", timeout=10)
            except:
                pass
        return log_test("POST /api/clients/{id}/send-sms", False, f"Error: {str(e)}")

def test_sms_history():
    """Test GET /api/sms-history"""
    print("\n" + "="*60)
    print("TEST: SMS History")
    print("="*60)
    
    try:
        resp = requests.get(f"{BASE_URL}/sms-history", timeout=10)
        history = resp.json()
        
        passed = resp.status_code == 200 and isinstance(history, list)
        
        # Check structure if history exists
        if history:
            first_entry = history[0]
            required_fields = ["id", "clientId", "clientName", "phone", "type", "message", "status", "sentAt"]
            has_all_fields = all(field in first_entry for field in required_fields)
            has_no_mongo_id = "_id" not in first_entry
            
            passed = passed and has_all_fields and has_no_mongo_id
            
            return log_test(
                "GET /api/sms-history",
                passed,
                f"Status: {resp.status_code}, Count: {len(history)}, Has all fields: {has_all_fields}, No _id: {has_no_mongo_id}"
            )
        else:
            return log_test(
                "GET /api/sms-history",
                passed,
                f"Status: {resp.status_code}, Count: 0 (empty history)"
            )
        
    except Exception as e:
        return log_test("GET /api/sms-history", False, f"Error: {str(e)}")

def test_cron_check():
    """Test POST /api/cron/check"""
    print("\n" + "="*60)
    print("TEST: Cron Check")
    print("="*60)
    
    created_ids = []
    
    try:
        # Create clients with different due dates
        # Client 1: Due in 13 days (should trigger 2-week SMS)
        due_in_13_days = (datetime.now() + timedelta(days=13)).strftime("%Y-%m-%d")
        last_verif_13 = (datetime.now() - timedelta(days=730-13)).strftime("%Y-%m-%d")
        
        client1_data = {
            "name": "Test Client 13 Days",
            "phone": VERIFIED_PHONE,
            "address": "Test Address 1",
            "model": "Test Model 1",
            "lastVerification": last_verif_13
        }
        
        resp = requests.post(
            f"{BASE_URL}/clients",
            json=client1_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        client1 = resp.json()
        created_ids.append(client1.get("id"))
        
        # Client 2: Due yesterday (should trigger due-date SMS)
        due_yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        last_verif_yesterday = (datetime.now() - timedelta(days=731)).strftime("%Y-%m-%d")
        
        client2_data = {
            "name": "Test Client Due Yesterday",
            "phone": VERIFIED_PHONE,
            "address": "Test Address 2",
            "model": "Test Model 2",
            "lastVerification": last_verif_yesterday
        }
        
        resp = requests.post(
            f"{BASE_URL}/clients",
            json=client2_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        client2 = resp.json()
        created_ids.append(client2.get("id"))
        
        # Run cron check
        print("\n--- Running cron check ---")
        resp = requests.post(f"{BASE_URL}/cron/check", timeout=30)
        result = resp.json()
        
        passed = (
            resp.status_code == 200 and
            "checked" in result and
            "sent" in result and
            isinstance(result.get("sent"), list)
        )
        
        log_test(
            "POST /api/cron/check",
            passed,
            f"Status: {resp.status_code}, Checked: {result.get('checked')}, Sent: {len(result.get('sent', []))}"
        )
        
        # Cleanup
        for client_id in created_ids:
            if client_id:
                try:
                    requests.delete(f"{BASE_URL}/clients/{client_id}", timeout=10)
                except:
                    pass
        
        return passed
        
    except Exception as e:
        # Cleanup
        for client_id in created_ids:
            if client_id:
                try:
                    requests.delete(f"{BASE_URL}/clients/{client_id}", timeout=10)
                except:
                    pass
        return log_test("POST /api/cron/check", False, f"Error: {str(e)}")

def main():
    """Run all backend tests"""
    print("\n" + "="*80)
    print("BACKEND API TESTS - Romanian SMS Reminder App")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Verified Phone: {VERIFIED_PHONE}")
    print("="*80)
    
    results = {}
    
    # Run tests
    results["health"] = test_health()
    
    settings_result, _ = test_settings_get()
    results["settings_get"] = settings_result
    
    results["settings_put"] = test_settings_put()
    results["clients_crud"] = test_clients_crud()
    results["verify"] = test_verify_endpoint()
    results["send_sms"] = test_send_sms()
    results["sms_history"] = test_sms_history()
    results["cron_check"] = test_cron_check()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
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
