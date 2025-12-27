// 状态管理
let appState = 'initial'; // initial, recording, paused
let isPaused = false;
let recognition = null;
let fullRawText = ''; // Store the full raw transcript
let silenceTimer = null; // Timer for auto-LLM processing
let cachedRoles = []; // Cache roles for frontend processing
let lastProcessedInputText = ""; // Store the last processed input text for consistency check

// New Fallback Mechanism variables
let useServerRelay = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = 0;


// --- LLM Logic Moved to Frontend ---

// WARNING: Exposing API Key in Frontend is insecure and only for demo purposes as requested.
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
   - 上下文中有明显的性别指示。不要以职业名称、姓名或职务名称为依据。
   - 角色本身是历史上的人物，且性别已被确定。
3. **特别注意**：请优先根据上下文推断性别并替换为“他”或“她”。
4. 如果无法确定性别，或者没有明确的性别前提，请统一将代词修改为“TA”（复数用“TA们”）。
5. 请保持句子的原意，仅修改代词和明显不通顺的表达。

待处理文本：
{text}

请以 JSON 格式返回结果，包含以下字段：
- modified_text: 修改后的文本
- roles: 列表，包含文本中识别到的所有角色，每个角色包含：
  - name: 角色名称或昵称
  - gender: 推断的性别 ("Male"/"Female"/null)
  - is_new: 是否为不在“已知角色信息”中的新角色 (true/false)

示例输出格式：
{
  "modified_text": "...",
  "roles": [
    {"name": "张三", "gender": "Male", "is_new": false}
  ]
}
`;

const SUMMARIZATION_PROMPT_TEMPLATE = `
你是一个专业的文本分析助手。请对以下文本进行分析、总结和打标签。

待分析文本：
{text}

任务要求：
1. **标题**：生成一个简短的标题（10字以内），概括文本核心内容。
2. **总结**：生成一段结构化的总结（例如使用要点符号），涵盖文本的主要信息、讨论的话题或关键事件。
3. **标签**：提取2-3个关键词标签（例如：职场、友情、心情、会议、家庭等）。

请以 JSON 格式返回结果，包含以下字段：
- title: 标题
- summary: 总结内容（支持 HTML 换行 <br> 或 Markdown）
- tags: 字符串数组，包含2-3个标签

示例输出格式：
{
  "title": "工作会议记录",
  "summary": "1. 讨论了Q4季度目标。<br>2. 确定了下周的团建计划。",
  "tags": ["工作", "计划"]
}
`;

async function correctPronounsWithLLM(text, roles) {
    // Check consistency with last processed input
    if (lastProcessedInputText && text === lastProcessedInputText) {
        console.log(`[v0] Input text (len=${text.length}) is identical to the last processed text, skipping request.`);
        // Return the cached result logic if we had it, but here we just return the input 
        // effectively saying "no new changes" or relying on the fact that UI is already up to date.
        // However, the caller expects { modified_text, roles }. 
        // If we skip, we should return the text as is (or previous modified text if we stored it, but keeping it simple).
        return {
            modified_text: text, // Or should we return null to indicate skip? The caller handles it.
            roles: []
        };
    }

    console.log(`[v0] Processing new text (len=${text.length}). Last len=${lastProcessedInputText ? lastProcessedInputText.length : 0}`);

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
    // Use advancedProcessText to convert pronouns to "TA" based on current roles before sending to LLM
    // This ensures LLM sees "TA" when gender is unknown, as requested.
    const processedTextForPrompt = advancedProcessText(text);

    const prompt = PRONOUN_CORRECTION_PROMPT_TEMPLATE
        .replace("{roles_context}", rolesContextStr)
        .replace("{text}", processedTextForPrompt);

    // Optimistically update lastProcessedInputText to prevent concurrent duplicate requests
    const previousProcessedText = lastProcessedInputText;
    lastProcessedInputText = text;

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
            lastProcessedInputText = previousProcessedText; // Revert on failure
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

        // Update lastProcessedInputText on success (already done optimistically, but confirmed here)
        // lastProcessedInputText = text; 

        return {
            modified_text: result.modified_text || text,
            roles: result.roles || []
        };

    } catch (e) {
        console.error("LLM Logic Error:", e);
        lastProcessedInputText = previousProcessedText; // Revert on error
        return { modified_text: text, roles: [], error: true }; // Fallback with error
    }
}

// Generate summary, title, and tags with LLM
async function generateSummaryWithLLM(text) {
    const prompt = SUMMARIZATION_PROMPT_TEMPLATE.replace("{text}", text);

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
                "temperature": 0.3, // Slightly higher creativity for summary
            })
        });

        if (!response.ok) {
            console.error("Summary LLM Request Failed:", response.status);
            return null;
        }

        const data = await response.json();
        let content = data.choices[0].message.content.trim();

        // Clean JSON
        if (content.includes("```json")) {
            content = content.split("```json")[1].split("```")[0].trim();
        } else if (content.includes("```")) {
            content = content.split("```")[1].split("```")[0].trim();
        }

        return JSON.parse(content);

    } catch (e) {
        console.error("Summary LLM Logic Error:", e);
        return null;
    }
}

