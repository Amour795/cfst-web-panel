const tabTest = document.getElementById('tab-test');
const tabFav = document.getElementById('tab-fav');
const tabSettings = document.getElementById('tab-settings');
const tabDns = document.getElementById('tab-dns');
const testViewContainer = document.getElementById('test-view-container');
const settingsViewContainer = document.getElementById('settings-view-container');
const dnsViewContainer = document.getElementById('dns-view-container');
const tableCard = document.getElementById('table-card');
const bottomBar = document.getElementById('bottom-bar');
const pageDesc = document.getElementById('page-desc');

const ipInput = document.getElementById('ip-input');
const ipCount = document.getElementById('ip-count');
const allowCnameInput = document.getElementById('allow-cname-input');
const fileInput = document.getElementById('file-input');
const importCsvBtn = document.getElementById('import-csv-btn');
const clearInputBtn = document.getElementById('clear-input-btn');
const sourceUrlPreset = document.getElementById('source-url-preset');
const sourceUrlInput = document.getElementById('source-url-input');
const fetchSourceBtn = document.getElementById('fetch-source-btn');

const startBtn = document.getElementById('start-btn');
const statusPanel = document.getElementById('status-panel');
const statusTitle = document.getElementById('status-title');
const statusTag = document.getElementById('status-tag');
const statusSub = document.getElementById('status-sub');
const loadingSpinner = document.getElementById('loading-spinner');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');

const resultBody = document.getElementById('result-body');
const actionBar = document.getElementById('action-bar');
const selectAllCheckbox = document.getElementById('select-all');
const saveSelectedBtn = document.getElementById('save-selected-btn');
const tagSelectedBtn = document.getElementById('tag-selected-btn');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const copySelectedBtn = document.getElementById('copy-selected-btn');
const syncCfBtn = document.getElementById('sync-cf-btn');
const selectedCountSpan = document.getElementById('selected-count');
const toast = document.getElementById('toast');
const themeMode = document.getElementById('theme-mode');

const cfDomain = document.getElementById('cf-domain');
const cfTokenId = document.getElementById('cf-token-id');
const cfTokenKey = document.getElementById('cf-token-key');
const saveCfSettingsBtn = document.getElementById('save-cf-settings-btn');
const dnsStagingList = document.getElementById('dns-staging-list');
const dnsDomainLabel = document.getElementById('dns-domain-label');
const addDnsRowBtn = document.getElementById('add-dns-row-btn');
const publishDnsBtn = document.getElementById('publish-dns-btn');
const clearStagingBtn = document.getElementById('clear-staging-btn');
let dnsStagingRecords = [];
function normalizeLineKey(v) { return ['default', 'telecom', 'unicom', 'mobile'].includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : 'default'; }
function lineTextToKey(lineText) {
    const t = String(lineText || '').trim();
    if (t === '电信') return 'telecom';
    if (t === '联通') return 'unicom';
    if (t === '移动') return 'mobile';
    return 'default';
}

const cfstMode = document.getElementById('cfst-mode');
const cfstHttpingBox = document.getElementById('cfst-httping-box');
const cfstCfcoloBox = document.getElementById('cfst-cfcolo-box');
const cfstHttpingCodeInput = document.getElementById('cfst-httping-code');
const cfstCfcoloInput = document.getElementById('cfst-cfcolo');
const cfstTpInput = document.getElementById('cfst-tp');
const cfstNInput = document.getElementById('cfst-n');
const cfstTInput = document.getElementById('cfst-t');
const cfstUrlInput = document.getElementById('cfst-url');
const cfstDtInput = document.getElementById('cfst-dt');
const cfstDnInput = document.getElementById('cfst-dn');
const cfstDnSingleInput = document.getElementById('cfst-dn-single');
const cfstTlInput = document.getElementById('cfst-tl');
const cfstTllInput = document.getElementById('cfst-tll');
const cfstTlrInput = document.getElementById('cfst-tlr');
const cfstSlInput = document.getElementById('cfst-sl');
const cfstDisableDownload = document.getElementById('cfst-disable-download');
const cfstAllip = document.getElementById('cfst-allip');
const cfstDebug = document.getElementById('cfst-debug');
const cfstTopNInput = document.getElementById('cfst-topn');
const incrementalMode = document.getElementById('incremental-mode');
const incrementalDownOnly = document.getElementById('incremental-down-only');
const parseTimeoutInput = document.getElementById('parse-timeout');
const totalTimeoutInput = document.getElementById('total-timeout');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const resetSettingsBtn = document.getElementById('reset-settings-btn');

let currentView = 'test'; 
let testTableData = []; 
let favTableData = []; 
let parsedTargets = [];
let progressSource = null;
let progressPollTimer = null;
let currentTaskId = '';
const TABLE_COLSPAN = 7;

// --- 双栈 IPv4 + IPv6 支持 ---
const ipv4Str = '(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)';
const ipv6Str = '(?:(?:[0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:))';
const ipRegexGlobal = new RegExp(`(?:${ipv4Str})|(?:${ipv6Str})`, 'g');
const mixedRegex = new RegExp(`(?:${ipv4Str})|(?:${ipv6Str})|(?:[a-zA-Z0-9][-a-zA-Z0-9]{0,62}\\.)+[a-zA-Z]{2,}`, 'g');

