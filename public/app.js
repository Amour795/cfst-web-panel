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

const cfZoneId = document.getElementById('cf-zone-id');
const cfDomain = document.getElementById('cf-domain');
const cfToken = document.getElementById('cf-token');
const cfEmail = document.getElementById('cf-email');
const saveCfSettingsBtn = document.getElementById('save-cf-settings-btn');
const refreshDnsBtn = document.getElementById('refresh-dns-btn');
const clearDnsBtn = document.getElementById('clear-dns-btn');
const dnsRecordList = document.getElementById('dns-record-list');
const dnsDomainLabel = document.getElementById('dns-domain-label');

const cfstMode = document.getElementById('cfst-mode');
const cfstHttpingBox = document.getElementById('cfst-httping-box');
const cfstCfcoloBox = document.getElementById('cfst-cfcolo-box');
const cfstHttpingCodeInput = document.getElementById('cfst-httping-code');
const cfstCfcoloInput = document.getElementById('cfst-cfcolo');
const cfstTpInput = document.getElementById('cfst-tp');
const cfstNInput = document.getElementById('cfst-n');
const cfstTInput = document.getElementById('cfst-t');
const cfstUrlInput = document.getElementById('cfst-url');
const cfstUrlPreset = document.getElementById('cfst-url-preset');
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
const speedProfilePreset = document.getElementById('speed-profile-preset');
const parseTimeoutInput = document.getElementById('parse-timeout');
const totalTimeoutInput = document.getElementById('total-timeout');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const resetSettingsBtn = document.getElementById('reset-settings-btn');

let currentView = 'test'; 
let currentTableData = []; 
let parsedTargets = [];
let progressSource = null;
let progressPollTimer = null;
let currentTaskId = '';
const TABLE_COLSPAN = 7;

// --- 地区码标准化字典 ---
const isoMap = {
    'HKG': 'HK', '香港': 'HK',
    'TPE': 'TW', '台北': 'TW', '台湾': 'TW',
    'NRT': 'JP', 'KIX': 'JP', '东京': 'JP', '大阪': 'JP', '日本': 'JP',
    'SGP': 'SG', '新加坡': 'SG',
    'ICN': 'KR', '首尔': 'KR', '韩国': 'KR',
    'LAX': 'US', 'SJC': 'US', 'SEA': 'US', '洛杉矶': 'US', '圣何塞': 'US', '西雅图': 'US', '美国': 'US',
    'FRA': 'DE', '法兰克福': 'DE', '德国': 'DE',
    'LHR': 'GB', '伦敦': 'GB', '英国': 'GB',
    'SYD': 'AU', '悉尼': 'AU', '澳大利亚': 'AU',
    'CDG': 'FR', '巴黎': 'FR', '法国': 'FR',
    'AMS': 'NL', '阿姆斯特丹': 'NL', '荷兰': 'NL',
    'YYZ': 'CA', '多伦多': 'CA', '加拿大': 'CA',
    'KUL': 'MY', '吉隆坡': 'MY', '马来西亚': 'MY',
    'BKK': 'TH', '曼谷': 'TH', '泰国': 'TH',
    'MNL': 'PH', '马尼拉': 'PH', '菲律宾': 'PH',
    'CGK': 'ID', '雅加达': 'ID', '印尼': 'ID',
    'BOM': 'IN', '孟买': 'IN', '印度': 'IN'
};

function getIsoCode(regionStr) {
    if (!regionStr || regionStr.includes('未知') || regionStr.includes('⏳')) return 'UN';
    const s = regionStr.toUpperCase();
    for (const [key, val] of Object.entries(isoMap)) {
        if (s.includes(key)) return val;
    }
    const match = s.match(/[A-Z]{3}/);
    return match ? match[0] : 'UN';
}

