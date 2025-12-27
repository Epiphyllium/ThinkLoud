
// archive.js - 归档页面逻辑

const archiveSection = document.getElementById('archiveSection');
const archiveList = document.getElementById('archiveList');
const closeArchiveBtn = document.getElementById('closeArchiveBtn');
const archiveDetailSection = document.getElementById('archiveDetailSection');
const backToArchiveBtn = document.getElementById('backToArchiveBtn');
const saveArchiveDetailBtn = document.getElementById('saveArchiveDetailBtn');
const archiveDetailContent = document.getElementById('archiveDetailContent');
const archiveDetailMeta = document.getElementById('archiveDetailMeta');

let currentDetailEntryId = null;

// 初始化
function initArchive() {
    closeArchiveBtn.addEventListener('click', hideArchive);
    backToArchiveBtn.addEventListener('click', hideArchiveDetail);
    saveArchiveDetailBtn.addEventListener('click', saveCurrentDetail);
}

// 显示归档页面
async function showArchive() {
    archiveSection.classList.remove('hidden');
    archiveSection.classList.add('fade-in');

    // 加载数据
    await loadEntries();
}

// 隐藏归档页面
function hideArchive() {
    archiveSection.classList.add('hidden');
    archiveSection.classList.remove('fade-in');
}

// 加载 Entry 列表
async function loadEntries() {
    archiveList.innerHTML = '<div class="text-white text-center w-full col-span-2">加载中...</div>';

    try {
        const response = await fetch('/entries');
        if (!response.ok) throw new Error('Failed to load entries');

        const entries = await response.json();
        renderArchiveGrid(entries);
    } catch (e) {
        console.error('Error loading entries:', e);
        archiveList.innerHTML = `<div class="text-white text-center w-full col-span-2 text-red-300">加载失败: ${e.message}</div>`;
    }
}

// 渲染归档卡片网格
function renderArchiveGrid(entries) {
    archiveList.innerHTML = '';

    // 按时间倒序
    entries.sort((a, b) => {
        const getTimestamp = (entry) => {
            if (entry.created_at) {
                const t = new Date(entry.created_at).getTime();
                if (!isNaN(t)) return t;
            }
            if (entry.date) {
                const t = new Date(entry.date).getTime();
                if (!isNaN(t)) return t;
            }
            return 0;
        };

        const timeA = getTimestamp(a);
        const timeB = getTimestamp(b);
        return timeB - timeA;
    });

    if (entries.length === 0) {
        archiveList.innerHTML = '<div class="text-white text-center w-full col-span-2 opacity-60 mt-12">暂无归档记录</div>';
        return;
    }

    entries.forEach(entry => {
        const card = createArchiveCard(entry);
        archiveList.appendChild(card);
    });
}

// 创建单个归档卡片
function createArchiveCard(entry) {
    const div = document.createElement('div');
    div.className = 'glass rounded-3xl p-6 glass-hover cursor-pointer flex flex-col justify-between h-48';

    // 日期处理
    let dateStr = '未知日期';
    if (entry.date) {
        dateStr = entry.date;
    } else if (entry.created_at) {
        const date = new Date(entry.created_at);
        dateStr = date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    }

    // 标签处理 (底部右下角，无蒙版)
    let tagsHtml = '';
    if (entry.tags && entry.tags.length > 0) {
        const tagsStr = entry.tags.join('｜');
        tagsHtml = `<div class="flex justify-end mt-2"><span class="text-white/60 text-xs">${tagsStr}</span></div>`;
    }

    // 标题/总结处理
    const title = entry.title || '无标题';
    const summaryRaw = entry.summary || entry.modified_text || '';
    // 简单的截断，移除HTML标签
    const summaryText = summaryRaw.replace(/<[^>]+>/g, '');
    const summaryPreview = summaryText.length > 40 ? summaryText.substring(0, 40) + '...' : summaryText;

    div.innerHTML = `
        <div>
            <div class="mb-2">
                <span class="text-white/60 text-xs">${dateStr}</span>
            </div>
            <h3 class="text-white font-medium text-lg mb-2 line-clamp-1">${title}</h3>
            <p class="text-white/80 text-sm leading-relaxed line-clamp-3 text-justify">
                ${summaryPreview}
            </p>
        </div>
        ${tagsHtml}
    `;

    div.addEventListener('click', () => showEntryDetail(entry));

    return div;
}

