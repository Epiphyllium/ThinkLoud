import os
import requests
import json
from typing import Optional, Tuple, Dict, Any, List
from prompts import GENDER_INFERENCE_PROMPT, PRONOUN_CORRECTION_PROMPT

# Configuration
OPENROUTER_API_KEY = "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"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
# Using Kimi k2 via OpenRouter as requested
MODEL_NAME = "moonshotai/kimi-k2" 

def get_llm_response(prompt: str, model: str = MODEL_NAME, temperature: float = 0.1) -> Optional[str]:
    """
    Send a prompt to the LLM and return the response content.
    """
    if not OPENROUTER_API_KEY:
        print("Warning: OPENROUTER_API_KEY not set.")
        return None

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://thinkloud.demo", 
        "X-Title": "ThinkLoud", 
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": temperature,
    }

    try:
        response = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if not data.get('choices'):
            return None
            
        return data['choices'][0]['message']['content'].strip()
            
    except Exception as e:
        print(f"LLM Request Error: {e}")
        return None

def infer_gender_with_llm(modified_text: str, original_text: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Uses OpenRouter (Kimi k2) to infer gender and role info from text changes.
    Returns a dict with keys: "role", "gender", "nickname", or None if failed.
    """
    # Format the prompt
    if original_text is None:
        original_text = ""
        
    prompt = GENDER_INFERENCE_PROMPT.format(original_text=original_text, modified_text=modified_text)
    
    # Call generic LLM function
    content = get_llm_response(prompt, temperature=0.1)
    
    if not content:
        return None
        
    try:
        # Try to parse JSON from the response
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
             content = content.split("```")[1].split("```")[0].strip()
             
        data = json.loads(content)
        return {
            "role": data.get("role"),
            "gender": data.get("gender"),
            "nickname": data.get("nickname")
        }
    except Exception as e:
        print(f"Error parsing Gender Inference JSON response: {e}")
        print(f"Raw response: {content}")
        return None

def correct_pronouns_with_llm(text: str, roles: list[dict]) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """
    Uses LLM to correct pronouns and extract roles.
    Returns (modified_text, extracted_roles_list)
    """
    # Format roles context
    roles_context_lines = []
    if not roles:
        roles_context_lines.append("- 无已知角色")
    else:
        for role in roles:
            name = role.get("name") or "Unknown"
            nickname = role.get("nickname") or ""
            gender = role.get("gender") or "未知"
            roles_context_lines.append(f"- {name}({nickname}): {gender}")
            
    roles_context_str = "\n".join(roles_context_lines)
    
    # Format prompt
    prompt = PRONOUN_CORRECTION_PROMPT.format(
        roles_context=roles_context_str,
        text=text
    )
    
    # Call LLM
    response_content = get_llm_response(prompt, temperature=0.1)
    
    if not response_content:
        return None, []
        
    try:
        # Try to parse JSON from the response
        # Sometimes LLMs wrap JSON in ```json ... ```
        if "```json" in response_content:
            response_content = response_content.split("```json")[1].split("```")[0].strip()
        elif "```" in response_content:
             response_content = response_content.split("```")[1].split("```")[0].strip()
             
        data = json.loads(response_content)
        modified_text = data.get("modified_text")
        roles = data.get("roles", [])
        return modified_text, roles
    except Exception as e:
        print(f"Error parsing LLM JSON response: {e}")
        print(f"Raw response: {response_content}")
        # If parsing fails, it might be that the LLM returned just text (old behavior) or malformed JSON
        # Let's try to return the raw content as modified_text if it looks reasonable, but extracted_roles will be empty
        # However, our prompt EXPLICITLY asks for JSON, so failure is failure.
        return None, []


def mock_llm_check_same_role(text: str, role_context: str) -> bool:
    """
    Mock LLM: 判断当前文本是否指代历史角色
    Demo 阶段始终返回 True
    """
    return True

if __name__ == "__main__":
    # Test the LLM response function
    test_prompt = "你好"
    print(f"Testing prompt: {test_prompt}") 
    response = get_llm_response(test_prompt)
    print(f"LLM Response for '{test_prompt}': {response}")
