// Mocking DOM elements and globals if necessary, but here we just test the function logic
// We need fetch. Node 18+ has global fetch.

const OPENROUTER_API_KEY = "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";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_NAME = "moonshotai/kimi-k2";

const PRONOUN_CORRECTION_PROMPT_TEMPLATE = `
你是一个专业的文本润色助手。请根据提供的上下文信息，修正给定文本中的人称代词，并提取文本中的角色信息。

已知角色信息：
{roles_context}

规则：
1. 识别文本中的角色，并检查其对应的人称代词是否正确。
2. 只有在以下情况才能修改代词为具体的“他”、“她”或“它”：
   - 角色在“已知角色信息”列表中明确指定了性别。
   - 文本上下文中有明显的性别指示（如“爸爸”、“妈妈”、“先生”、“女士”）。
   - 角色的昵称中包含性别相关的关键词。
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
{
  "modified_text": "...",
  "roles": [
    {"name": "张三", "gender": "Male", "is_new": false}
  ]
}
`;

async function correctPronounsWithLLM(text, roles) {
    // Format roles context
    let rolesContextStr = "- 无已知角色";
    if (roles && roles.length > 0) {
        rolesContextStr = roles.map(role => {
            const name = role.name || "Unknown";
            const nickname = role.nickname || "";
            const gender = role.gender || "未知";
            return `- ${name}(${nickname}): ${gender}`;
        }).join("\n");
    }

    // Format prompt
    const prompt = PRONOUN_CORRECTION_PROMPT_TEMPLATE
        .replace("{roles_context}", rolesContextStr)
        .replace("{text}", text);

    try {
        const response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://thinkloud.demo",
                "X-Title": "ThinkLoud",
            },
            body: JSON.stringify({
                "model": MODEL_NAME,
                "messages": [
                    { "role": "user", "content": prompt }
                ],
                "temperature": 0.1,
            })
        });

        if (!response.ok) {
            console.error("LLM Request Failed:", response.status);
            return { modified_text: text, roles: [], error: true }; // Fallback with error
        }

        const data = await response.json();
        let content = data.choices[0].message.content.trim();

        // Clean JSON
        if (content.includes("```json")) {
            content = content.split("```json")[1].split("```")[0].trim();
        } else if (content.includes("```")) {
            content = content.split("```")[1].split("```")[0].trim();
        }

        const result = JSON.parse(content);
        return {
            modified_text: result.modified_text || text,
            roles: result.roles || []
        };

    } catch (e) {
        console.error("LLM Logic Error:", e);
        return { modified_text: text, roles: [], error: true }; // Fallback with error
    }
}

// Test Execution
async function runTest() {
    const text = "小张是一个工程师 同时TA也是一个孩子的母亲";
    const roles = []; // 无已知角色
    
    console.log("Testing correctPronounsWithLLM...");
    console.log("Input Text:", text);
    console.log("Input Roles:", roles);
    
    const result = await correctPronounsWithLLM(text, roles);
    
    console.log("\n--- Result ---");
    console.log(JSON.stringify(result, null, 2));
}

runTest();