// 显示详情页
function showEntryDetail(entry) {
    currentDetailEntryId = entry.entry_id;

    // 填充内容
    // 优先显示 summary (格式化后的结果)，如果不存在则显示 modified_text
    let contentToShow = '';
    let isSummary = false;

    if (entry.summary && entry.summary.trim()) {
        contentToShow = entry.summary;
        isSummary = true;
    } else {
        // 如果是原文，为了显示换行，将 \n 替换为 <br>
        contentToShow = (entry.modified_text || entry.original_input || '').replace(/\n/g, '<br>');
    }

    archiveDetailContent.innerHTML = contentToShow;
    // 记录当前编辑的是哪个字段
    archiveDetailContent.dataset.editingField = isSummary ? 'summary' : 'modified_text';

    // Meta info
    let dateStr = '未知日期';
    if (entry.date) {
        dateStr = entry.date;
    } else if (entry.created_at) {
        const date = new Date(entry.created_at);
        dateStr = date.toLocaleString('zh-CN');
    }

    archiveDetailMeta.innerHTML = `
        <div>
            <p class="font-medium">${entry.title || '无标题'}</p>
            <p class="text-xs opacity-60">${dateStr}</p>
        </div>
        <div class="text-right">
            <p class="text-xs opacity-60">ID: ${entry.entry_id.substring(0, 8)}...</p>
        </div>
    `;

    archiveDetailSection.classList.remove('hidden');
    archiveDetailSection.classList.add('fade-in');
}

// 隐藏详情页
function hideArchiveDetail() {
    archiveDetailSection.classList.add('hidden');
    archiveDetailSection.classList.remove('fade-in');
    currentDetailEntryId = null;
}

// 保存详情更改
async function saveCurrentDetail() {
    if (!currentDetailEntryId) return;

    // 获取编辑后的文本
    // 注意：contenteditable 的 innerText 会将 <div>, <br> 等转换为换行符 \n
    let newText = archiveDetailContent.innerText;

    saveArchiveDetailBtn.innerText = '保存中...';
    saveArchiveDetailBtn.classList.add('disabled');

    const field = archiveDetailContent.dataset.editingField;
    const payload = {
        entry_id: currentDetailEntryId,
        skip_llm_inference: true
    };

    if (field === 'summary') {
        // 如果是 summary，我们希望在 HTML 显示时有换行，
        // 而 backend 存的是字符串。
        // 为了下次加载能正确显示 HTML 换行，我们需要将 \n 转换回 <br> 存入库，
        // 或者依靠 frontend 渲染时处理。
        // 但目前的 showEntryDetail 逻辑是直接 innerHTML = entry.summary (假设它已经是 HTML 格式)
        // 所以这里我们最好把 \n 转回 <br>
        // 但是要注意，如果用户只是改了字，没动换行，innerText 可能会丢失一些复杂的 HTML 结构。
        // 对于简单文本编辑，这种转换通常够用。
        payload.summary = newText.replace(/\n/g, '<br>');
    } else {
        payload.modified_text = newText;
    }

    try {
        const response = await fetch('/entry/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert('保存成功');
            // 刷新列表（后台数据变了）
            loadEntries();
        } else {
            alert('保存失败');
        }
    } catch (e) {
        console.error('Save failed:', e);
        alert('保存出错');
    } finally {
        saveArchiveDetailBtn.innerText = '保存';
        saveArchiveDetailBtn.classList.remove('disabled');
    }
}

// 启动
initArchive();

// 暴露给全局以便 main.js 调用
window.ArchiveManager = {
    show: showArchive
};