// Fetch roles on init
async function fetchRoles() {
    try {
        const response = await fetch('/roles');
        if (response.ok) {
            cachedRoles = await response.json();
            console.log('[v0] Roles cached:', cachedRoles.length);
        }
    } catch (e) {
        console.error('Failed to fetch roles:', e);
        // Only alert if we can't even connect
        if (cachedRoles.length === 0) {
            console.warn('Backend might be down or unreachable');
        }
    }
}

// Call immediately
fetchRoles();

// 元素引用
const micIcon = document.getElementById('micIcon');
const recordingVisual = document.getElementById('recordingVisual');
const infoSection = document.getElementById('infoSection');
const transcriptSection = document.getElementById('transcriptSection');
const transcriptText = document.getElementById('transcriptText');
const leftBtn = document.getElementById('leftBtn');
const mainBtn = document.getElementById('mainBtn');
const rightBtn = document.getElementById('rightBtn');
const confirmModal = document.getElementById('confirmModal');
const archiveModal = document.getElementById('archiveModal');

// Advanced text processing (Ported from backend)
function advancedProcessText(text) {
    if (!text) return '';

    // 1. Build name map
    const nameMap = {};
    cachedRoles.forEach(role => {
        const gender = role.gender;
        if (role.name) nameMap[role.name] = gender;
        if (role.nickname) nameMap[role.nickname] = gender;
    });

    // Sort names by length desc
    const sortedNames = Object.keys(nameMap).sort((a, b) => b.length - a.length);

    // 2. Split sentences (keep delimiters)
    // JS split with capture group keeps delimiters
    const parts = text.split(/([。？！\.\?!\n ]+)/);

    let processedParts = [];

    for (let part of parts) {
        if (!part) continue;

        // If delimiter, keep it
        if (/^[。？！\.\?!\n ]+$/.test(part)) {
            processedParts.push(part);
            continue;
        }

        // Process sentence
        let currentGender = null;
        let resultSentence = '';
        let i = 0;

        while (i < part.length) {
            // Match name
            let matchedName = null;
            for (let name of sortedNames) {
                if (part.startsWith(name, i)) {
                    matchedName = name;
                    break;
                }
            }

            if (matchedName) {
                const gender = nameMap[matchedName];
                if (gender) {
                    if (gender.toLowerCase() === 'male') currentGender = '他';
                    else if (gender.toLowerCase() === 'female') currentGender = '她';
                    else currentGender = gender;
                } else {
                    currentGender = null;
                }
                resultSentence += matchedName;
                i += matchedName.length;
                continue;
            }

            // Match pronouns
            const remaining = part.substring(i);

            // Plural
            const pluralMatch = remaining.match(/^(他们|她们|它们|TA们|Ta们|ta们)/);
            if (pluralMatch) {
                resultSentence += 'TA们';
                i += pluralMatch[0].length;
                continue;
            }

            // Singular
            const singularMatch = remaining.match(/^(他|她|它|TA|Ta|ta)/);
            if (singularMatch) {
                resultSentence += (currentGender || 'TA');
                i += singularMatch[0].length;
                continue;
            }

            // Normal char
            resultSentence += part[i];
            i++;
        }
        processedParts.push(resultSentence);
    }

    return processedParts.join('');
}