const isoMap = {
    'HKG': 'HK', '香港': 'HK', 'TPE': 'TW', '台北': 'TW', '台湾': 'TW', 'NRT': 'JP', 'KIX': 'JP', '东京': 'JP', '大阪': 'JP', '日本': 'JP',
    'SGP': 'SG', '新加坡': 'SG', 'ICN': 'KR', '首尔': 'KR', '韩国': 'KR', 'LAX': 'US', 'SJC': 'US', 'SEA': 'US', '洛杉矶': 'US', '圣何塞': 'US', '西雅图': 'US', '美国': 'US',
    'FRA': 'DE', '法兰克福': 'DE', '德国': 'DE', 'LHR': 'GB', '伦敦': 'GB', '英国': 'GB', 'SYD': 'AU', '悉尼': 'AU', '澳大利亚': 'AU',
    'CDG': 'FR', '巴黎': 'FR', '法国': 'FR', 'AMS': 'NL', '阿姆斯特丹': 'NL', '荷兰': 'NL', 'YYZ': 'CA', '多伦多': 'CA', '加拿大': 'CA',
    'KUL': 'MY', '吉隆坡': 'MY', '马来西亚': 'MY', 'BKK': 'TH', '曼谷': 'TH', '泰国': 'TH', 'MNL': 'PH', '马尼拉': 'PH', '菲律宾': 'PH',
    'CGK': 'ID', '雅加达': 'ID', '印尼': 'ID', 'BOM': 'IN', '孟买': 'IN', '印度': 'IN'
};

function getIsoCode(regionStr) {
    if (!regionStr || regionStr.includes('未知') || regionStr.includes('⏳')) return 'UN';
    const s = regionStr.toUpperCase();
    for (const [key, val] of Object.entries(isoMap)) { if (s.includes(key)) return val; }
    const match = s.match(/[A-Z]{3}/);
    return match ? match[0] : 'UN';
}

let toastTimeout;
function showToast(msg) {
    if(!toast) return;
    toast.innerText = msg; toast.classList.add('show');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

async function copyToClipboard(text, successMsg) {
    try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
        else { let ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.left = "-999px"; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); ta.remove(); }
        showToast(successMsg);
    } catch (err) { showToast('❌ 复制失败'); }
}

function switchTab(view) {
    currentView = view;
    [tabTest, tabFav, tabDns, tabSettings].forEach(t => t?.classList.remove('active'));
    [testViewContainer, settingsViewContainer, tableCard, dnsViewContainer].forEach(c => c?.classList.add('hidden'));
    
    if (view === 'favorites') {
        tabFav?.classList.add('active');
        tableCard?.classList.remove('hidden');
        bottomBar?.classList.remove('hide-down');
        if(pageDesc) pageDesc.innerText = '持久化保存在服务器上的专属优选节点库';
        
        if(startBtn) startBtn.innerText = '测速选中';
        saveSelectedBtn?.classList.add('hidden');
        tagSelectedBtn?.classList.remove('hidden');
        deleteSelectedBtn?.classList.remove('hidden');
        fetchAndRenderFavorites();
    } else if (view === 'settings') {
        tabSettings?.classList.add('active');
        settingsViewContainer?.classList.remove('hidden');
        bottomBar?.classList.add('hide-down');
        loadCfApiConfig();
        loadCfstConfig();
        if(pageDesc) pageDesc.innerText = '测速引擎核心参数与面板外观偏好设置';
    } else if (view === 'dns') {
        tabDns?.classList.add('active');
        dnsViewContainer?.classList.remove('hidden');
        bottomBar?.classList.add('hide-down');
        if(pageDesc) pageDesc.innerText = '腾讯 DNSPod 解析管理与优选 IP 一键同步';
        loadDnsStaging();
    } else {
        tabTest?.classList.add('active');
        testViewContainer?.classList.remove('hidden');
        tableCard?.classList.remove('hidden');
        bottomBar?.classList.remove('hide-down');
        if(pageDesc) pageDesc.innerText = '输入 CNAME 域名或 IP 触发多节点智能解析与测速';
        
        if(startBtn) { startBtn.disabled = false; startBtn.innerText = '开始测速'; }
        saveSelectedBtn?.classList.remove('hidden');
        if(saveSelectedBtn) saveSelectedBtn.innerText = '💾 收藏';
        tagSelectedBtn?.classList.add('hidden');
        deleteSelectedBtn?.classList.add('hidden');
        renderTable(testTableData, '准备就绪，点击底部按钮开始测速');
    }
    
    // Save current view to localStorage
    localStorage.setItem('currentView', view);
}
tabTest?.addEventListener('click', () => { if(currentView !== 'test') switchTab('test'); });
tabFav?.addEventListener('click', () => { if(currentView !== 'favorites') switchTab('favorites'); });
tabSettings?.addEventListener('click', () => { if(currentView !== 'settings') switchTab('settings'); });
tabDns?.addEventListener('click', () => { if(currentView !== 'dns') switchTab('dns'); });

function updateCfstModeVisibility() {
    if ((cfstMode?.value || 'tcp') === 'http') {
        cfstHttpingBox?.classList.remove('is-collapsed'); cfstCfcoloBox?.classList.remove('is-collapsed');
    } else {
        cfstHttpingBox?.classList.add('is-collapsed'); cfstCfcoloBox?.classList.add('is-collapsed');
    }
}

async function loadCfApiConfig() {
    try {
        const res = await fetch('/api/settings/cf');
        const { data } = await res.json();
        if (data) {
            if(cfDomain) cfDomain.value = data.domain || '';
            if(cfTokenId) cfTokenId.value = data.tokenId || '';
            if(cfTokenKey) cfTokenKey.value = data.tokenKey || '';
            if (dnsDomainLabel) {
                if (data.domain) dnsDomainLabel.innerText = `当前管理: ${data.domain}`;
            }
        }
    } catch (e) {}
}

