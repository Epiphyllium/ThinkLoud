
# Gender inference prompt
GENDER_INFERENCE_PROMPT = """
请根据用户对文本的修改，推断主角的角色信息（包括姓名、性别、昵称）。

修改前文本：{original_text}
修改后文本：{modified_text}

推断逻辑：
1. 观察用户是如何修改代词或称谓的。
2. 如果用户将“TA”或“他”修改为“她”，则性别为女性。
3. 如果用户将“TA”或“她”修改为“他”，则性别为男性。
4. 如果修改不涉及性别变化，请分析修改后文本中的性别线索。
5. 提取主角的姓名（role）和昵称（nickname）。

请以 JSON 格式返回结果，包含以下字段：
- role: 主角姓名 (string, 如果未提及则为 null)
- gender: 性别 (string,"Male"/"Female"/null)
- nickname: 昵称 (string, 如果未提及则为 null)

示例输出：
{{
  "role": "张三",
  "gender": "Male",
  "nickname": "小张"
}}
"""

# Pronoun correction prompt
PRONOUN_CORRECTION_PROMPT = """
你是一个专业的文本润色助手。请根据提供的上下文信息，修正给定文本中的人称代词，并提取文本中的角色信息。

已知角色信息：
{roles_context}

规则：
1. 识别文本中的角色，并检查其对应的人称代词是否正确。
2. 只有在以下情况才能修改代词为具体的“他”、“她”或“它”：
   - 角色在“已知角色信息”列表中明确指定了性别。
   - 文本上下文中有明显的性别指示（如“爸爸”、“妈妈”、“先生”、“女士”）。
   - 角色本身是历史上的人物，且性别已被确定。
3. 如果无法确定性别，或者没有明确的性别前提，请统一将代词修改为“TA”（复数用“TA们”）。
4. 请保持句子的原意，仅修改代词和明显不通顺的表达。
5. 严格遵守：如果无法确定性别，必须使用“TA”。

待处理文本：
{text}

请以 JSON 格式返回结果，包含以下字段：
- modified_text: 修改后的文本
- roles: 列表，包含文本中识别到的所有角色，每个角色包含：
  - name: 角色名称或昵称
  - gender: 推断的性别 ("他"/"她"/"它"/null)
  - is_new: 是否为不在“已知角色信息”中的新角色 (true/false)

示例输出格式：
{{
  "modified_text": "...",
  "roles": [
    {{"name": "张三", "gender": "Male", "is_new": false}}
  ]
}}
"""