// Simple regex processing for immediate feedback
function simpleProcess(text) {
    if (!text) return '';
    return text.replace(/[他她它]/g, 'TA');
}

// Check if text contains pronouns that need resolution
function hasPronouns(text) {
    if (!text) return false;
    const pronouns = ['他', '她', '它', 'TA', 'Ta', 'ta'];
    return pronouns.some(p => text.includes(p));
}

// Auto-process with LLM after silence
async function triggerAutoLLMProcess() {
    if (appState !== 'recording' || isPaused) return; // Only run if actively recording

    const textToProcess = fullRawText;
    if (!textToProcess || !textToProcess.trim()) return;

    // Check if we need to process (has pronouns)
    if (!hasPronouns(textToProcess)) {
        console.log('[v0] Auto-process skipped: No pronouns found in:', textToProcess.substring(textToProcess.length - 20));
        return;
    }

    console.log('[v0] Auto-processing with LLM (Frontend) due to silence...');

    // Visual indicator
    const processingId = 'processing-' + Date.now();
    const processingSpan = document.createElement('div');
    processingSpan.id = processingId;
    processingSpan.className = 'text-sm text-white opacity-60 mt-2 italic';
    processingSpan.innerText = '✨ 我在听...';
    transcriptText.appendChild(processingSpan);
    transcriptSection.scrollTop = transcriptSection.scrollHeight;

    try {
        // 1. Frontend LLM Call
        console.log('[v0] Sending to LLM:', textToProcess);
        const llmResult = await correctPronounsWithLLM(textToProcess, cachedRoles);
        console.log('[v0] LLM Result:', llmResult);

        // Remove processing indicator
        const pSpan = document.getElementById(processingId);
        if (pSpan) pSpan.remove();

        // Check for error
        if (llmResult.error) {
            console.warn('LLM Error detected');
            const errorSpan = document.createElement('div');
            errorSpan.className = 'text-xs text-red-300 mt-1';
            errorSpan.innerText = '⚠️ AI 服务暂时不可用 (API Error)';
            transcriptText.appendChild(errorSpan);
            setTimeout(() => errorSpan.remove(), 3000);
        }

        // 2. Identify and Save New Roles (Async & Non-blocking)
        const newRoles = llmResult.roles.filter(r => r.is_new);
        if (newRoles.length > 0) {
            console.log('[v0] New roles detected:', newRoles);

            // 2a. Optimistic Local Update (Refresh immediately)
            newRoles.forEach(role => {
                // Check uniqueness locally just in case
                if (!cachedRoles.some(cr => cr.name === role.name)) {
                    cachedRoles.push({
                        role_id: 'temp-' + Date.now() + Math.random(), // Temporary ID
                        name: role.name,
                        gender: role.gender,
                        nickname: null
                    });
                }
            });
            console.log('[v0] Local roles updated. Total:', cachedRoles.length);

            // 2b. Background Save to Backend (Another thread concept)
            // We do NOT await this, letting it run in background
            fetch('/role/batch_create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roles: newRoles })
            }).then(res => {
                if (res.ok) return res.json();
                throw new Error('Backend error ' + res.status);
            })
                .then(data => console.log('[v0] Roles saved to backend:', data))
                .catch(err => console.error('[v0] Failed to save roles:', err));
        }

        // 3. (Optional) Call Backend to Save Entry Processed
        // For now, we only care about saving roles as requested.
        // The actual entry saving happens when user clicks "Stop".

        // Mock successful response for UI update testing
        const mockResponse = {
            ok: true,
            json: async () => ({
                modified_text: llmResult.modified_text,
                extracted_roles: llmResult.roles
            })
        };

        // Use mock response instead of real fetch
        const response = mockResponse;

        if (response.ok) {
            const data = await response.json();

            // Concurrency check: 
            // Calculate if new chunks were added while we were waiting
            if (fullRawText.startsWith(textToProcess)) {
                const remainder = fullRawText.substring(textToProcess.length);
                const processedContent = data.modified_text || textToProcess;

                let finalHTML = processedContent.replace(/\n/g, '<br>');

                // Append the unprocessed remainder
                if (remainder) {
                    // We wrap remainder in spans to match structure if possible, 
                    // or just simple append for now to avoid complexity
                    finalHTML += '<span style="opacity: 0.8">' + advancedProcessText(remainder) + '</span>';
                }

                // Sync fullRawText and lastProcessedInputText with the LLM result
                // This ensures that 'recognize' (internal state) matches the displayed content
                fullRawText = processedContent + remainder;
                lastProcessedInputText = processedContent;
                console.log('[v0] Synced fullRawText with LLM result. New length:', fullRawText.length);

                // Preserve interim if it exists
                const interimSpan = document.getElementById('interim-span');
                const interimContent = interimSpan ? interimSpan.innerText : '';

                transcriptText.innerHTML = finalHTML;

                if (interimContent) {
                    const newInterim = document.createElement('span');
                    newInterim.id = 'interim-span';
                    newInterim.style.opacity = '0.6';
                    newInterim.innerText = interimContent;
                    transcriptText.appendChild(newInterim);
                }

                console.log('[v0] Auto-process updated UI');
            } else {
                console.warn('[v0] Full text changed drastically, skipping update');
            }
        }
    } catch (e) {
        console.error('Auto-process error:', e);
    }
}