saveCfSettingsBtn?.addEventListener('click', async () => {
    const payload = {
        domain: cfDomain?.value.trim() || '',
        tokenId: cfTokenId?.value.trim() || '',
        tokenKey: cfTokenKey?.value.trim() || ''
    };
    try {
        await fetch('/api/settings/cf', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        showToast('✅ 腾讯 DNS 配置已保存');
        if (dnsDomainLabel) {
            if (payload.domain) dnsDomainLabel.innerText = `当前管理: ${payload.domain}`;
        }
    } catch (e) { showToast('❌ 保存失败'); }
});

async function loadDnsStaging() {
    if (!dnsStagingList) return [];
    dnsStagingList.innerHTML = '<div class="history-item"><div class="spinner"></div>正在获取...</div>';
    try {
        const [stagingRes, liveRes] = await Promise.all([
            fetch('/api/dns/staging').then(r => r.json()).catch(() => ({ success: false, msg: '读取新增记录失败' })),
            fetch('/api/cf/dns').then(r => r.json()).catch(() => ({ success: false, msg: '读取现有记录失败' }))
        ]);

        const stagingRows = (Array.isArray(stagingRes?.data) ? stagingRes.data : []).map(item => ({
            source: 'staging',
            type: String(item?.type || 'A').toUpperCase() === 'AAAA' ? 'AAAA' : 'A',
            line: normalizeLineKey(item?.line),
            value: String(item?.value || item?.ip || '').trim()
        })).filter(r => r.value);

        const liveRows = (Array.isArray(liveRes?.data) ? liveRes.data : []).map(item => ({
            source: 'live',
            id: item.id,
            type: String(item?.type || 'A').toUpperCase() === 'AAAA' ? 'AAAA' : 'A',
            line: lineTextToKey(item?.line),
            value: String(item?.content || item?.value || '').trim()
        })).filter(r => r.value);

        const seen = new Set();
        const merged = [];
        for (const r of [...liveRows, ...stagingRows]) {
            const key = `${r.type}|${r.line}|${r.value}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(r);
        }
        dnsStagingRecords = merged;
        renderDnsStagingRows();
        return dnsStagingRecords;
    } catch (e) {
        dnsStagingList.innerHTML = '<div class="history-item" style="color:#ef4444;">网络错误</div>';
        return [];
    }
}

function renderDnsStagingRows() {
    if (!dnsStagingList) return;
    dnsStagingList.style.overflowX = 'auto';
    dnsStagingList.style.overflowY = 'hidden';
    dnsStagingList.style.paddingBottom = '4px';
    if (!dnsStagingRecords.length) {
        dnsStagingList.innerHTML = '<div class="history-item text-center">暂无 DNS 记录</div>';
        return;
    }
    dnsStagingList.innerHTML = dnsStagingRecords.map((r, idx) => `
        <div class="history-item" style="min-width: max-content;">
            <select class="dns-stage-type" data-idx="${idx}" ${r.source === 'live' ? 'disabled' : ''} style="width:70px; padding:0.4rem; font-size:0.85rem; border-radius: var(--radius-md);">
                <option value="A" ${r.type === 'A' ? 'selected' : ''}>A</option>
                <option value="AAAA" ${r.type === 'AAAA' ? 'selected' : ''}>AAAA</option>
            </select>
            <select class="dns-stage-line" data-idx="${idx}" style="width:75px; padding:0.4rem; font-size:0.85rem; border-radius: var(--radius-md);">
                <option value="default" ${r.line === 'default' ? 'selected' : ''}>默认</option>
                <option value="telecom" ${r.line === 'telecom' ? 'selected' : ''}>电信</option>
                <option value="unicom" ${r.line === 'unicom' ? 'selected' : ''}>联通</option>
                <option value="mobile" ${r.line === 'mobile' ? 'selected' : ''}>移动</option>
            </select>
            <input class="dns-stage-value" data-idx="${idx}" value="${r.value}" placeholder="IP (IPv4/IPv6)" style="flex:1; min-width:160px; padding:0.4rem 0.6rem; font-family: monospace; font-size:0.9rem;border: 1px solid var(--border-color);border-radius: 4px;background: var(--input-bg);color: var(--text-primary);">
            <button class="dns-stage-del" data-idx="${idx}" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:0.4rem;display:flex;align-items:center;justify-content:center;border-radius:var(--radius-md);transition:background 0.2s;" onmouseover="this.style.background='var(--danger-light)'" onmouseout="this.style.background='none'" title="删除记录">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
            </button>
            <span style="font-size:0.75rem;font-weight:700;padding:0.25rem 0.5rem;border-radius:var(--radius-md);background:${r.source === 'live' ? 'var(--info-light)' : 'var(--success-light)'};color:${r.source === 'live' ? 'var(--info)' : 'var(--success)'};width:46px;text-align:center;">${r.source === 'live' ? '线上' : '新增'}</span>
        </div>
    `).join('');

    document.querySelectorAll('.dns-stage-type').forEach(el => el.addEventListener('change', async () => {
        const idx = Number(el.dataset.idx);
        if (!Number.isFinite(idx) || !dnsStagingRecords[idx]) return;
        dnsStagingRecords[idx].type = String(el.value || 'A').toUpperCase() === 'AAAA' ? 'AAAA' : 'A';
        if (dnsStagingRecords[idx].source !== 'live') await persistDnsStagingRecords();
    }));
    document.querySelectorAll('.dns-stage-line').forEach(el => el.addEventListener('change', async () => {
        const idx = Number(el.dataset.idx);
        if (!Number.isFinite(idx) || !dnsStagingRecords[idx]) return;
        const row = dnsStagingRecords[idx];
        row.line = normalizeLineKey(el.value);
        if (row.source !== 'live') await persistDnsStagingRecords();
    }));
    document.querySelectorAll('.dns-stage-value').forEach(el => el.addEventListener('change', async () => {
        const idx = Number(el.dataset.idx);
        if (!Number.isFinite(idx) || !dnsStagingRecords[idx]) return;
        const row = dnsStagingRecords[idx];
        row.value = String(el.value || '').trim();
        if (!row.value) return;
        if (row.source !== 'live') await persistDnsStagingRecords();
    }));
    document.querySelectorAll('.dns-stage-del').forEach(btn => btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.idx);
        if (!Number.isFinite(idx)) return;
        const row = dnsStagingRecords[idx];
        if (!row) return;
        
        if (!confirm(`确定要删除此记录吗？\nIP: ${row.value || '空'} (${row.line})`)) return;

        if (row.source === 'live') {
            try {
                const delRes = await fetch(`/api/cf/dns/${row.id}`, { method: 'DELETE' });
                const delJson = await delRes.json();
                if (!delJson.success) return showToast(`❌ 删除失败: ${delJson.msg || '未知错误'}`);
            } catch (_) { return showToast('❌ 网络错误'); }
            await loadDnsStaging();
            return;
        }
        dnsStagingRecords.splice(idx, 1);
        await persistDnsStagingRecords();
        renderDnsStagingRows();
    }));

    initCustomSelects(dnsStagingList);
}

async function updateLiveDnsRecord(row) {
    // Deprecated: live records are now updated in batch via publishDnsBtn
}

async function persistDnsStagingRecords() {
    const records = dnsStagingRecords.map(r => ({
        type: r.type === 'AAAA' ? 'AAAA' : 'A',
        line: normalizeLineKey(r.line),
        value: String(r.value || '').trim()
    })).filter(r => r.value && r.source !== 'live');
    await fetch('/api/dns/staging', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records })
    });
}

addDnsRowBtn?.addEventListener('click', async () => {
    dnsStagingRecords.push({ source: 'staging', type: 'A', line: 'default', value: '' });
    renderDnsStagingRows();
});

async function syncToCloudflare(records) {
    if(!syncCfBtn) return;
    const oldText = syncCfBtn.innerText;
    syncCfBtn.innerText = '📡 推送中...'; syncCfBtn.disabled = true;
    try {
        const res = await fetch('/api/cf/dns/sync', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ records })
        });
        const json = await res.json();
        if (json.success) {
            showToast(`✅ 新增 ${json.added || 0} 条，跳过 ${json.skipped || 0} 条`);
            if (currentView === 'dns') loadDnsStaging();
        }
        else showToast(`❌ 同步失败: ${json.msg}`);
    } catch (e) { showToast('❌ 网络错误'); }
    finally { syncCfBtn.innerText = oldText; updateSelectionState(); }
}
syncCfBtn?.addEventListener('click', () => {
    if (!resultBody) return;
    const selectedIps = Array.from(resultBody.querySelectorAll('.ip-checkbox:checked')).map(cb => cb.dataset.ip);
    if(selectedIps.length === 0) return showToast('❌ 请先选择节点');
    if (!confirm(`将这 ${selectedIps.length} 个 IP 加入 DNS 记录列表？`)) return;
    const records = selectedIps.map(ip => ({
        type: String(ip || '').includes(':') ? 'AAAA' : 'A',
        line: 'default',
        value: String(ip || '').trim()
    }));
    fetch('/api/dns/staging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records })
    }).then(r => r.json()).then(json => {
        if (!json.success) return showToast(`❌ 暂存失败: ${json.msg || '未知错误'}`);
        showToast(`✅ 已加入 DNS 记录列表 (${json.total || selectedIps.length})`);
        switchTab('dns');
    }).catch(() => showToast('❌ 网络错误'));
});

publishDnsBtn?.addEventListener('click', async () => {
    const originalRecords = await loadDnsStaging();
    const liveRecordsToUpdate = dnsStagingRecords.filter(r => r.source === 'live');
    const stagingRecordsToAdd = dnsStagingRecords.filter(r => r.source !== 'live');
    
    const updates = [];
    for (const r of liveRecordsToUpdate) {
        const original = originalRecords.find(o => o.id === r.id);
        if (original && (original.value !== r.value || original.line !== r.line)) {
            updates.push(r);
        }
    }

    if (!stagingRecordsToAdd.length && !updates.length) {
        return showToast('❌ 没有需要保存的变更');
    }

    let msg = '确认保存以下更改到腾讯 DNS？\n';
    if (stagingRecordsToAdd.length) msg += `- 新增 ${stagingRecordsToAdd.length} 条记录\n`;
    if (updates.length) msg += `- 修改 ${updates.length} 条线上记录\n`;
    
    if (!confirm(msg)) return;

    if (updates.length > 0) {
        for (const r of updates) {
            try {
                await fetch(`/api/cf/dns/${r.id}/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip: r.value, line: r.line })
                });
            } catch (e) {}
        }
    }

    if (stagingRecordsToAdd.length > 0) {
        await syncToCloudflare(stagingRecordsToAdd.map(r => ({ type: r.type, line: r.line, value: r.value })));
        try {
            await fetch('/api/dns/staging', { method: 'DELETE' });
        } catch (e) {}
    } else {
        showToast('✅ 线上记录已保存');
    }
    
    await loadDnsStaging();
});

