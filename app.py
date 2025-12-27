import uuid
import re
import json
import os
from typing import Dict, Optional, List, Tuple
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from llm_service import infer_gender_with_llm, mock_llm_check_same_role, correct_pronouns_with_llm

app = FastAPI(title="ThinkLoud Demo Backend")

# --- 数据持久化层 ---
class JSONDatabase:
    def __init__(self, roles_file="roles.json", entries_file="entries.json"):
        self.roles_file = roles_file
        self.entries_file = entries_file
        self.roles: Dict[str, dict] = {}
        self.entries: Dict[str, dict] = {}
        self._load()

    def _load(self):
        """从 JSON 文件加载数据"""
        # Load Roles
        if os.path.exists(self.roles_file):
            try:
                with open(self.roles_file, "r", encoding="utf-8") as f:
                    self.roles = json.load(f)
            except Exception as e:
                print(f"Error loading roles: {e}")
        
        # Load Entries
        if os.path.exists(self.entries_file):
            try:
                with open(self.entries_file, "r", encoding="utf-8") as f:
                    self.entries = json.load(f)
            except Exception as e:
                print(f"Error loading entries: {e}")

    def _save_roles(self):
        try:
            with open(self.roles_file, "w", encoding="utf-8") as f:
                json.dump(self.roles, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving roles: {e}")

    def _save_entries(self):
        try:
            with open(self.entries_file, "w", encoding="utf-8") as f:
                json.dump(self.entries, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving entries: {e}")

    # Role Operations
    def get_role(self, role_id: str) -> Optional[dict]:
        return self.roles.get(role_id)
    
    def get_all_roles(self) -> List[dict]:
        return list(self.roles.values())

    def add_role(self, role: dict):
        self.roles[role["role_id"]] = role
        self._save_roles()

    def update_role(self, role_id: str, updates: dict):
        if role_id in self.roles:
            self.roles[role_id].update(updates)
            self._save_roles()
            return True
        return False

    def delete_role(self, role_id: str):
        if role_id in self.roles:
            del self.roles[role_id]
            self._save_roles()
            return True
        return False

    # Entry Operations
    def get_entry(self, entry_id: str) -> Optional[dict]:
        return self.entries.get(entry_id)

    def add_entry(self, entry: dict):
        self.entries[entry["entry_id"]] = entry
        self._save_entries()

    def update_entry(self, entry_id: str, updates: dict):
        if entry_id in self.entries:
            self.entries[entry_id].update(updates)
            self._save_entries()
            return True
        return False
        
    def delete_entry(self, entry_id: str):
        if entry_id in self.entries:
            del self.entries[entry_id]
            self._save_entries()
            return True
        return False

# 初始化数据库
db = JSONDatabase()

# --- Pydantic 模型 ---

class EntryProcessRequest(BaseModel):
    text: str

class EntryProcessResponse(BaseModel):
    entry_id: str
    modified_text: str
    role_id: str
    extracted_roles: Optional[List[dict]] = None

class EntryUpdateRequest(BaseModel):
    entry_id: str
    original_input: Optional[str] = None
    modified_text: Optional[str] = None
    role_id: Optional[str] = None
    skip_llm_inference: bool = False

class RoleUpdateRequest(BaseModel):
    role_id: str
    name: Optional[str] = None
    gender: Optional[str] = None
    nickname: Optional[str] = None

class CommonResponse(BaseModel):
    success: bool
    message: Optional[str] = None

class EntryRenderResponse(BaseModel):
    rendered_text: str

# --- 核心逻辑 ---

def normalize_text(text: str) -> str:
    """
    将文本中的“他 / 她 / 它”统一替换为“TA”
    """
    # 使用正则进行全局替换
    return re.sub(r'[他她它]', 'TA', text)


def render_text_with_gender(modified_text: str, gender: Optional[str]) -> str:
    """
    如果角色有 gender，将 'TA' 替换回去
    否则保持 modified_text
    """
    if not gender:
        return modified_text
        
    # Map Male/Female to Chinese pronouns if needed
    replacement = gender
    if gender.lower() == "male":
        replacement = "他"
    elif gender.lower() == "female":
        replacement = "她"
        
    return modified_text.replace('TA', replacement)

# --- API 路由 ---

def advanced_process_text(text: str, roles: List[dict]) -> Tuple[str, Optional[str]]:
    """
    使用句级上下文 + 最近角色逻辑处理文本：
    1. 识别角色名/昵称
    2. 句子内最近角色性别填充代词 (他/她/它 -> 角色性别)
    3. 若句内无角色，代词回退为 TA
    4. 不跨句共享上下文
    """
    # 构建名称映射: name/nickname -> (role_id, gender)
    name_map = {}
    for role in roles:
        rid = role["role_id"]
        gender = role.get("gender")
        
        if role.get("name"):
            name_map[role["name"]] = (rid, gender)
        if role.get("nickname"):
            name_map[role["nickname"]] = (rid, gender)
            
    # 按长度降序排列以优先匹配长名称
    sorted_names = sorted(name_map.keys(), key=len, reverse=True)
    
    # 分句 (保留分隔符)
    sentences = re.split(r'([。？！\.\?!\n]+)', text)
    processed_parts = []
    found_role_ids = []
    
    for part in sentences:
        if not part:
            continue
            
        # 如果是标点符号，直接保留
        if re.match(r'^[。？！\.\?!\n]+$', part):
            processed_parts.append(part)
            continue
            
        # 句子处理逻辑
        current_gender = None # 每句重置上下文
        result_sentence = []
        i = 0
        
        while i < len(part):
            # 1. 尝试匹配角色名
            matched_name = None
            for name in sorted_names:
                if part.startswith(name, i):
                    matched_name = name
                    break
            
            if matched_name:
                rid, gender = name_map[matched_name]
                # 记录找到的角色ID (保留顺序)
                if rid not in found_role_ids:
                    found_role_ids.append(rid)
                
                # 更新当前句子的性别上下文
                # 无论是否有性别，都更新为当前角色的性别（可能是 None）
                # 以符合“最近角色”原则：如果最近的角色无性别，后续代词应回退为 TA
                if gender:
                    if gender.lower() == "male":
                        current_gender = "他"
                    elif gender.lower() == "female":
                        current_gender = "她"
                    else:
                        current_gender = gender
                else:
                    current_gender = None
                
                result_sentence.append(matched_name)
                i += len(matched_name)
                continue
            
            # 2. 尝试匹配代词
            # 优先匹配复数代词 (他们/她们/它们/TA们)，如果匹配到则保持原样或统一处理
            # 需求变更：统一归一化为 "TA们"
            plural_match = re.match(r'^(他们|她们|它们|TA们|Ta们|ta们)', part[i:])
            if plural_match:
                result_sentence.append("TA们")
                i += len(plural_match.group(0))
                continue

            # 匹配单数代词
            pronoun_match = re.match(r'^(他|她|它|TA|Ta|ta)', part[i:])
            if pronoun_match:
                if current_gender:
                    result_sentence.append(current_gender)
                else:
                    result_sentence.append("TA")
                i += len(pronoun_match.group(0))
                continue
                
            # 3. 普通字符
            result_sentence.append(part[i])
            i += 1
            
        processed_parts.append("".join(result_sentence))
        
    final_text = "".join(processed_parts)
    primary_role_id = found_role_ids[0] if found_role_ids else None
    return final_text, primary_role_id


@app.post("/entry/process_without_llm", response_model=EntryProcessResponse)
def process_entry_without_llm(request: EntryProcessRequest):
    """
    处理新输入的文本：
    1. 使用规则库进行代词解析 (句内最近角色优先，否则 TA)
    2. 自动关联角色 (如果文本中提到)
    3. 保存 Entry
    """
    original_input = request.text
    existing_roles = db.get_all_roles()
    
    # 使用新逻辑处理文本并查找角色
    modified_text, found_role_id = advanced_process_text(original_input, existing_roles)
    
    target_role_id = found_role_id
    
    # 如果没找到角色，回退到原来的逻辑 (创建新角色或使用默认)
    if not target_role_id:
        if not existing_roles:
            # 创建第一个角色
            new_role_id = str(uuid.uuid4())
            role_data = {
                "role_id": new_role_id,
                "name": "Unknown",
                "gender": None,
                "nickname": None,
                "context_summary": ""
            }
            db.add_role(role_data)
            target_role_id = new_role_id
        else:
            # 这里的 fallback 逻辑：如果没有识别出名字，
            # 我们可以假设是"当前"角色 (entries usually belong to someone).
            # 暂时沿用 MVP 逻辑：使用第一个角色。
            target_role_id = existing_roles[0]["role_id"]
            
            # 注意：原逻辑里有一个 mock_llm_check_same_role，
            # 但既然我们现在是基于规则的代词解析，且用户强调"从数据库检索"，
            # 那么如果没检索到，就认为没有明确的角色指代。
            # 这里保持指向 existing_roles[0] 是为了兼容 demo 的连续性。

    # 保存 Entry
    new_entry_id = str(uuid.uuid4())
    entry_data = {
        "entry_id": new_entry_id,
        "role_id": target_role_id,
        "original_input": original_input,
        "modified_text": modified_text
    }
    db.add_entry(entry_data)
    
    return {
        "entry_id": new_entry_id,
        "modified_text": modified_text,
        "role_id": target_role_id,
        "extracted_roles": None # 显式返回 None 或空列表
    }

@app.post("/entry/process_with_llm", response_model=EntryProcessResponse)
def process_entry_with_llm(request: EntryProcessRequest):
    """
    使用 LLM 处理文本：
    1. 基于上下文和角色定义修正代词
    2. 自动关联角色 (基于 LLM 提取的信息)
    3. 保存 Entry
    """
    original_input = request.text
    existing_roles = db.get_all_roles()
    
    # 1. 调用 LLM 进行代词修正和角色提取
    llm_modified_text, extracted_roles = correct_pronouns_with_llm(original_input, existing_roles)
    
    modified_text = original_input # 默认
    target_role_id = None
    
    if llm_modified_text:
        modified_text = llm_modified_text
        
        # 尝试使用 LLM 提取的角色信息来确定 target_role_id
        # 策略：
        # 1. 如果提取到了角色，优先匹配数据库中已有的角色
        # 2. 如果提取到了新角色，可以创建新角色 (但这里为了保持逻辑简单，先只做关联)
        # 3. 优先取第一个提取到的角色作为 entry 的主角色
        
        if extracted_roles:
            first_role_info = extracted_roles[0]
            name_to_find = first_role_info.get("name")
            
            # 在现有角色中查找
            for role in existing_roles:
                if role.get("name") == name_to_find or role.get("nickname") == name_to_find:
                    target_role_id = role["role_id"]
                    # 如果 LLM 提取了性别且数据库中没有，可以顺便更新 (可选，暂不自动更新以免覆盖)
                    break
            
            # 如果没找到且 LLM 标记为新角色，或者只是没找到
            if not target_role_id:
                # 创建新角色
                new_role_id = str(uuid.uuid4())
                role_data = {
                    "role_id": new_role_id,
                    "name": name_to_find,
                    "gender": first_role_info.get("gender"), # 使用 LLM 推断的性别
                    "nickname": None,
                    "context_summary": ""
                }
                db.add_role(role_data)
                target_role_id = new_role_id
                
    # 如果 LLM 失败或没提取到角色，回退到规则逻辑
    if not target_role_id:
        # 如果 modified_text 已经被 LLM 修改了，就用修改后的，否则用原始内容
        # 注意：如果 LLM 返回了文本但没提取到角色，advanced_process_text 可能会基于文本再次尝试
        text_to_process = modified_text if modified_text != original_input else original_input
        _, found_role_id = advanced_process_text(text_to_process, existing_roles)
        target_role_id = found_role_id
    
    # 最终回退
    if not target_role_id:
        if not existing_roles:
            new_role_id = str(uuid.uuid4())
            role_data = {
                "role_id": new_role_id,
                "name": "Unknown",
                "gender": None,
                "nickname": None,
                "context_summary": ""
            }
            db.add_role(role_data)
            target_role_id = new_role_id
        else:
            target_role_id = existing_roles[0]["role_id"]

    # 保存 Entry
    new_entry_id = str(uuid.uuid4())
    entry_data = {
        "entry_id": new_entry_id,
        "role_id": target_role_id,
        "original_input": original_input,
        "modified_text": modified_text
    }
    db.add_entry(entry_data)
    
    return {
        "entry_id": new_entry_id,
        "modified_text": modified_text,
        "role_id": target_role_id,
        "extracted_roles": extracted_roles
    }

@app.post("/entry/update", response_model=CommonResponse)
def update_entry(request: EntryUpdateRequest):
    """
    【修改】手动修正 Entry 信息
    - 支持更新 original_input, modified_text, role_id
    - 如果 skip_llm_inference=True，则仅执行传统的数据库更新，不触发 LLM
    """
    entry = db.get_entry(request.entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    updates = {}
    
    # Update role_id if provided
    if request.role_id is not None:
        if not db.get_role(request.role_id):
             raise HTTPException(status_code=404, detail="Role not found")
        updates["role_id"] = request.role_id

    if request.original_input is not None:
        updates["original_input"] = request.original_input
        # 如果修改了原文，通常也要重新归一化
        if request.modified_text is None:
            updates["modified_text"] = normalize_text(request.original_input)
            
    if request.modified_text is not None:
        updates["modified_text"] = request.modified_text
        
        # --- 核心变更：触发 LLM 推断性别 ---
        # 仅当 skip_llm_inference 为 False 时执行
        if not request.skip_llm_inference:
            # 获取关联角色 (Use the new role_id if updated, otherwise current)
            role_id = updates.get("role_id", entry["role_id"])
            role = db.get_role(role_id)
            if role:
                # 获取修改前的文本
                original_text_before_update = entry.get("modified_text", "")
                # 使用 LLM 推断
                inferred_info = infer_gender_with_llm(request.modified_text, original_text_before_update)
                
                if inferred_info:
                    new_name = inferred_info.get("role")
                    new_gender = inferred_info.get("gender")
                    new_nickname = inferred_info.get("nickname")
                    
                    # Check if we should switch role instead of updating current one
                    # If current role has a specific name (not Unknown) and new name is different
                    should_switch_role = False
                    target_role_id = role_id
                    
                    current_role_name = role.get("name")
                    
                    if new_name and current_role_name and current_role_name != "Unknown":
                        if current_role_name != new_name:
                            should_switch_role = True
                            print(f"Role name mismatch: '{current_role_name}' vs '{new_name}'. Switching role.")
                    
                    if should_switch_role:
                        # Try to find existing role with this name
                        found_existing = False
                        for r in db.get_all_roles():
                            if r.get("name") == new_name:
                                target_role_id = r["role_id"]
                                found_existing = True
                                break
                        
                        if not found_existing:
                            # Create new role
                            new_role_id = str(uuid.uuid4())
                            new_role_data = {
                                "role_id": new_role_id,
                                "name": new_name,
                                "gender": new_gender,
                                "nickname": new_nickname,
                                "context_summary": ""
                            }
                            db.add_role(new_role_data)
                            target_role_id = new_role_id
                            
                        # Update entry to point to new role
                        updates["role_id"] = target_role_id
                        
                        # Update the target role with any extra info (if it was existing)
                        if found_existing:
                            role_updates = {}
                            if new_gender: role_updates["gender"] = new_gender
                            if new_nickname: role_updates["nickname"] = new_nickname
                            if role_updates:
                                db.update_role(target_role_id, role_updates)

                    else:
                        # Update current role
                        role_updates = {}
                        if new_gender:
                            role_updates["gender"] = new_gender
                        if new_name: 
                            role_updates["name"] = new_name
                        if new_nickname:
                            role_updates["nickname"] = new_nickname
                        
                        if role_updates:
                            db.update_role(role_id, role_updates)
                            # print(f"Role {role_id} updated with {role_updates}")

    if updates:
        db.update_entry(request.entry_id, updates)
        
    return {"success": True, "message": "Entry updated" + (" (Direct)" if request.skip_llm_inference else " (Smart)")}

@app.delete("/entry/{entry_id}", response_model=CommonResponse)
def delete_entry(entry_id: str):
    """
    删除 Entry
    """
    if db.delete_entry(entry_id):
        return {"success": True, "message": "Entry deleted"}
    raise HTTPException(status_code=404, detail="Entry not found")

@app.post("/role/update", response_model=CommonResponse)
def update_role(request: RoleUpdateRequest):
    """
    用户手动修正角色信息 (支持 name, gender, nickname)
    """
    if not db.get_role(request.role_id):
        raise HTTPException(status_code=404, detail="Role not found")
    
    updates = {}
    if request.name is not None:
        updates["name"] = request.name
    if request.gender is not None:
        updates["gender"] = request.gender
    if request.nickname is not None:
        updates["nickname"] = request.nickname
    
    if updates:
        db.update_role(request.role_id, updates)
        
    return {"success": True, "message": "Role updated"}

@app.get("/entry/render/{entry_id}", response_model=EntryRenderResponse)
def render_entry(entry_id: str):
    """
    渲染最终文本：
    根据 Entry 关联的 Role 的 gender 进行替换
    """
    entry = db.get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    role_id = entry["role_id"]
    role = db.get_role(role_id)
    
    # 即使找不到角色，也至少返回 entry 的文本
    if not role:
        return {"rendered_text": entry["modified_text"]}
        
    rendered = render_text_with_gender(entry["modified_text"], role.get("gender"))
    
    return {"rendered_text": rendered}

@app.get("/")
def health_check():
    return {"status": "running", "message": "ThinkLoud Backend Demo is Ready"}

if __name__ == "__main__":
    import uvicorn
    # 方便直接运行 python app.py 启动
    uvicorn.run(app, host="0.0.0.0", port=8000)