// 处理文本片段 (使用前端逻辑)
async function processChunk(text) {
    // Use local advanced logic instead of API
    return advancedProcessText(text) + ' ';
}

// 初始化语音识别
function initRecognition() {
    // Check for Secure Context first
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        alert('错误：浏览器限制录音功能。请尝试使用 HTTPS 访问，或在 PC 端使用 Chrome 访问。\n\n(Current: ' + location.protocol + '//' + location.hostname + ')');
        console.warn('Non-secure context detected. getUserMedia will likely fail.');
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn('Browser does not support Web Speech API. Switching to Server Relay mode (MediaRecorder).');
        useServerRelay = true;
        // Check if MediaRecorder is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('您的浏览器不支持录音功能 (getUserMedia not supported)。请尝试使用 Chrome, Firefox 或 Safari。');
            return false;
        }
        return true;
    }

    try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'zh-CN';

        recognition.onstart = () => {
            console.log('Speech recognition service has started');
        };

        recognition.onresult = (event) => {
            // Reset silence timer
            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(triggerAutoLLMProcess, 1500);

            let interim = '';
            let finalChunk = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalChunk += event.results[i][0].transcript;
                } else {
                    interim += event.results[i][0].transcript;
                }
            }

            if (finalChunk) {
                fullRawText += finalChunk + ' '; // Append to raw text history
                const interimSpan = document.getElementById('interim-span');
                if (interimSpan) interimSpan.remove();

                // Create placeholder for processing
                const spanId = 'chunk-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                const span = document.createElement('span');
                span.id = spanId;
                span.className = 'mr-1'; // Ensure visual separation
                // Optimistic update: show simple processed text immediately
                // Use advancedProcessText directly since it is synchronous now
                span.innerText = advancedProcessText(finalChunk) + ' '; // Keep space for data consistency
                span.style.opacity = '1'; // No longer "processing" state needed visually
                transcriptText.appendChild(span);
            }

            let interimSpan = document.getElementById('interim-span');
            if (interim) {
                if (!interimSpan) {
                    interimSpan = document.createElement('span');
                    interimSpan.id = 'interim-span';
                    interimSpan.style.opacity = '0.6';
                    transcriptText.appendChild(interimSpan);
                }
                // Apply simple processing to interim text as well
                interimSpan.innerText = advancedProcessText(interim);
            } else if (interimSpan) {
                interimSpan.remove();
            }

            transcriptSection.scrollTop = transcriptSection.scrollHeight;
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                alert('无法访问麦克风，请检查浏览器权限设置。');
            }
        };

        recognition.onend = () => {
            console.log('Recognition ended. AppState:', appState, 'isPaused:', isPaused);
            if (appState === 'recording' && !isPaused) {
                console.log('Recognition ended unexpectedly, restarting...');
                try {
                    recognition.start();
                } catch (e) {
                    console.error('Failed to restart recognition:', e);
                }
            } else if (appState === 'recording' && isPaused) {
                // 用户手动暂停，可能也需要处理一下当前的 buffer
            }
        };
        return true;
    } catch (e) {
        console.error('Error initializing recognition:', e);
        alert('初始化语音识别失败: ' + e.message);
        return false;
    }
}