clearStagingBtn?.addEventListener('click', async () => {
    if (!confirm('确定清空所有新增记录吗？（不影响线上已存在记录）')) return;
    try {
        const res = await fetch('/api/dns/staging', { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) return showToast(`❌ 清空失败: ${json.msg || '未知错误'}`);
        showToast('✅ 新增记录已清空');
        loadDnsStaging();
    } catch (e) {
        showToast('❌ 网络错误');
    }
});

function applyTheme(mode) {
    const sys = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark', mode === 'system' ? sys : mode === 'dark');
}
themeMode?.addEventListener('change', () => { localStorage.setItem('theme', themeMode.value); applyTheme(themeMode.value); });

function closeProgressStream() { if (progressSource) { progressSource.close(); progressSource = null; } }
function stopProgressPolling() { if (progressPollTimer) { clearInterval(progressPollTimer); progressPollTimer = null; } }

function startProgressPolling(taskId) {
    stopProgressPolling();
    progressPollTimer = setInterval(async () => {
        try {
            const res = await fetch(`/api/progress-state/${taskId}`); const json = await res.json();
            if (json.success && json.data) { updateProgressUI(json.data); if (json.data.state === 'done' || json.data.state === 'error') stopProgressPolling(); }
        } catch (e) {}
    }, 1200);
}

function updateProgressUI(payload) {
    if (!payload) return;
    if(statusTitle) statusTitle.innerText = payload.phase || '测速中';
    if(statusTag) statusTag.innerText = payload.phase.includes('ping') ? 'PING' : payload.phase.includes('下载') ? 'DOWN' : 'RUN';
    if(statusSub) {
        if (payload.current && payload.total) statusSub.innerText = `${payload.current}/${payload.total}`;
        else if (payload.message) statusSub.innerText = payload.message.slice(0, 70);
    }
    if (typeof payload.percent === 'number' && progressFill && progressLabel) {
        let pct = Math.max(0, Math.min(100, payload.percent));
        if (payload.state !== 'done' && payload.state !== 'error' && pct >= 100) pct = 99;
        progressFill.style.width = `${pct}%`; progressLabel.innerText = `${pct}%`;
    }
    if ((payload.state === 'done' || payload.state === 'error') && loadingSpinner) loadingSpinner.style.display = 'none';
}

function extractAndUpdateInput(text) {
    const isCname = allowCnameInput?.checked || false;
    const matcher = isCname ? mixedRegex : ipRegexGlobal;
    parsedTargets = [...new Set(String(text || '').match(matcher) || [])];
    if(ipCount) ipCount.innerText = parsedTargets.length;
    if(ipInput) ipInput.value = isCname && parsedTargets.length === 0 ? text : parsedTargets.join('\n');
}
ipInput?.addEventListener('blur', () => extractAndUpdateInput(ipInput.value));
clearInputBtn?.addEventListener('click', () => { if(ipInput) ipInput.value = ''; parsedTargets = []; if(ipCount) ipCount.innerText = '0'; });
allowCnameInput?.addEventListener('change', () => extractAndUpdateInput(ipInput?.value));

sourceUrlPreset?.addEventListener('change', () => {
    const val = sourceUrlPreset.value;
    if (val !== 'custom') {
        if(sourceUrlInput) sourceUrlInput.value = val;
    }
});

fetchSourceBtn?.addEventListener('click', async () => {
    const url = sourceUrlInput?.value.trim(); if (!url) return showToast('❌ 请输入 URL');
    if(fetchSourceBtn) { fetchSourceBtn.disabled = true; fetchSourceBtn.innerText = '拉取中...'; }
    try {
        const res = await fetch('/api/fetch-source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
        const json = await res.json();
        if (json.success) { extractAndUpdateInput([ipInput?.value, json.data].filter(Boolean).join('\n')); showToast(`✅ 成功拉取`); }
    } finally { if(fetchSourceBtn) { fetchSourceBtn.disabled = false; fetchSourceBtn.innerText = '🌐 拉取源'; } }
});
importCsvBtn?.addEventListener('click', () => fileInput?.click());
fileInput?.addEventListener('change', (e) => {
    if (!e.target.files[0]) return;
    const reader = new FileReader();
    reader.onload = (evt) => { extractAndUpdateInput(evt.target.result); showToast('✅ 导入成功'); };
    reader.readAsText(e.target.files[0]); if(fileInput) fileInput.value = '';
});

// 系统维护接口调用
document.getElementById('update-engine-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('update-engine-btn');
    btn.disabled = true; btn.innerText = '⏳ 下载解压中...';
    try {
        const res = await fetch('/api/system/update-engine', { method: 'POST' });
        const json = await res.json();
        if (json.success) showToast('✅ 引擎已成功更新到最新版');
        else showToast('❌ ' + json.msg);
    } catch (e) { showToast('❌ 网络错误'); }
    finally { btn.disabled = false; btn.innerText = '🔄 升级 CFST 测速引擎'; }
});

document.getElementById('update-ips-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('update-ips-btn');
    btn.disabled = true; btn.innerText = '⏳ 获取中...';
    try {
        const res = await fetch('/api/system/update-ips', { method: 'POST' });
        const json = await res.json();
        if (json.success) showToast('✅ 官方 IPv4/v6 库已更新');
        else showToast('❌ ' + json.msg);
    } catch (e) { showToast('❌ 网络错误'); }
    finally { btn.disabled = false; btn.innerText = '📥 更新官方 IP 库 (txt)'; }
});

