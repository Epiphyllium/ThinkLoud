import unittest
from unittest.mock import patch, MagicMock
import json
import os
import sys
import shutil
import uuid
from fastapi.testclient import TestClient

# Add project root to sys.path to allow importing app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import app
from app import app, db, JSONDatabase

class TestThinkLoudScenarios(unittest.TestCase):
    def setUp(self):
        # Setup temporary DB files
        self.test_roles_file = "test_roles.json"
        self.test_entries_file = "test_entries.json"
        
        # Initialize empty files
        with open(self.test_roles_file, 'w') as f:
            json.dump({}, f)
        with open(self.test_entries_file, 'w') as f:
            json.dump({}, f)
            
        # Re-initialize DB with test files
        self.db = JSONDatabase(roles_file=self.test_roles_file, entries_file=self.test_entries_file)
        
        # Patch the global db object in app
        self.original_db = db
        # We need to update the global db in app module. 
        # Since we imported 'db' from app, updating 'db' here only updates local reference.
        # We need to update app.db
        import app as app_module
        app_module.db = self.db
        
        self.client = TestClient(app)

    def tearDown(self):
        # Restore original DB
        import app as app_module
        app_module.db = self.original_db
        
        # Cleanup temp files
        if os.path.exists(self.test_roles_file):
            os.remove(self.test_roles_file)
        if os.path.exists(self.test_entries_file):
            os.remove(self.test_entries_file)

    def test_scenario_1_manual_role_association(self):
        """
        Scenario 1: User clicks a name to associate a role (Manual Update).
        We simulate this by creating an entry and a role, then updating the entry to point to that role.
        """
        print("\nRunning Scenario 1: Manual Role Association...")
        
        # 1. Create a Role manually in DB
        role_id = str(uuid.uuid4())
        role_data = {
            "role_id": role_id,
            "name": "ExistingRole",
            "gender": "Female",
            "nickname": None,
            "context_summary": ""
        }
        self.db.add_role(role_data)
        
        # 2. Create an Entry (initially pointing to nothing or a temp role)
        # We'll use the API to create one without LLM first
        resp = self.client.post("/entry/process_without_llm", json={"text": "Some text"})
        self.assertEqual(resp.status_code, 200)
        entry_id = resp.json()["entry_id"]
        
        # 3. Update the entry to associate with 'ExistingRole'
        payload = {
            "entry_id": entry_id,
            "role_id": role_id,
            "skip_llm_inference": True
        }
        update_resp = self.client.post("/entry/update", json=payload)
        
        # Assertions
        self.assertEqual(update_resp.status_code, 200)
        self.assertTrue(update_resp.json()["success"])
        self.assertIn("(Direct)", update_resp.json()["message"])
        
        # Verify in DB
        updated_entry = self.db.get_entry(entry_id)
        self.assertEqual(updated_entry["role_id"], role_id)
        print("Scenario 1 Passed!")

    @patch('app.infer_gender_with_llm')
    def test_scenario_2_smart_text_update(self, mock_infer):
        """
        Scenario 2: User edits text, triggering LLM gender inference.
        """
        print("\nRunning Scenario 2: Smart Text Update...")
        
        # Setup Mock LLM response
        mock_infer.return_value = {
            "role": "小红",
            "gender": "Female",
            "nickname": None
        }
        
        # 1. Create an entry with "TA" (Unknown gender)
        # First create a role for it
        role_id = str(uuid.uuid4())
        self.db.add_role({
            "role_id": role_id,
            "name": "小红",
            "gender": None, # Initially unknown
            "nickname": None,
            "context_summary": ""
        })
        
        entry_id = str(uuid.uuid4())
        self.db.add_entry({
            "entry_id": entry_id,
            "role_id": role_id,
            "original_input": "TA今天很开心",
            "modified_text": "TA今天很开心"
        })
        
        # 2. User updates text "TA" -> "她"
        payload = {
            "entry_id": entry_id,
            "modified_text": "她今天很开心",
            # skip_llm_inference defaults to False
        }
        
        update_resp = self.client.post("/entry/update", json=payload)
        
        # Assertions
        self.assertEqual(update_resp.status_code, 200)
        self.assertIn("Smart", update_resp.json()["message"])
        
        # Verify Role was updated
        updated_role = self.db.get_role(role_id)
        self.assertEqual(updated_role["gender"], "Female")
        print("Scenario 2 Passed!")

    def test_scenario_3_process_without_llm(self):
        """
        Scenario 3: User inputs text, processed without LLM (Rule-based).
        """
        print("\nRunning Scenario 3: Process Without LLM...")
        
        # 1. Pre-seed a role to test auto-linking
        role_id = str(uuid.uuid4())
        self.db.add_role({
            "role_id": role_id,
            "name": "张三",
            "gender": "Male",
            "nickname": None,
            "context_summary": ""
        })
        
        # 2. Input text mentioning "张三"
        text = "张三来了。他很高兴。"
        resp = self.client.post("/entry/process_without_llm", json={"text": text})
        
        # Assertions
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsNotNone(data["entry_id"])
        
        # Check if it linked to existing role
        self.assertEqual(data["role_id"], role_id)
        
        # Check text normalization/processing (our rule engine might keep '他' if gender matches)
        # advanced_process_text logic: "他" -> match "Male" -> keep "Male" (or replace with gender specific char if needed, but here it returns normalized text)
        # Actually advanced_process_text returns constructed text. 
        # If gender is Male, it might output "他" or whatever the logic does.
        # Let's just check the response structure for now.
        print(f"Processed Text: {data['modified_text']}")
        print("Scenario 3 Passed!")

    @patch('app.correct_pronouns_with_llm')
    def test_scenario_4_process_with_llm(self, mock_correct):
        """
        Scenario 4: User inputs text, processed WITH LLM.
        """
        print("\nRunning Scenario 4: Process With LLM...")
        
        # Setup Mock
        mock_correct.return_value = (
            "历史人物武则天，她是中国历史上唯一的女皇帝。", # modified_text
            [{"name": "武则天", "gender": "Female"}] # extracted_roles
        )
        
        text = "历史人物武则天，他是中国历史上唯一的女皇帝。"
        resp = self.client.post("/entry/process_with_llm", json={"text": text})
        
        # Assertions
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        
        self.assertEqual(data["modified_text"], "历史人物武则天，她是中国历史上唯一的女皇帝。")
        self.assertEqual(data["extracted_roles"][0]["name"], "武则天")
        
        # Verify a new role was created for "武则天"
        roles = self.db.get_all_roles()
        found_role = next((r for r in roles if r["name"] == "武则天"), None)
        self.assertIsNotNone(found_role)
        self.assertEqual(found_role["gender"], "Female")
        
        # Verify entry is linked to this role
        self.assertEqual(data["role_id"], found_role["role_id"])
        print("Scenario 4 Passed!")

if __name__ == '__main__':
    unittest.main()
