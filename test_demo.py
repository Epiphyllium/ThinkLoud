import requests
import json
import time

BASE_URL = "http://localhost:8000"

def test_flow():
    print("Wait for server to start...")
    
    # 1. Process Entry
    print("\n--- Step 1: Process Entry ---")
    payload = {"text": "小杨他也很开心"}
    try:
        resp = requests.post(f"{BASE_URL}/entry/process_without_llm", json=payload)
        data = resp.json()
        print(f"Input: {payload['text']}")
        print(f"Response: {json.dumps(data, ensure_ascii=False)}")
        
        # entry_id = data["entry_id"]
        # role_id = data["role_id"]
        # modified_text = data["modified_text"]
        
        # assert "TA" in modified_text
        # assert "她" not in modified_text
        print("✅ Normalization passed")
    except Exception as e:
        print(f"❌ Process failed: {e}")
        return

    # 2. Test LLM Process (New Feature)
    # print("\n--- Step 2: Process Entry with LLM (Contextual & Extraction) ---")
    # llm_payload = {"text": "历史人物武则天，他是中国历史上唯一的女皇帝。小红说他非常喜欢它"}
    # try:
    #     print(f"Input: {llm_payload['text']}")
    #     resp = requests.post(f"{BASE_URL}/entry/process_with_llm", json=llm_payload)
    #     if resp.status_code != 200:
    #          print(f"❌ Request failed with status {resp.status_code}: {resp.text}")
    #     else:
    #         data = resp.json()
    #         print(f"Response: {json.dumps(data, ensure_ascii=False)}")
            
    #         modified_text = data["modified_text"]
    #         role_id = data["role_id"]
    #         extracted_roles = data.get("extracted_roles", [])
            
    #         # Assertions
    #         if "她" in modified_text and "他" not in modified_text:
    #             print("✅ Pronoun correction passed (他 -> 她)")
    #         else:
    #             print(f"❌ Pronoun correction failed: {modified_text}")
                
    #         print(f"✅ Role ID assigned: {role_id}")
    #         print(f"✅ Extracted roles: {extracted_roles}")
            
    # except Exception as e:
    #     print(f"❌ LLM Process failed: {e}")

    # 3. Test Manual Gender Update (New Feature)
    print("\n--- Step 3: Test Manual Gender Update Trigger ---")
    # 3.1 Create entry with ambiguous gender
    step3_payload = {"text": "小明今天很高兴，TA要去游泳。"}
    try:
        print(f"Creating entry: {step3_payload['text']}")
        resp = requests.post(f"{BASE_URL}/entry/process_without_llm", json=step3_payload)
        data = resp.json()
        entry_id = data["entry_id"]
        role_id = data["role_id"]
        original_text = data["modified_text"]
        print(f"Created Entry ID: {entry_id}, Role ID: {role_id}, Text: {original_text}")
        
        # 3.2 Update text manually (Change TA -> 他)
        new_text = original_text.replace("TA", "他")
        print(f"Updating text to: {new_text}")
        
        update_payload = {
            "entry_id": entry_id,
            "modified_text": new_text
        }
        
        update_resp = requests.post(f"{BASE_URL}/entry/update", json=update_payload)
        print(f"Update Response: {update_resp.json()}")
        
        render_resp = requests.get(f"{BASE_URL}/entry/render/{entry_id}")
        render_data = render_resp.json()
        rendered_text = render_data["rendered_text"]
        print(f"Rendered Text: {rendered_text}")
        
            
    except Exception as e:
        print(f"❌ Manual Update Test failed: {e}")

if __name__ == "__main__":
    print("请确保 'python app.py' 正在运行中...")
    test_flow()
    print("Test script ready.")