function renderTable(dataArray, emptyMsg) {
    if (!resultBody) return;
    resultBody.innerHTML = ''; 
    if (selectAllCheckbox) selectAllCheckbox.checked = false; 
    updateSelectionState();

    if (!dataArray || dataArray.length === 0) {
        actionBar?.classList.add('hidden');
        resultBody.innerHTML = `<tr><td colspan="${TABLE_COLSPAN}" class="text-center text-slate-500" style="padding: 4rem 1rem;">${emptyMsg}</td></tr>`;
        return;
    }
    actionBar?.classList.remove('hidden');
    dataArray.forEach((item) => {
        const tr = document.createElement('tr');
        const speedClass = item.speed > 20 ? 'speed-high' : item.speed > 5 ? 'speed-mid' : 'speed-low';
        const compare = `${Number(item.deltaSpeed) >= 0 ? '+' : ''}${Number(item.deltaSpeed||0).toFixed(2)} / ${Number(item.deltaPing) >= 0 ? '+' : ''}${Number(item.deltaPing||0).toFixed(1)}`;
        tr.innerHTML = `
            <td class="text-center"><input type="checkbox" class="ip-checkbox" data-ip="${item.ip}" data-region="${item.region||''}" data-tag="${item.tag||''}"></td>
            <td><span class="region-badge">${item.region || '❓ 未知'}</span></td>
            <td><div class="copyable-ip font-mono text-slate-800" data-ip="${item.ip}">${item.ip}</div></td>
            <td class="text-center text-slate-500">${Number(item.ping).toFixed(1)}ms</td>
            <td class="text-right ${speedClass}">${Number(item.speed).toFixed(2)}</td>
            <td class="text-center text-slate-500">${item.tag || '-'}</td>
            <td class="text-center text-slate-500">${compare}</td>
        `;
        resultBody.appendChild(tr);
    });
    
    resultBody.querySelectorAll('.ip-checkbox').forEach(cb => cb.addEventListener('change', updateSelectionState));
    resultBody.querySelectorAll('.copyable-ip').forEach(el => el.addEventListener('click', () => {
        const tr = el.closest('tr');
        const cb = tr.querySelector('.ip-checkbox');
        const region = cb?.dataset.region || '';
        const tag = cb?.dataset.tag || '';
        const isoCode = getIsoCode(region);
        
        let text = `${el.dataset.ip}#${isoCode}`;
        if (tag && tag !== '-') text += `|${tag}`;
        
        copyToClipboard(text, `✅ 已复制: ${text}`);
    }));
}