const ipRegexGlobal = /(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)/g;
const mixedRegex = /(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-zA-Z0-9][-a-zA-Z0-9]{0,62}\.)+[a-zA-Z]{2,}/g;

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
        if(pageDesc) pageDesc.innerText = '持久化保存在服务器上的专属优选节点库'; // 👈 新增功能介绍
        
        if(startBtn) startBtn.innerText = isFavoriteTesting ? '测速中...' : '测速选中';
        saveSelectedBtn?.classList.add('hidden');
        tagSelectedBtn?.classList.remove('hidden');
        deleteSelectedBtn?.classList.remove('hidden');
        fetchAndRenderFavorites();
    } else if (view === 'settings') {
        tabSettings?.classList.add('active');
        settingsViewContainer?.classList.remove('hidden');
        bottomBar?.classList.add('hide-down');
        if(pageDesc) pageDesc.innerText = '测速引擎核心参数与面板外观偏好设置'; // 👈 新增功能介绍
        
    } else if (view === 'dns') {
        tabDns?.classList.add('active');
        dnsViewContainer?.classList.remove('hidden');
        bottomBar?.classList.add('hide-down');
        if(pageDesc) pageDesc.innerText = 'Cloudflare 域名解析管理与优选 IP 一键同步'; // 👈 新增功能介绍
        
        loadDnsRecords();
    } else {
        tabTest?.classList.add('active');
        testViewContainer?.classList.remove('hidden');
        tableCard?.classList.remove('hidden');
        bottomBar?.classList.remove('hide-down');
        if(pageDesc) pageDesc.innerText = '输入 CNAME 域名或 IP 触发多节点智能解析与测速'; // 👈 新增功能介绍
        
        if(startBtn) { startBtn.disabled = false; startBtn.innerText = '开始测速'; }
        saveSelectedBtn?.classList.remove('hidden');
        if(saveSelectedBtn) saveSelectedBtn.innerText = '💾 收藏';
        tagSelectedBtn?.classList.add('hidden');
        deleteSelectedBtn?.classList.add('hidden');
        renderTable(currentTableData, '准备就绪，点击底部按钮开始测速');
    }
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
            if(cfZoneId) cfZoneId.value = data.zoneId || ''; 
            if(cfDomain) cfDomain.value = data.domain || '';
            if(cfToken) cfToken.value = data.token || ''; 
            if(cfEmail) cfEmail.value = data.email || '';
            if(data.domain && dnsDomainLabel) dnsDomainLabel.innerText = `当前管理: ${data.domain}`;
        }
    } catch (e) {}
}

saveCfSettingsBtn?.addEventListener('click', async () => {
    const payload = { 
        zoneId: cfZoneId?.value.trim() || '', 
        domain: cfDomain?.value.trim() || '', 
        token: cfToken?.value.trim() || '', 
        email: cfEmail?.value.trim() || '' 
    };
    try {
        await fetch('/api/settings/cf', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        showToast('✅ CF 配置已保存');
        if(payload.domain && dnsDomainLabel) dnsDomainLabel.innerText = `当前管理: ${payload.domain}`;
    } catch (e) { showToast('❌ 保存失败'); }
});


refreshDnsBtn?.addEventListener('click', loadDnsRecords);

async function syncToCloudflare(ips, clearOnly = false) {
    if(!syncCfBtn) return;
    const oldText = syncCfBtn.innerText;
    syncCfBtn.innerText = '📡 推送中...'; syncCfBtn.disabled = true;
    try {
        const res = await fetch('/api/cf/dns/sync', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ ips, clearOnly }) });
        const json = await res.json();
        if (json.success) { showToast(clearOnly ? '🧹 域名解析已清空' : `✅ 成功更新 ${json.added} 条记录`); if (currentView === 'dns') loadDnsRecords(); }
        else showToast(`❌ 同步失败: ${json.msg}`);
    } catch (e) { showToast('❌ 网络错误'); }
    finally { syncCfBtn.innerText = oldText; updateSelectionState(); }
}
syncCfBtn?.addEventListener('click', () => {
    const selectedIps = Array.from(document.querySelectorAll('.ip-checkbox:checked')).map(cb => cb.dataset.ip);
    if(selectedIps.length === 0) return showToast('❌ 请先选择节点');
    if(confirm(`确定要将这 ${selectedIps.length} 个 IP 覆盖解析到 CF 吗？`)) syncToCloudflare(selectedIps);
});
clearDnsBtn?.addEventListener('click', () => {
    if(confirm('⚠️ 危险操作：确定清空该子域名的所有 A 记录吗？')) syncToCloudflare([], true);
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
    
    document.querySelectorAll('.ip-checkbox').forEach(cb => cb.addEventListener('change', updateSelectionState));
    document.querySelectorAll('.copyable-ip').forEach(el => el.addEventListener('click', () => {
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
    const cbs = document.querySelectorAll('.ip-checkbox');
    const checked = document.querySelectorAll('.ip-checkbox:checked').length;
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
    document.querySelectorAll('.ip-checkbox').forEach(cb => cb.checked = e.target.checked); 
    updateSelectionState(); 
});

copySelectedBtn?.addEventListener('click', () => {
    const ips = Array.from(document.querySelectorAll('.ip-checkbox:checked')).map(cb => {
        const ip = cb.dataset.ip;
        const region = cb.dataset.region || '';
        const tag = cb.dataset.tag || '';
        const isoCode = getIsoCode(region);
        let text = `${ip}#${isoCode}`;
        if (tag && tag !== '-') text += `|${tag}`;
        return text;
    }).join('\n');
    copyToClipboard(ips, `✅ 成功复制 ${document.querySelectorAll('.ip-checkbox:checked').length} 项`);
});

// --- 设置标签逻辑 ---
tagSelectedBtn?.addEventListener('click', async () => {
    const selectedCbs = Array.from(document.querySelectorAll('.ip-checkbox:checked'));
    if (selectedCbs.length === 0) return showToast('❌ 请先选择节点');

    const newTag = prompt(`请输入为这 ${selectedCbs.length} 个节点设置的标签：\n(留空则为清除标签)`);
    if (newTag === null) return; // 用户点击了取消

    const ipsToUpdate = selectedCbs.map(cb => ({
        ip: cb.dataset.ip,
        tag: newTag.trim()
    }));

    try {
        const res = await fetch('/api/save-ips', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ ips: ipsToUpdate }) 
        });
        const json = await res.json();
        if (json.success) { 
            showToast(`🏷️ 标签已更新`); 
            fetchAndRenderFavorites(); 
        } else {
            showToast('❌ 标签设置失败');
        }
    } catch (e) { 
        showToast('❌ 网络错误'); 
    }
});