// 开始录音
async function startRecording() {
    console.log('[v0] Starting recording');

    if (!recognition && !useServerRelay) {
        initRecognition();
    }

    // Server Relay Mode (Fallback)
    if (useServerRelay) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Determine mimeType
            let mimeType = 'audio/webm';
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4'; // Safari
            }

            mediaRecorder = new MediaRecorder(stream, { mimeType });
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstart = () => {
                console.log('MediaRecorder started', mimeType);
                recordingStartTime = Date.now();
            };

            mediaRecorder.onstop = async () => {
                console.log('MediaRecorder stopped');
                // Create blob
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                const audioUrl = URL.createObjectURL(audioBlob);

                // Show "Transcribing..." indicator
                const processingId = 'processing-' + Date.now();
                const processingSpan = document.createElement('div');
                processingSpan.id = processingId;
                processingSpan.className = 'text-sm text-white opacity-60 mt-2 italic';
                processingSpan.innerText = '✨ 正在转录音频...';
                transcriptText.appendChild(processingSpan);

                // Upload to backend
                const formData = new FormData();
                formData.append('file', audioBlob, 'recording' + (mimeType.includes('mp4') ? '.mp4' : '.webm'));

                try {
                    const response = await fetch('/transcribe', {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const text = data.text;

                        if (text) {
                            fullRawText += text + ' ';

                            // Process text with advanced logic
                            const processed = advancedProcessText(text);
                            const span = document.createElement('span');
                            span.innerText = processed + ' ';
                            transcriptText.appendChild(span);

                            // Trigger LLM refinement if needed
                            triggerAutoLLMProcess();
                        } else {
                            console.log('No text transcribed');
                        }
                    } else {
                        console.error('Transcription failed:', response.status);
                        alert('转录失败，请检查后端服务');
                    }
                } catch (e) {
                    console.error('Upload failed:', e);
                    alert('上传音频失败: ' + e.message);
                } finally {
                    // Remove indicator
                    const pSpan = document.getElementById(processingId);
                    if (pSpan) pSpan.remove();
                }
            };

            mediaRecorder.start();

        } catch (e) {
            console.error('Failed to start MediaRecorder:', e);
            alert('无法启动录音: ' + e.message);
            return;
        }
    } else if (recognition) {
        try {
            recognition.start();
        } catch (e) {
            console.error('Failed to start recognition:', e);
            alert('启动录音失败，请刷新页面重试。');
        }
    }

    appState = 'recording';
    isPaused = false;

    // 视觉切换
    micIcon.classList.add('hidden');
    recordingVisual.classList.remove('hidden');
    recordingVisual.classList.remove('paused'); // Ensure animation is playing
    infoSection.classList.add('fade-out');

    setTimeout(() => {
        infoSection.classList.add('hidden');
        transcriptSection.classList.remove('hidden');
        transcriptSection.classList.add('fade-in');
    }, 300);

    // 按钮切换
    updateButtons('recording');

    // 清空文本
    transcriptText.innerHTML = '';
    fullRawText = '';
    lastProcessedInputText = '';
    if (silenceTimer) clearTimeout(silenceTimer);
}