function updateSelectionState() {
    if (!resultBody) return;
    const cbs = resultBody.querySelectorAll('.ip-checkbox');
    const checked = resultBody.querySelectorAll('.ip-checkbox:checked').length;
    if(selectedCountSpan) selectedCountSpan.innerText = checked;
    const hasSel = checked > 0;
    
    if(copySelectedBtn) copySelectedBtn.disabled = !hasSel; 
    if(saveSelectedBtn) saveSelectedBtn.disabled = !hasSel;
    if(tagSelectedBtn) tagSelectedBtn.disabled = !hasSel; 
    if(deleteSelectedBtn) deleteSelectedBtn.disabled = !hasSel;
    if(syncCfBtn) syncCfBtn.disabled = !hasSel;
    
    if(selectAllCheckbox) {
        selectAllCheckbox.checked = hasSel && checked === cbs.length;
    }
}
selectAllCheckbox?.addEventListener('change', (e) => { 
    if (!resultBody) return;
    resultBody.querySelectorAll('.ip-checkbox').forEach(cb => cb.checked = e.target.checked); 
    updateSelectionState(); 
});

copySelectedBtn?.addEventListener('click', () => {
    if (!resultBody) return;
    const selected = Array.from(resultBody.querySelectorAll('.ip-checkbox:checked'));
    const ips = selected.map(cb => {
        const ip = cb.dataset.ip;
        const region = cb.dataset.region || '';
        const tag = cb.dataset.tag || '';
        const isoCode = getIsoCode(region);
        let text = `${ip}#${isoCode}`;
        if (tag && tag !== '-') text += `|${tag}`;
        return text;
    }).join('\n');
    copyToClipboard(ips, `✅ 成功复制 ${selected.length} 项`);
});

