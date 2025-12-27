# ThinkLoud API 测试用例指南

本文档涵盖了 ThinkLoud 后端服务的四个核心使用场景的测试用例。每个场景都包含了对应的 API 端点、请求示例和预期行为。

## 1. 场景一：用户点击名字关联角色 (手动关联)

**场景描述**：
用户在前端界面点击文本中的某个名字（该名字对应的角色在数据库中已存在），将当前 Entry 重新关联到该角色。这属于“直接更新”操作，不需要经过大模型推理。

*   **API 端点**: `POST /entry/update`
*   **关键参数**: 
    *   `role_id`: 目标角色的 ID
    *   `skip_llm_inference`: `true` (显式跳过模型推理)

**请求示例 (Python)**:
```python
import requests

payload = {
    "entry_id": "当前条目的UUID",
    "role_id": "数据库中已存在的角色UUID", 
    "skip_llm_inference": True
}

response = requests.post("http://localhost:8000/entry/update", json=payload)
print(response.json())
```

**预期结果**:
*   `success`: `True`
*   `message`: 包含 "Direct" 字样。
*   数据库中该 Entry 的 `role_id` 更新为目标 ID。
*   Entry 的文本内容保持不变（除非同时传了 `modified_text`）。

---

## 2. 场景二：用户编辑文本更新人物信息 (智能更新)

**场景描述**：
用户在界面上修改了文本内容（例如将“TA”修改为“她”，或者将名字从“小明”改为“小红”）。后端需要捕捉这一变化，调用 LLM 推断性别或角色变更，并更新对应的 Role 信息。

*   **API 端点**: `POST /entry/update`
*   **关键参数**:
    *   `modified_text`: 修改后的文本
    *   `skip_llm_inference`: `false` (默认值，可省略)

**请求示例 (Python)**:
```python
import requests

# 假设原文本是 "TA今天很开心"，关联的角色性别未知
payload = {
    "entry_id": "当前条目的UUID",
    "modified_text": "她今天很开心"  # 用户将 TA 改为 她
}

response = requests.post("http://localhost:8000/entry/update", json=payload)
print(response.json())
```

**预期结果**:
*   `success`: `True`
*   `message`: 包含 "Smart" 或 "gender inference triggered" 字样。
*   **性别更新**: 如果原角色性别未知，现在应更新为 `Female` (或 "她")。
*   **角色分支**: 如果用户修改了名字（如“小明”->“小红”），系统可能会创建一个新角色“小红”并将 Entry 关联过去，以保护原角色“小明”的数据。

---

## 3. 场景三：用户输入一段话 (不通过模型修改)

**场景描述**：
用户输入新的文本，系统仅使用基于规则（Regex）的逻辑进行处理。这通常用于快速处理或离线模式。

*   **API 端点**: `POST /entry/process_without_llm`
*   **关键参数**:
    *   `text`: 用户输入的原始文本

**请求示例 (Python)**:
```python
import requests

payload = {
    "text": "张三来了。他很高兴。"
}

response = requests.post("http://localhost:8000/entry/process_without_llm", json=payload)
print(response.json())
```

**预期结果**:
*   返回一个新的 `entry_id`。
*   **代词归一化**: 返回的 `modified_text` 中，未匹配到角色的代词可能被替换为 "TA"（取决于规则逻辑）。
*   **角色关联**: 如果文本中包含数据库已有的名字（如“张三”），会自动关联；否则可能关联到默认角色或创建新角色。

---

## 4. 场景四：用户输入一段话 (通过大模型修改)

**场景描述**：
用户输入新的文本，系统调用大模型（LLM）来纠正代词、提取角色，并更新数据库。这是系统的核心增强功能。

*   **API 端点**: `POST /entry/process_with_llm`
*   **关键参数**:
    *   `text`: 用户输入的原始文本

**请求示例 (Python)**:
```python
import requests

payload = {
    "text": "历史人物武则天，他是中国历史上唯一的女皇帝。"
}

response = requests.post("http://localhost:8000/entry/process_with_llm", json=payload)
print(response.json())
```

**预期结果**:
*   返回一个新的 `entry_id`。
*   **代词修正**: 返回的 `modified_text` 应该自动修正为 "历史人物武则天，**她**是中国历史上唯一的女皇帝。"。
*   **角色提取**: `extracted_roles` 字段应包含 `{"name": "武则天", "gender": "Female"}`。
*   **自动建档**: 如果“武则天”不在数据库中，系统会自动创建该角色并记录性别。