// 暂停录音
async function pauseRecording() {
    if (silenceTimer) clearTimeout(silenceTimer);
    console.log('[v0] Pausing recording');
    isPaused = true;
    recordingVisual.classList.add('paused'); // Pause animation

    if (useServerRelay) {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    } else if (recognition) {
        recognition.stop();
    }

    updateButtons('paused');

    // Call process_with_llm using the full raw text
    const textToProcess = fullRawText || transcriptText.innerText;
    if (textToProcess && textToProcess.trim()) {
        console.log('Processing with LLM on pause...');
        // Indicate loading
        const originalOpacity = transcriptText.style.opacity;
        transcriptText.style.opacity = '0.5';

        try {
            // 1. Frontend LLM Call
            const llmResult = await correctPronounsWithLLM(textToProcess, cachedRoles);

            // Check for error in result (fallback returned)
            if (llmResult.error) {
                console.warn('LLM Error detected');
                const errorSpan = document.createElement('div');
                errorSpan.className = 'text-xs text-red-300 mt-1';
                errorSpan.innerText = '⚠️ AI 服务暂时不可用 (API Error)';
                transcriptText.appendChild(errorSpan);
                setTimeout(() => errorSpan.remove(), 3000);
            } else if (llmResult.modified_text === textToProcess && llmResult.roles.length === 0) {
                // Just no changes, do nothing special
            }

            // 2. Call Backend to Save (Commented out for testing)
            // const response = await fetch('http://localhost:8000/entry/save_processed', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify({
            //         text: textToProcess,
            //         modified_text: llmResult.modified_text,
            //         extracted_roles: llmResult.roles
            //     })
            // });

            // Mock successful response for UI update testing
            const mockResponse = {
                ok: true,
                json: async () => ({
                    modified_text: llmResult.modified_text,
                    extracted_roles: llmResult.roles
                })
            };

            // Use mock response instead of real fetch
            const response = mockResponse;

            if (response.ok) {
                const data = await response.json();
                console.log('LLM processed data:', data);
                // Replace content with LLM result
                transcriptText.innerHTML = (data.modified_text || textToProcess).replace(/\n/g, '<br>');
                // Note: We don't update fullRawText here because if user resumes, 
                // we want to append to the original raw stream. 
                // However, visually, the text is now "LLM polished".
            } else {
                console.error('LLM process failed:', response.status);
            }
        } catch (e) {
            console.error('Error calling process_with_llm:', e);
        } finally {
            transcriptText.style.opacity = originalOpacity;
        }
    }
}

// 继续录音
function resumeRecording() {
    console.log('[v0] Resuming recording');
    isPaused = false;

    if (useServerRelay) {
        if (mediaRecorder && mediaRecorder.state === 'inactive') {
            mediaRecorder.start();
        }
    } else if (recognition) {
        try {
            recognition.start();
        } catch (e) {
            console.error('Failed to resume recognition:', e);
        }
    }
    updateButtons('recording');
}

// 结束录音
function stopRecording() {
    if (silenceTimer) clearTimeout(silenceTimer);
    console.log('[v0] Showing end confirmation');
    confirmModal.classList.remove('hidden');
}