tagSelectedBtn?.addEventListener('click', async () => {
    if (!resultBody) return;
    const selectedCbs = Array.from(resultBody.querySelectorAll('.ip-checkbox:checked'));
    if (selectedCbs.length === 0) return showToast('❌ 请先选择节点');

    const newTag = prompt(`请输入为这 ${selectedCbs.length} 个节点设置的标签：\n(留空则为清除标签)`);
    if (newTag === null) return;

    const ipsToUpdate = selectedCbs.map(cb => ({ ip: cb.dataset.ip, tag: newTag.trim() }));

    try {
        const res = await fetch('/api/save-ips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ips: ipsToUpdate }) });
        const json = await res.json();
        if (json.success) { showToast(`🏷️ 标签已更新`); fetchAndRenderFavorites(); } 
        else { showToast('❌ 标签设置失败'); }
    } catch (e) { showToast('❌ 网络错误'); }
});

async function fetchAndRenderFavorites() {
    if(!resultBody) return;
    resultBody.innerHTML = `<tr><td colspan="${TABLE_COLSPAN}"><div class="spinner" style="margin: 0 auto;"></div></td></tr>`;
    try {
        const res = await fetch('/api/saved-ips'); const json = await res.json();
        favTableData = json.success ? json.data.sort((a, b) => b.speed - a.speed) : [];
        renderTable(favTableData, '📭 收藏夹空空如也');
    } catch (e) { renderTable([], '❌ 获取失败'); }
}

saveSelectedBtn?.addEventListener('click', async () => {
    if (!resultBody) return;
    const dataSource = currentView === 'favorites' ? favTableData : testTableData;
    const ipsToSave = Array.from(resultBody.querySelectorAll('.ip-checkbox:checked')).map(cb => {
        const ip = cb.dataset.ip;
        const rowData = dataSource.find(d => d.ip === ip) || {};
        return { 
            ip: ip, 
            region: cb.dataset.region || rowData.region,
            ping: rowData.ping,
            speed: rowData.speed
        };
    });
    try {
        const res = await fetch('/api/save-ips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ips: ipsToSave }) });
        if ((await res.json()).success) showToast(`🌟 收藏成功`);
    } catch (e) {}
});

deleteSelectedBtn?.addEventListener('click', async () => {
    if (!resultBody) return;
    const ipsToDelete = Array.from(resultBody.querySelectorAll('.ip-checkbox:checked')).map(cb => cb.dataset.ip);
    if(!confirm(`确定删除吗？`)) return;
    try {
        const res = await fetch('/api/delete-ips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ips: ipsToDelete }) });
        if ((await res.json()).success) { showToast(`🗑️ 删除成功`); fetchAndRenderFavorites(); }
    } catch (e) {}
});

async function requestStopCurrentTask() {
    if (!currentTaskId) return;
    await fetch('/api/stop-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: currentTaskId }) });
    showToast('🛑 已发送停止指令');
}

startBtn?.addEventListener('click', async () => {
    if (currentTaskId) { await requestStopCurrentTask(); return; }
    
    const targetIps = currentView === 'favorites'
        ? Array.from((resultBody?.querySelectorAll('.ip-checkbox:checked') || [])).map(cb => cb.dataset.ip)
        : parsedTargets;
    if (currentView === 'favorites' && targetIps.length === 0) { throw new Error("请先选择要测速的 IP"); }

    startBtn.innerText = '⏹ 停止测试';
    startBtn.style.backgroundColor = '#ef4444';
    
    extractAndUpdateInput(ipInput?.value); 
    statusPanel?.classList.remove('hidden'); actionBar?.classList.add('hidden'); 
    if(resultBody) resultBody.innerHTML = '';
    if(progressFill) progressFill.style.width = '0%'; 
    if(progressLabel) progressLabel.innerText = '0%'; 
    if(loadingSpinner) loadingSpinner.style.display = 'block';

    try {
        const taskId = `task_${Date.now()}`; currentTaskId = taskId;
        closeProgressStream(); startProgressPolling(taskId);
        progressSource = new EventSource(`/api/progress/${taskId}`);
        progressSource.onmessage = (e) => { try { updateProgressUI(JSON.parse(e.data)); } catch (err) {} };

        const response = await fetch('/api/start-test', { 
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetIps, inputMode: allowCnameInput?.checked ? 'cname' : 'ip', taskId,
                runtimeOptions: {
                    incremental: incrementalMode?.checked || false, incrementalDownOnly: incrementalDownOnly?.checked || false,
                    parseTimeoutSec: Number(parseTimeoutInput?.value || 25), totalTimeoutSec: Number(totalTimeoutInput?.value || 150)
                }
            }) 
        });
        const json = await response.json();

        if (json.success) {
            if(currentView === 'favorites') {
                favTableData = json.data;
                renderTable(favTableData, '未能测出有效节点');
                await fetch('/api/save-ips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ips: json.data }) });
                fetchAndRenderFavorites();
            } else {
                testTableData = json.data;
                renderTable(testTableData, '未能测出有效节点');
            }
            if(statusTitle) statusTitle.innerText = '完成'; 
            if(loadingSpinner) loadingSpinner.style.display = 'none';
        } else { showToast(`测速失败: ${json.msg}`); statusPanel?.classList.add('hidden'); }
    } catch (e) { showToast(e.message || '网络请求失败'); statusPanel?.classList.add('hidden'); } 
    finally {
        currentTaskId = ''; setTimeout(() => closeProgressStream(), 800); stopProgressPolling();
        startBtn.innerText = currentView === 'favorites' ? '测速选中' : '重新测速';
        startBtn.style.backgroundColor = '';
    }
});

async function loadCfstConfig() {
    try {
        const res = await fetch(`/api/settings/cfst?_=${Date.now()}`); const json = await res.json();
        if (json.success) {
            const c = json.data; 
            if(cfstMode) { cfstMode.value = c.mode||'tcp'; cfstMode.dispatchEvent(new Event('change')); }
            if(cfstHttpingCodeInput) cfstHttpingCodeInput.value = c.httpingCode ?? '';
            if(cfstCfcoloInput) cfstCfcoloInput.value = c.cfcolo || '';
            if(cfstUrlInput) cfstUrlInput.value = c.url||'';
            if(cfstDtInput) cfstDtInput.value = c.dt ?? ''; 
            if(cfstDnInput) cfstDnInput.value = c.dn ?? ''; 
            if(cfstDnSingleInput) cfstDnSingleInput.value = c.dnSingle ?? '';
            if(cfstNInput) cfstNInput.value = c.n ?? '';
            if(cfstTInput) cfstTInput.value = c.t ?? '';
            if(cfstTpInput) cfstTpInput.value = c.tp ?? ''; 
            if(cfstTlInput) cfstTlInput.value = c.tl ?? '';
            if(cfstTllInput) cfstTllInput.value = c.tll ?? '';
            if(cfstTlrInput) cfstTlrInput.value = c.tlr ?? '';
            if(cfstSlInput) cfstSlInput.value = c.sl ?? '';
            if(cfstDisableDownload) cfstDisableDownload.checked = !!c.disableDownload;
            if(cfstAllip) cfstAllip.checked = !!c.allip;
            if(cfstDebug) cfstDebug.checked = !!c.debug;
            if(cfstTopNInput) cfstTopNInput.value = c.topN ?? '';
            if(parseTimeoutInput) parseTimeoutInput.value = c.parseTimeoutSec ?? 25;
            if(totalTimeoutInput) totalTimeoutInput.value = c.totalTimeoutSec ?? 900;
            updateCfstModeVisibility();
        }
    } catch (e) {}
}
cfstMode?.addEventListener('change', updateCfstModeVisibility);
saveSettingsBtn?.addEventListener('click', async () => {
    const payload = {
        mode: cfstMode?.value,
        httpingCode: Number(cfstHttpingCodeInput?.value),
        cfcolo: (cfstCfcoloInput?.value || '').trim(),
        url: cfstUrlInput?.value,
        dt: Number(cfstDtInput?.value),
        dn: Number(cfstDnInput?.value),
        dnSingle: Number(cfstDnSingleInput?.value),
        n: Number(cfstNInput?.value),
        t: Number(cfstTInput?.value),
        tp: Number(cfstTpInput?.value),
        tl: Number(cfstTlInput?.value),
        tll: Number(cfstTllInput?.value),
        tlr: Number(cfstTlrInput?.value),
        sl: Number(cfstSlInput?.value),
        disableDownload: !!cfstDisableDownload?.checked,
        allip: !!cfstAllip?.checked,
        debug: !!cfstDebug?.checked,
        topN: Number(cfstTopNInput?.value),
        parseTimeoutSec: Number(parseTimeoutInput?.value),
        totalTimeoutSec: Number(totalTimeoutInput?.value)
    };
    try {
        const res = await fetch('/api/settings/cfst', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const json = await res.json();
        if (json?.success) {
            await loadCfstConfig();
            showToast('✅ 设置已保存');
        } else {
            showToast('❌ 设置保存失败');
        }
    } catch (e) { showToast('❌ 设置保存失败'); }
});
resetSettingsBtn?.addEventListener('click', async () => {
    try { const res = await fetch('/api/settings/cfst/reset', { method: 'POST' }); if ((await res.json()).success) { loadCfstConfig(); showToast('✅ 已恢复官方推荐设置'); } } catch (e) {}
});

if(themeMode) { themeMode.value = localStorage.getItem('theme') || 'system'; applyTheme(themeMode.value); themeMode.dispatchEvent(new Event('change')); }
loadCfApiConfig();
loadCfstConfig();

const savedView = localStorage.getItem('currentView') || 'test';
if (savedView !== 'test') {
    switchTab(savedView);
} else {
    renderTable(testTableData, '准备就绪，点击底部按钮开始测速');
}

initCustomSelects();

function initCustomSelects(container = document) {
    const selects = container.querySelectorAll('select:not(.custom-select-hidden)');
    selects.forEach(select => {
        const originalClasses = Array.from(select.classList).join(' ');
        select.classList.add('custom-select-hidden');
        select.style.display = 'none';

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';
        if (select.style.width) wrapper.style.width = select.style.width;
        if (select.style.flex) wrapper.style.flex = select.style.flex;

        if (select.parentNode) {
            select.parentNode.insertBefore(wrapper, select);
            wrapper.appendChild(select);
        }

        const trigger = document.createElement('div');
        trigger.className = `custom-select-trigger ${originalClasses} ${select.disabled ? 'disabled' : ''}`;
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'custom-select-value';
        
        const updateValueText = () => {
            const selectedOption = select.options[select.selectedIndex];
            valueSpan.innerText = selectedOption ? selectedOption.text : '';
        };
        updateValueText();

        const arrowSvg = document.createElement('div');
        arrowSvg.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        arrowSvg.className = 'custom-select-arrow';

        trigger.appendChild(valueSpan);
        trigger.appendChild(arrowSvg);
        wrapper.appendChild(trigger);

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'custom-select-options';

        const renderOptions = () => {
            optionsContainer.innerHTML = '';
            Array.from(select.children).forEach(child => {
                if (child.tagName.toLowerCase() === 'optgroup') {
                    const groupTitle = document.createElement('div');
                    groupTitle.className = 'custom-select-optgroup';
                    groupTitle.innerText = child.label;
                    optionsContainer.appendChild(groupTitle);
                    
                    Array.from(child.children).forEach(opt => {
                        optionsContainer.appendChild(createOptionEl(opt));
                    });
                } else if (child.tagName.toLowerCase() === 'option') {
                    optionsContainer.appendChild(createOptionEl(child));
                }
            });
        };

        const createOptionEl = (option) => {
            const optEl = document.createElement('div');
            optEl.className = `custom-select-option ${option.selected ? 'selected' : ''}`;
            optEl.dataset.value = option.value;
            
            optEl.innerHTML = `<span class="opt-text">${option.text}</span>`;
            
            optEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (select.value !== option.value) {
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                closeAllCustomSelects();
            });
            return optEl;
        };

        renderOptions();
        document.body.appendChild(optionsContainer);

        select.addEventListener('change', () => {
            updateValueText();
            renderOptions();
        });

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (select.disabled) return;
            const isOpen = optionsContainer.classList.contains('open');
            closeAllCustomSelects();
            if (!isOpen) {
                optionsContainer.classList.add('open');
                trigger.classList.add('active');
                wrapper.classList.add('open');
                
                const triggerRect = trigger.getBoundingClientRect();
                
                // Position optionsContainer before calculating its height
                optionsContainer.style.width = Math.max(triggerRect.width, optionsContainer.offsetWidth) + 'px';
                optionsContainer.style.left = triggerRect.left + 'px';
                
                // Ensure options are rendered into DOM before calculation
                const rect = optionsContainer.getBoundingClientRect();
                
                if (triggerRect.bottom + rect.height > window.innerHeight && triggerRect.top > rect.height) {
                    // Open upwards
                    optionsContainer.style.top = (triggerRect.top - rect.height - 4) + 'px';
                } else {
                    // Open downwards
                    optionsContainer.style.top = (triggerRect.bottom + 4) + 'px';
                }
            }
        });
        
        // Ensure options container moves with scroll or resize
        window.addEventListener('scroll', () => {
             if(optionsContainer.classList.contains('open')) {
                  const triggerRect = trigger.getBoundingClientRect();
                  const rect = optionsContainer.getBoundingClientRect();
                  optionsContainer.style.left = triggerRect.left + 'px';
                  if (triggerRect.bottom + rect.height > window.innerHeight && triggerRect.top > rect.height) {
                      optionsContainer.style.top = (triggerRect.top - rect.height - 4) + 'px';
                  } else {
                      optionsContainer.style.top = (triggerRect.bottom + 4) + 'px';
                  }
             }
        }, true);
        window.addEventListener('resize', closeAllCustomSelects);
    });
}

function closeAllCustomSelects() {
    document.querySelectorAll('.custom-select-options.open').forEach(el => el.classList.remove('open'));
    document.querySelectorAll('.custom-select-trigger.active').forEach(el => el.classList.remove('active'));
}

document.addEventListener('click', closeAllCustomSelects);