async function fetchAndRenderFavorites() {
    if(!resultBody) return;
    resultBody.innerHTML = `<tr><td colspan="${TABLE_COLSPAN}"><div class="spinner" style="margin: 0 auto;"></div></td></tr>`;
    try {
        const res = await fetch('/api/saved-ips'); const json = await res.json();
        currentTableData = json.success ? json.data.sort((a, b) => b.speed - a.speed) : [];
        renderTable(currentTableData, '📭 收藏夹空空如也');
    } catch (e) { renderTable([], '❌ 获取失败'); }
}

saveSelectedBtn?.addEventListener('click', async () => {
    // 修复：收藏时一并提取当前表格中的 ping 和 speed
    const ipsToSave = Array.from(document.querySelectorAll('.ip-checkbox:checked')).map(cb => {
        const ip = cb.dataset.ip;
        const rowData = currentTableData.find(d => d.ip === ip) || {};
        return { 
            ip: ip, 
            region: cb.dataset.region || rowData.region,
            ping: rowData.ping,
            speed: rowData.speed
        };
    });

    try {
        const res = await fetch('/api/save-ips', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ ips: ipsToSave }) 
        });
        if ((await res.json()).success) showToast(`🌟 收藏成功`);
    } catch (e) {}
});

// --- 1. 补充 DOM 绑定 ---
const manualDnsIp = document.getElementById('manual-dns-ip');
const addDnsBtn = document.getElementById('add-dns-btn');

// --- 2. 修改 loadDnsRecords 函数以支持单条删除按钮 ---
async function loadDnsRecords() {
    if(!dnsRecordList) return;
    dnsRecordList.innerHTML = '<div class="history-item"><div class="spinner"></div>正在获取...</div>';
    try {
        const res = await fetch('/api/cf/dns');
        const json = await res.json();
        if (!json.success) return dnsRecordList.innerHTML = `<div class="history-item" style="color:#ef4444;">${json.msg || '获取失败'}</div>`;
        const records = json.data || [];
        if (records.length === 0) return dnsRecordList.innerHTML = '<div class="history-item text-center">当前域名下无 A 记录</div>';

        // 1. 提取出所有 CF 上的 IP
        const ips = records.map(r => r.content);
        let regionMap = {};

        // 2. 调用后端接口，批量查询这些 IP 的物理地区
        try {
            const regRes = await fetch('/api/regions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ips })
            });
            const regJson = await regRes.json();
            if (regJson.success) regionMap = regJson.data || {};
        } catch(e) {
            console.warn("获取地区失败", e);
        }

        // 3. 将地区信息合并进去，重新渲染列表
        dnsRecordList.innerHTML = records.map(r => {
            const region = regionMap[r.content] || '❓ 未知';
            return `
            <div class="history-item" style="align-items: center;">
                <div style="display: flex; flex-direction: column; gap: 0.3rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="font-mono text-slate-800" style="font-size: 1rem;">${r.content}</span>
                        <span class="region-badge" style="font-size: 0.65rem; padding: 0.15rem 0.45rem; line-height: 1;">${region}</span>
                    </div>
                    <span style="font-size: 0.7rem; color: #94a3b8;">${r.proxied ? '☁️ 代理模式 (CDN)' : '🌐 直连模式 (仅 DNS)'}</span>
                </div>
                <button class="single-dns-del-btn" data-id="${r.id}" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; font-size: 1.1rem; transition: color 0.2s;">🗑️</button>
            </div>
            `;
        }).join('');

        // 绑定单条删除事件（加了 hover 变红效果，更精致）
        document.querySelectorAll('.single-dns-del-btn').forEach(btn => {
            btn.addEventListener('mouseover', () => btn.style.color = '#ef4444');
            btn.addEventListener('mouseout', () => btn.style.color = '#94a3b8');
            btn.addEventListener('click', async () => {
                if(!confirm('确定删除此条解析吗？')) return;
                const recordId = btn.dataset.id;
                try {
                    const delRes = await fetch(`/api/cf/dns/${recordId}`, { method: 'DELETE' });
                    if((await delRes.json()).success) { showToast('✅ 已删除'); loadDnsRecords(); }
                } catch(e) { showToast('❌ 删除失败'); }
            });
        });
    } catch (e) { dnsRecordList.innerHTML = '<div class="history-item">网络错误</div>'; }
}