// 确认结束
async function confirmEnd() {
    const confirmYesBtn = document.getElementById('confirmYes');
    const originalBtnText = confirmYesBtn.innerText;

    try {
        console.log('[v0] Recording ended, calling process_without_llm');

        // Show loading state
        confirmYesBtn.innerText = '生成摘要中...';
        confirmYesBtn.classList.add('disabled');

        // Set paused to true to prevent auto-restart in onend
        isPaused = true;

        if (useServerRelay) {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                console.log('[v0] Stopping MediaRecorder and waiting for final transcription...');
                confirmYesBtn.innerText = '正在转录最后片段...';

                await new Promise(resolve => {
                    const originalOnStop = mediaRecorder.onstop;
                    mediaRecorder.onstop = async (e) => {
                        if (originalOnStop) {
                            try {
                                await originalOnStop(e);
                            } catch (err) {
                                console.error('Error in onstop:', err);
                            }
                        }
                        resolve();
                    };
                    mediaRecorder.stop();
                });
            }
        } else if (recognition) {
            try {
                recognition.stop();
            } catch (e) {
                console.warn('Error stopping recognition:', e);
            }
        }

        // 获取当前录音文本 - use textContent as fallback
        const rawText = transcriptText.innerText || transcriptText.textContent;
        console.log('Raw text:', rawText);

        if (!rawText || !rawText.trim()) {
            console.log('No text found');
            alert('没有录音内容，不调用接口');
            confirmModal.classList.add('hidden');
            showArchiveModal(rawText);
            return;
        }

        // 1. Generate Summary & Tags
        console.log('Generating summary...');
        let summaryData = null;
        try {
            summaryData = await generateSummaryWithLLM(rawText);
            console.log('Summary Data:', summaryData);
        } catch (e) {
            console.error('Failed to generate summary:', e);
        }

        // 2. Save to Backend
        console.log('Sending request to /entry/save_processed');

        // 调用后端 API 保存已处理的文本
        // Use /entry/save_processed instead of /entry/process_without_llm to preserve LLM corrections
        // We send rawText as both original and modified because at this point rawText IS the modified text (from frontend state)
        // extracted_roles is optional, we can skip it or pass if we tracked it. For now skipping is fine as backend will try to match.
        const response = await fetch('/entry/save_processed', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: rawText, // This might be original input conceptually, but here we only have the final text.
                modified_text: rawText, // Trust the frontend's final state
                extracted_roles: [],
                title: summaryData ? summaryData.title : null,
                summary: summaryData ? summaryData.summary : null,
                tags: summaryData ? summaryData.tags : null
            })
        });

        console.log('Response status:', response.status);

        confirmModal.classList.add('hidden');

        if (response.ok) {
            const data = await response.json();
            console.log('Processed data:', data);
            // 使用后端返回的 modified_text 更新 UI (虽然这里是归档弹窗)
            showArchiveModal(data.modified_text || rawText, summaryData, data.date);

            // 同时更新 transcriptText 显示处理后的结果
            transcriptText.innerHTML = (data.modified_text || rawText).replace(/\n/g, '<br>');

        } else {
            console.error('API Error:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('Error body:', errorText);
            alert('处理文本失败 (API Error ' + response.status + ')，将显示原始内容');
            showArchiveModal(rawText);
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        confirmModal.classList.add('hidden');
        alert('连接服务器失败 (' + error.message + ')，将显示原始内容。请确保后端服务已启动。');
        showArchiveModal(transcriptText.innerText);
    } finally {
        // Reset button state
        confirmYesBtn.innerText = originalBtnText;
        confirmYesBtn.classList.remove('disabled');
    }
}

// 显示归档弹窗 helper
function showArchiveModal(text, summaryData, dateStr) {
    const today = dateStr || new Date().toISOString().split('T')[0];
    document.getElementById('archiveDate').textContent = `记录 ${today} 已生成`;

    let summary = '';
    if (summaryData) {
        // Use structured summary from LLM
        summary = summaryData.summary || text;

        // Update tags
        if (summaryData.tags && summaryData.tags.length > 0) {
            document.getElementById('archiveTags').textContent = '关于 ' + summaryData.tags.join('｜');
        } else {
            document.getElementById('archiveTags').textContent = '关于 职场｜友情｜心情'; // Default
        }

        // We could also show title if there was a place for it, 
        // for now maybe prepend to summary or just log it
        if (summaryData.title) {
            console.log('Generated Title:', summaryData.title);
        }
    } else {
        // Fallback to raw text
        summary = (text && text.trim().length > 0) ? text : '本次记录没有内容。';
        document.getElementById('archiveTags').textContent = '关于 职场｜友情｜心情';
    }

    document.getElementById('archiveSummary').innerHTML = summary; // Use innerHTML to support <br>

    archiveModal.classList.remove('hidden');
}

// 取消结束
function cancelEnd() {
    console.log('[v0] Cancelled ending');
    confirmModal.classList.add('hidden');
}

// 关闭归档弹窗并重置
function closeArchiveAndReset() {
    console.log('[v0] Closing archive and resetting to initial state');
    archiveModal.classList.add('hidden');

    // 重置到初始状态
    setTimeout(() => {
        appState = 'initial';
        isPaused = false;

        // 视觉重置
        recordingVisual.classList.add('hidden');
        recordingVisual.classList.remove('paused'); // Reset animation state
        micIcon.classList.remove('hidden');
        transcriptSection.classList.add('hidden');
        transcriptSection.classList.remove('fade-in');
        infoSection.classList.remove('hidden', 'fade-out');

        // 按钮重置
        updateButtons('initial');

        // 清空文本
        transcriptText.innerHTML = '';
    }, 150);
}

// 更新按钮状态
function updateButtons(state) {
    if (state === 'initial') {
        // 左：档案库
        leftBtn.innerHTML = `
  <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
  </svg>
`;
        leftBtn.setAttribute('aria-label', '档案库');

        // 主：开录
        mainBtn.innerHTML = `
  <div class="flex flex-col items-center gap-2">
    <svg class="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
    </svg>
    <span class="text-white text-sm font-medium">开录</span>
  </div>
`;
        mainBtn.setAttribute('aria-label', '开录');

        // 右：个人信息
        rightBtn.innerHTML = `
  <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
`;
        rightBtn.setAttribute('aria-label', '个人信息');

    } else if (state === 'recording') {
        // 左：暂停
        leftBtn.innerHTML = `
  <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
  </svg>
`;
        leftBtn.setAttribute('aria-label', '暂停');

        // 主：声波图标
        mainBtn.innerHTML = `
  <div class="flex gap-1 items-center justify-center h-10 w-10">
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
  </div>
`;
        mainBtn.setAttribute('aria-label', '录音中');

        // 右：结束
        rightBtn.innerHTML = `
  <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
    <rect x="6" y="6" width="12" height="12" rx="2"/>
  </svg>
`;
        rightBtn.setAttribute('aria-label', '结束');

    } else if (state === 'paused') {
        // 左：继续
        leftBtn.innerHTML = `
  <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z"/>
  </svg>
`;
        leftBtn.setAttribute('aria-label', '继续');
    }
}

// 事件监听
micIcon.addEventListener('click', () => {
    console.log('Mic icon clicked, state:', appState);
    if (appState === 'initial') {
        startRecording();
    } else {
        console.log('Ignored click because state is not initial');
    }
});

mainBtn.addEventListener('click', () => {
    console.log('Main button clicked, state:', appState);
    if (appState === 'initial') {
        startRecording();
    }
});

leftBtn.addEventListener('click', () => {
    if (appState === 'recording' && !isPaused) {
        pauseRecording();
    } else if (appState === 'recording' && isPaused) {
        resumeRecording();
    } else if (appState === 'initial') {
        // Open Archive
        if (window.ArchiveManager) {
            window.ArchiveManager.show();
        } else {
            console.error('ArchiveManager not found');
        }
    }
});

rightBtn.addEventListener('click', () => {
    if (appState === 'recording') {
        stopRecording();
    } else if (appState === 'initial') {
        if (window.UserProfileManager) {
            window.UserProfileManager.show();
        }
    }
});

document.getElementById('confirmYes').addEventListener('click', () => {
    console.log('Confirm Yes clicked');
    confirmEnd();
});
document.getElementById('confirmNo').addEventListener('click', cancelEnd);
document.getElementById('closeArchive').addEventListener('click', closeArchiveAndReset);

// 点击弹窗外部关闭
confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
        cancelEnd();
    }
});

archiveModal.addEventListener('click', (e) => {
    if (e.target === archiveModal) {
        closeArchiveAndReset();
    }
});

// 文本编辑功能
transcriptText.addEventListener('click', () => {
    if (appState === 'recording' && isPaused) {
        transcriptText.setAttribute('contenteditable', 'true');
        transcriptText.focus();
        console.log('[v0] Text editing enabled');
    }
});

transcriptText.addEventListener('blur', () => {
    if (transcriptText.getAttribute('contenteditable') === 'true') {
        transcriptText.setAttribute('contenteditable', 'false');
        console.log('[v0] API call: update (skip_llm_inference=false) - Text saved');
    }
});

// 高亮人名点击
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('highlight-name')) {
        console.log('[v0] API call: update (skip_llm_inference=true) - Name database updated');
        alert('人名数据库已更新');
    }
});