// --- 3. 补充“手动添加”逻辑 ---
addDnsBtn?.addEventListener('click', async () => {
    const ip = manualDnsIp.value.trim();
    if(!ip) return showToast('❌ 请输入有效的 IP');
    
    addDnsBtn.disabled = true;
    try {
        const res = await fetch('/api/cf/dns/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip })
        });
        const json = await res.json();
        if(json.success) {
            showToast('✅ 添加成功');
            manualDnsIp.value = '';
            loadDnsRecords(); // 刷新列表
        } else {
            showToast(`❌ 失败: ${json.msg}`);
        }
    } finally { addDnsBtn.disabled = false; }
});

deleteSelectedBtn?.addEventListener('click', async () => {
    const ipsToDelete = Array.from(document.querySelectorAll('.ip-checkbox:checked')).map(cb => cb.dataset.ip);
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

        const targetIps = currentView === 'favorites' ? Array.from(document.querySelectorAll('.ip-checkbox:checked')).map(cb => cb.dataset.ip) : parsedTargets;
        if (currentView === 'favorites' && targetIps.length === 0) { throw new Error("请先选择要测速的 IP"); }

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
            currentTableData = json.data; renderTable(currentTableData, '未能测出有效节点');
            if(currentView === 'favorites') {
                await fetch('/api/save-ips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ips: json.data }) });
                fetchAndRenderFavorites();
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
        const res = await fetch('/api/settings/cfst'); const json = await res.json();
        if (json.success) {
            const c = json.data; 
            if(cfstMode) cfstMode.value = c.mode||'tcp'; 
            if(cfstUrlInput) cfstUrlInput.value = c.url||'';
            if(cfstDtInput) cfstDtInput.value = c.dt||''; 
            if(cfstDnInput) cfstDnInput.value = c.dn||''; 
            if(cfstNInput) cfstNInput.value = c.n||'';
            if(cfstTpInput) cfstTpInput.value = c.tp||''; 
            if(cfstTopNInput) cfstTopNInput.value = c.topN||'';
            updateCfstModeVisibility();
        }
    } catch (e) {}
}
cfstMode?.addEventListener('change', updateCfstModeVisibility);
saveSettingsBtn?.addEventListener('click', async () => {
    const payload = { mode: cfstMode?.value, url: cfstUrlInput?.value, dt: Number(cfstDtInput?.value), dn: Number(cfstDnInput?.value), n: Number(cfstNInput?.value), tp: Number(cfstTpInput?.value), topN: Number(cfstTopNInput?.value) };
    try { await fetch('/api/settings/cfst', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) }); showToast('✅ 设置已保存'); } catch (e) {}
});
resetSettingsBtn?.addEventListener('click', async () => {
    try { const res = await fetch('/api/settings/cfst/reset', { method: 'POST' }); if ((await res.json()).success) { loadCfstConfig(); showToast('✅ 已恢复官方推荐设置'); } } catch (e) {}
});

if(themeMode) {
    themeMode.value = localStorage.getItem('theme') || 'system'; applyTheme(themeMode.value);
}
loadCfApiConfig();
loadCfstConfig();
renderTable(currentTableData, '准备就绪，点击底部按钮开始测速');