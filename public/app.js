// --- 核心元素绑定 ---
        const tabTest = document.getElementById('tab-test');
        const tabFav = document.getElementById('tab-fav');
        const tabSettings = document.getElementById('tab-settings');
        const testViewContainer = document.getElementById('test-view-container');
        const settingsViewContainer = document.getElementById('settings-view-container');
        const tableCard = document.getElementById('table-card');
        const bottomBar = document.getElementById('bottom-bar');
        const pageDesc = document.getElementById('page-desc');
        
        const ipInput = document.getElementById('ip-input');
        const ipCount = document.getElementById('ip-count');
        const allowCnameInput = document.getElementById('allow-cname-input');
        const fileInput = document.getElementById('file-input');
        const importCsvBtn = document.getElementById('import-csv-btn');
        const clearInputBtn = document.getElementById('clear-input-btn');
        
        const startBtn = document.getElementById('start-btn');
        const statusPanel = document.getElementById('status-panel');
        const statusTitle = document.getElementById('status-title');
        const statusTag = document.getElementById('status-tag');
        const statusDots = document.getElementById('status-dots');
        const statusSub = document.getElementById('status-sub');
        const loadingSpinner = document.getElementById('loading-spinner');
        const progressFill = document.getElementById('progress-fill');
        const progressLabel = document.getElementById('progress-label');
        
        const resultBody = document.getElementById('result-body');
        const actionBar = document.getElementById('action-bar');
        const selectAllCheckbox = document.getElementById('select-all');
        const saveSelectedBtn = document.getElementById('save-selected-btn');
        const deleteSelectedBtn = document.getElementById('delete-selected-btn');
        const copySelectedBtn = document.getElementById('copy-selected-btn');
        const selectedCountSpan = document.getElementById('selected-count');
        const toast = document.getElementById('toast');
        const themeMode = document.getElementById('theme-mode');
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
        const parseTimeoutInput = document.getElementById('parse-timeout');
        const totalTimeoutInput = document.getElementById('total-timeout');
        const exportFormat = document.getElementById('export-format');
        const exportBtn = document.getElementById('export-btn');
        const scheduleInterval = document.getElementById('schedule-interval');
        const scheduleBtn = document.getElementById('schedule-btn');
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        const resetSettingsBtn = document.getElementById('reset-settings-btn');

        let currentView = 'test'; 
        let currentTableData = []; 
        let parsedTargets = [];
        let progressSource = null;
        let progressPollTimer = null;
        let lastProgressPercent = 0;
        let regionHydrationSeq = 0;
        const ipRegexGlobal = /(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)/g;
        const mixedRegex = /(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-zA-Z0-9][-a-zA-Z0-9]{0,62}\.)+[a-zA-Z]{2,}/g;

        // --- 基础工具 ---
        let toastTimeout;
        function showToast(msg) {
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

        function getSpeedClass(speed) { if (speed > 20) return 'speed-high'; if (speed > 5) return 'speed-mid'; return 'speed-low'; }
        function getTrendLabel(trend) {
            if (trend === 'up') return '⬆️ 提升';
            if (trend === 'down') return '⬇️ 下降';
            if (trend === 'stable') return '➡️ 稳定';
            return '🆕 新节点';
        }
        
        const THEME_KEY = 'cfst_theme_mode';
        const systemDarkMql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

        function applyTheme(mode) {
            const effective = mode === 'system' ? (systemDarkMql ? (systemDarkMql.matches ? 'dark' : 'light') : 'light') : mode;
            document.body.classList.toggle('dark', effective === 'dark');
        }

        function loadTheme() {
            const mode = localStorage.getItem(THEME_KEY) || 'system';
            themeMode.value = mode;
            applyTheme(mode);
        }

        if (systemDarkMql) {
            systemDarkMql.addEventListener('change', () => {
                const mode = localStorage.getItem(THEME_KEY) || 'system';
                if (mode === 'system') applyTheme('system');
            });
        }

        themeMode.addEventListener('change', () => {
            const mode = themeMode.value || 'system';
            localStorage.setItem(THEME_KEY, mode);
            applyTheme(mode);
        });

        function getTagForPhase(phase) {
            const p = String(phase || '').toLowerCase();
            if (p.includes('ping')) return 'PING';
            if (p.includes('下载') || p.includes('download')) return 'DOWN';
            if (p.includes('解析') || p.includes('dns')) return 'DNS';
            return 'RUN';
        }

        function closeProgressStream() {
            if (progressSource) {
                progressSource.close();
                progressSource = null;
            }
        }

        function stopProgressPolling() {
            if (progressPollTimer) {
                clearInterval(progressPollTimer);
                progressPollTimer = null;
            }
        }

        function startProgressPolling(taskId) {
            stopProgressPolling();
            progressPollTimer = setInterval(async () => {
                try {
                    const res = await fetch(`/api/progress-state/${encodeURIComponent(taskId)}`);
                    const json = await res.json();
                    if (!json.success || !json.data) return;
                    updateProgressUI(json.data);
                    if (json.data.state === 'done' || json.data.state === 'error') {
                        stopProgressPolling();
                    }
                } catch (e) {}
            }, 1200);
        }

        function resetProgressUI() {
            lastProgressPercent = 0;
            progressFill.style.width = '0%';
            progressLabel.innerText = '0%';
            loadingSpinner.style.display = 'block';
            statusTitle.innerText = '准备中';
            statusTag.innerText = 'RUN';
            statusDots.style.display = 'inline-flex';
            statusSub.innerText = '测速任务初始化中...';
        }

        function sanitizeProgressMessage(message) {
            if (!message) return '';
            return String(message)
                .replace(/\u001b\[[0-9;]*[A-Za-z]/g, ' ')
                .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function updateProgressUI(payload) {
            if (!payload) return;
            statusTitle.innerText = payload.phase || '测速中';
            statusTag.innerText = getTagForPhase(payload.phase);
            if (typeof payload.current === 'number' && typeof payload.total === 'number' && payload.total > 0) {
                statusSub.innerText = `${payload.current}/${payload.total}`;
            } else if (payload.message) {
                const cleanMessage = sanitizeProgressMessage(payload.message);
                if (/[\u4e00-\u9fffA-Za-z0-9]/.test(cleanMessage)) {
                    statusSub.innerText = cleanMessage.length > 70 ? `${cleanMessage.slice(0, 70)}...` : cleanMessage;
                }
            }
            if (typeof payload.percent === 'number') {
                let percent = Math.max(0, Math.min(100, Math.round(payload.percent)));
                if (payload.state !== 'done' && payload.state !== 'error') {
                    percent = Math.max(percent, lastProgressPercent);
                }
                lastProgressPercent = percent;
                progressFill.style.width = `${percent}%`;
                progressLabel.innerText = `${percent}%`;
            }
            if (payload.state === 'done') { loadingSpinner.style.display = 'none'; statusDots.style.display = 'none'; }
            if (payload.state === 'error') { loadingSpinner.style.display = 'none'; statusDots.style.display = 'none'; }
        }

        // --- 🚀 新版视图切换逻辑 ---
        function switchTab(view) {
            currentView = view;
            if (view === 'favorites') {
                tabFav.classList.add('active'); tabTest.classList.remove('active');
                tabSettings.classList.remove('active');
                pageDesc.innerText = '持久化保存在服务器上的专属优选库';
                testViewContainer.classList.add('hidden');
                settingsViewContainer.classList.add('hidden');
                tableCard.classList.remove('hidden');
                bottomBar.classList.add('hide-down'); // 丝滑隐藏底部按钮
                saveSelectedBtn.classList.remove('hidden');
                saveSelectedBtn.innerText = '⚡ 测速选中';
                deleteSelectedBtn.classList.remove('hidden');
                fetchAndRenderFavorites();
            } else if (view === 'settings') {
                tabSettings.classList.add('active'); tabTest.classList.remove('active'); tabFav.classList.remove('active');
                pageDesc.innerText = '外观与引擎参数设置（本地/服务端持久化）';
                testViewContainer.classList.add('hidden');
                tableCard.classList.add('hidden');
                settingsViewContainer.classList.remove('hidden');
                bottomBar.classList.add('hide-down');
            } else {
                tabTest.classList.add('active'); tabFav.classList.remove('active');
                tabSettings.classList.remove('active');
                pageDesc.innerText = '输入 CNAME 域名触发多节点智能解析';
                testViewContainer.classList.remove('hidden');
                settingsViewContainer.classList.add('hidden');
                tableCard.classList.remove('hidden');
                bottomBar.classList.remove('hide-down'); // 弹回底部按钮
                saveSelectedBtn.classList.remove('hidden');
                saveSelectedBtn.innerText = '💾 收藏';
                deleteSelectedBtn.classList.add('hidden');
                renderTable(currentTableData, '准备就绪，点击底部按钮开始测速');
            }
        }
        tabTest.addEventListener('click', () => { if(currentView !== 'test') switchTab('test'); });
        tabFav.addEventListener('click', () => { if(currentView !== 'favorites') switchTab('favorites'); });
        tabSettings.addEventListener('click', () => { if(currentView !== 'settings') switchTab('settings'); });

        function updateCfstModeVisibility() {
            const mode = cfstMode.value || 'tcp';
            if (mode === 'http') {
                cfstHttpingBox.classList.remove('is-collapsed');
                cfstCfcoloBox.classList.remove('is-collapsed');
            } else {
                cfstHttpingBox.classList.add('is-collapsed');
                cfstCfcoloBox.classList.add('is-collapsed');
            }
        }

        cfstMode.addEventListener('change', () => updateCfstModeVisibility());

        async function loadCfstConfig() {
            try {
                const res = await fetch('/api/settings/cfst');
                const json = await res.json();
                if (!json.success) return;
                const cfg = json.data || {};
                cfstMode.value = cfg.mode || 'tcp';
                cfstHttpingCodeInput.value = String(cfg.httpingCode ?? '');
                cfstCfcoloInput.value = cfg.cfcolo || '';
                cfstTpInput.value = String(cfg.tp ?? '');
                cfstNInput.value = String(cfg.n ?? '');
                cfstTInput.value = String(cfg.t ?? '');
                cfstUrlInput.value = cfg.url || '';
                cfstDtInput.value = String(cfg.dt ?? '');
                cfstDnInput.value = String(cfg.dn ?? '');
                cfstDnSingleInput.value = String(cfg.dnSingle ?? '');
                cfstTlInput.value = String(cfg.tl ?? '');
                cfstTllInput.value = String(cfg.tll ?? '');
                cfstTlrInput.value = String(cfg.tlr ?? '');
                cfstSlInput.value = String(cfg.sl ?? '');
                cfstDisableDownload.checked = Boolean(cfg.disableDownload);
                cfstAllip.checked = Boolean(cfg.allip);
                cfstDebug.checked = Boolean(cfg.debug);
                cfstTopNInput.value = String(cfg.topN ?? '');
                updateCfstModeVisibility();
            } catch (e) {}
        }

        async function saveCfstConfig() {
            const payload = {
                n: Number(cfstNInput.value),
                t: Number(cfstTInput.value),
                tp: Number(cfstTpInput.value),
                url: cfstUrlInput.value || '',
                mode: cfstMode.value || 'tcp',
                httpingCode: Number(cfstHttpingCodeInput.value),
                cfcolo: cfstCfcoloInput.value || '',
                dt: Number(cfstDtInput.value),
                dn: Number(cfstDnInput.value),
                dnSingle: Number(cfstDnSingleInput.value),
                tl: Number(cfstTlInput.value),
                tll: Number(cfstTllInput.value),
                tlr: Number(cfstTlrInput.value),
                sl: Number(cfstSlInput.value),
                disableDownload: cfstDisableDownload.checked,
                allip: cfstAllip.checked,
                debug: cfstDebug.checked,
                topN: Number(cfstTopNInput.value)
            };
            try {
                const res = await fetch('/api/settings/cfst', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const json = await res.json();
                if (json.success) {
                    const cfg = json.data || {};
                    cfstMode.value = cfg.mode || 'tcp';
                    cfstHttpingCodeInput.value = String(cfg.httpingCode ?? '');
                    cfstCfcoloInput.value = cfg.cfcolo || '';
                    cfstTpInput.value = String(cfg.tp ?? '');
                    cfstNInput.value = String(cfg.n ?? '');
                    cfstTInput.value = String(cfg.t ?? '');
                    cfstUrlInput.value = cfg.url || '';
                    cfstDtInput.value = String(cfg.dt ?? '');
                    cfstDnInput.value = String(cfg.dn ?? '');
                    cfstDnSingleInput.value = String(cfg.dnSingle ?? '');
                    cfstTlInput.value = String(cfg.tl ?? '');
                    cfstTllInput.value = String(cfg.tll ?? '');
                    cfstTlrInput.value = String(cfg.tlr ?? '');
                    cfstSlInput.value = String(cfg.sl ?? '');
                    cfstDisableDownload.checked = Boolean(cfg.disableDownload);
                    cfstAllip.checked = Boolean(cfg.allip);
                    cfstDebug.checked = Boolean(cfg.debug);
                    cfstTopNInput.value = String(cfg.topN ?? '');
                    updateCfstModeVisibility();
                    showToast('✅ 设置已保存');
                } else {
                    showToast('❌ 保存失败: ' + (json.msg || '未知错误'));
                }
            } catch (e) {
                showToast('❌ 保存失败: 网络错误');
            }
        }

        saveSettingsBtn.addEventListener('click', () => saveCfstConfig());
        resetSettingsBtn.addEventListener('click', () => {
            cfstMode.value = 'tcp';
            cfstHttpingCodeInput.value = '200';
            cfstCfcoloInput.value = '';
            cfstTpInput.value = '443';
            cfstNInput.value = '200';
            cfstTInput.value = '4';
            cfstUrlInput.value = 'https://speed.cloudflare.com/__down?bytes=20000000';
            cfstDtInput.value = '5';
            cfstDnInput.value = '10';
            cfstDnSingleInput.value = '1';
            cfstTlInput.value = '9999';
            cfstTllInput.value = '0';
            cfstTlrInput.value = '1';
            cfstSlInput.value = '0';
            cfstDisableDownload.checked = false;
            cfstAllip.checked = false;
            cfstDebug.checked = false;
            cfstTopNInput.value = '50';
            saveCfstConfig();
        });

        exportBtn.addEventListener('click', async () => {
            if (!Array.isArray(currentTableData) || currentTableData.length === 0) {
                showToast('❌ 当前没有可导出的结果');
                return;
            }
            try {
                const res = await fetch('/api/export', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ format: exportFormat.value || 'clash', items: currentTableData })
                });
                const json = await res.json();
                if (!json.success) return showToast('❌ 导出失败');
                await copyToClipboard(json.data, '✅ 导出内容已复制到剪贴板');
            } catch (e) {
                showToast('❌ 导出失败');
            }
        });

        scheduleBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        enabled: true,
                        intervalMin: Number(scheduleInterval.value || 60),
                        targets: parsedTargets.length > 0 ? parsedTargets : currentTableData.map(item => item.ip).filter(Boolean)
                    })
                });
                const json = await res.json();
                if (json.success) showToast('✅ 定时任务已保存');
                else showToast('❌ 定时任务保存失败');
            } catch (e) {
                showToast('❌ 定时任务保存失败');
            }
        });

        // --- 🚀 新版输入区联动逻辑 ---
        function extractAndUpdateInput(text) {
            const sourceText = String(text || '');
            const matcher = allowCnameInput && allowCnameInput.checked ? mixedRegex : ipRegexGlobal;
            const matches = sourceText.match(matcher) || [];
            parsedTargets = [...new Set(matches)];
            ipCount.innerText = parsedTargets.length;
            if (allowCnameInput && allowCnameInput.checked) {
                if (parsedTargets.length > 0) ipInput.value = parsedTargets.join('\n');
                else ipInput.value = sourceText;
            } else {
                ipInput.value = parsedTargets.join('\n');
            }
        }

        ipInput.addEventListener('paste', () => setTimeout(() => extractAndUpdateInput(ipInput.value), 10));
        ipInput.addEventListener('blur', () => extractAndUpdateInput(ipInput.value));
        clearInputBtn.addEventListener('click', () => { ipInput.value = ''; parsedTargets = []; ipCount.innerText = '0'; });
        allowCnameInput.addEventListener('change', () => {
            extractAndUpdateInput(ipInput.value);
            showToast(allowCnameInput.checked ? '✅ 已切换到 CNAME 模式（支持域名）' : '✅ 已切换到 IP 模式（自动移除非 IP）');
        });

        // 神级交互：点击导入CSV直接在前端提取并展示到输入框
        importCsvBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(evt) {
                const text = evt.target.result;
                extractAndUpdateInput(text);
                if (parsedTargets.length > 0) showToast(`✅ 成功提取 ${parsedTargets.length} 个${allowCnameInput.checked ? '目标' : 'IP'}`);
                else showToast(`❌ 未在文件中找到有效${allowCnameInput.checked ? ' IP 或域名' : ' IP'}`);
            };
            reader.readAsText(file);
            fileInput.value = ''; // 重置 file input
        });

        // --- 表格渲染器 ---
        function renderTable(dataArray, emptyMsg) {
            resultBody.innerHTML = ''; selectAllCheckbox.checked = false; updateSelectionState();
            if (!dataArray || dataArray.length === 0) {
                actionBar.classList.add('hidden');
                resultBody.innerHTML = `<tr><td colspan="7" class="text-center text-slate-500" style="padding: 4rem 1rem;">${emptyMsg}</td></tr>`;
                return;
            }
            actionBar.classList.remove('hidden');
            dataArray.forEach((item) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="text-center">
                        <input type="checkbox" class="ip-checkbox" data-ip="${item.ip}" data-region="${item.region}" data-ping="${item.ping}" data-speed="${item.speed}">
                    </td>
                    <td><span class="region-badge">${item.region || '❓ 未知'}</span></td>
                    <td><div class="copyable-ip font-mono text-slate-800" data-ip="${item.ip}">${item.ip}</div></td>
                    <td class="text-center text-slate-500">${Number(item.ping).toFixed(1)}ms</td>
                    <td class="text-right ${getSpeedClass(item.speed)}">${Number(item.speed).toFixed(2)}</td>
                    <td class="text-center">${Number(item.healthScore || 0).toFixed(1)}</td>
                    <td class="text-center text-slate-500">${getTrendLabel(item.trend)}</td>
                `;
                resultBody.appendChild(tr);
            });

            document.querySelectorAll('.ip-checkbox').forEach(cb => cb.addEventListener('change', updateSelectionState));
            document.querySelectorAll('.copyable-ip').forEach(el => {
                el.addEventListener('click', () => copyToClipboard(el.dataset.ip, `✅ 已复制 IP: ${el.dataset.ip}`));
            });
        }

        function shouldHydrateRegion(region) {
            const value = String(region || '').trim();
            return !value || value === '⏳ 获取中' || value === '❓ 未知' || value === '❓ 测速节点' || value === '⏳ 超时';
        }

        async function hydrateRegionsForTable(dataArray) {
            const rows = Array.isArray(dataArray) ? dataArray : [];
            const ips = [...new Set(rows.map(item => item && item.ip).filter(Boolean))];
            const pendingIps = ips.filter((ip) => {
                const row = rows.find(item => item.ip === ip);
                return row && shouldHydrateRegion(row.region);
            });
            if (pendingIps.length === 0) return;

            const seq = ++regionHydrationSeq;
            try {
                const res = await fetch('/api/regions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ips: pendingIps })
                });
                const json = await res.json();
                if (!json.success || seq !== regionHydrationSeq) return;
                const regionMap = json.data || {};
                let changed = 0;
                rows.forEach((item) => {
                    const nextRegion = regionMap[item.ip];
                    if (nextRegion && nextRegion !== item.region) {
                        item.region = nextRegion;
                        changed++;
                    }
                });
                if (changed > 0 && ((currentView === 'test' && rows === currentTableData) || currentView === 'favorites')) {
                    renderTable(rows, '未能测出有效的极速节点。');
                }
            } catch (e) {}
        }

        // --- 表格操作 ---
        function updateSelectionState() {
            const checkboxes = document.querySelectorAll('.ip-checkbox');
            const checkedCount = document.querySelectorAll('.ip-checkbox:checked').length;
            selectedCountSpan.innerText = checkedCount;
            const hasSelection = checkedCount > 0;
            copySelectedBtn.disabled = !hasSelection;
            saveSelectedBtn.disabled = !hasSelection;
            deleteSelectedBtn.disabled = !hasSelection;
            selectAllCheckbox.checked = hasSelection && checkedCount === checkboxes.length;
        }

        selectAllCheckbox.addEventListener('change', (e) => {
            document.querySelectorAll('.ip-checkbox').forEach(cb => cb.checked = e.target.checked);
            updateSelectionState();
        });
        
        copySelectedBtn.addEventListener('click', () => {
            const ips = Array.from(document.querySelectorAll('.ip-checkbox:checked')).map(cb => cb.dataset.ip).join('\n');
            copyToClipboard(ips, `✅ 成功复制 ${document.querySelectorAll('.ip-checkbox:checked').length} 个 IP`);
        });

        // 收藏夹相关 API
        async function fetchAndRenderFavorites() {
            resultBody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 3rem;"><div class="spinner" style="margin: 0 auto;"></div></td></tr>`;
            try {
                const res = await fetch('/api/saved-ips'); const json = await res.json();
                if (json.success) {
                    const data = json.data || [];
                    if (data.length === 0) {
                        renderTable([], '📭 收藏夹空空如也，快去测速页面收藏几个极速节点吧！');
                    } else {
                        const sorted = data.sort((a, b) => b.speed - a.speed);
                        renderTable(sorted, '📭 收藏夹空空如也，快去测速页面收藏几个极速节点吧！');
                        hydrateRegionsForTable(sorted);
                    }
                } else {
                    renderTable([], '❌ 获取收藏夹数据失败');
                }
            } catch (e) { 
                renderTable([], '❌ 无法连接服务器获取收藏夹');
                showToast('❌ 无法连接服务器获取收藏夹'); 
            }
        }

        saveSelectedBtn.addEventListener('click', async () => {
            if (currentView === 'favorites') {
                const selectedIps = Array.from(document.querySelectorAll('.ip-checkbox:checked')).map(cb => cb.dataset.ip).filter(Boolean);
                if (selectedIps.length === 0) return showToast('❌ 请先选择要测速的 IP');
                const taskId = `task_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
                try {
                    statusPanel.classList.remove('hidden');
                    statusTitle.innerText = '收藏测速';
                    statusSub.innerText = `正在测速 ${selectedIps.length} 个已收藏 IP...`;
                    closeProgressStream();
                    startProgressPolling(taskId);
                    progressSource = new EventSource(`/api/progress/${encodeURIComponent(taskId)}`);
                    progressSource.onmessage = (event) => {
                        try { updateProgressUI(JSON.parse(event.data)); } catch (e) {}
                    };
                    progressSource.onerror = () => closeProgressStream();

                    const response = await fetch('/api/start-test', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            targetIps: selectedIps,
                            inputMode: 'ip',
                            taskId,
                            runtimeOptions: {
                                incremental: false,
                                parseTimeoutSec: Number(parseTimeoutInput.value || 25),
                                totalTimeoutSec: Number(totalTimeoutInput.value || 150),
                                performanceMode: 'manual',
                                profile: /mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
                            }
                        })
                    });
                    const json = await response.json();
                    if (!json.success) {
                        showToast(`❌ 测速失败: ${json.msg || '未知错误'}`);
                        return;
                    }

                    const tested = Array.isArray(json.data) ? json.data : [];
                    const saveRes = await fetch('/api/save-ips', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ips: tested })
                    });
                    const saveJson = await saveRes.json();
                    if (saveJson.success) {
                        const failedCount = Math.max(0, selectedIps.length - tested.length);
                        showToast(`✅ 已更新 ${saveJson.updated || 0} 个收藏${failedCount > 0 ? `，${failedCount} 个疑似不可用` : ''}`);
                        fetchAndRenderFavorites();
                    } else {
                        showToast('❌ 测速结果回写失败');
                    }
                } catch (e) {
                    showToast('❌ 收藏测速失败');
                } finally {
                    setTimeout(() => closeProgressStream(), 800);
                    stopProgressPolling();
                }
                return;
            }

            const ipsToSave = Array.from(document.querySelectorAll('.ip-checkbox:checked')).map(cb => ({
                ip: cb.dataset.ip, region: cb.dataset.region, ping: parseFloat(cb.dataset.ping), speed: parseFloat(cb.dataset.speed)
            }));
            try {
                const res = await fetch('/api/save-ips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ips: ipsToSave }) });
                const json = await res.json();
                if (json.success) showToast(`🌟 成功收藏 ${json.added} 个新节点！`);
            } catch (e) { showToast('❌ 收藏失败'); }
        });

        deleteSelectedBtn.addEventListener('click', async () => {
            const ipsToDelete = Array.from(document.querySelectorAll('.ip-checkbox:checked')).map(cb => cb.dataset.ip);
            if(!confirm(`确定要删除这 ${ipsToDelete.length} 个节点吗？`)) return;
            try {
                const res = await fetch('/api/delete-ips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ips: ipsToDelete }) });
                if ((await res.json()).success) { showToast(`🗑️ 成功删除选中节点`); fetchAndRenderFavorites(); }
            } catch (e) { showToast('❌ 删除失败'); }
        });

        // --- 启动测速 ---
        startBtn.addEventListener('click', async () => {
            startBtn.disabled = true; startBtn.innerText = '测速中...';
            resetProgressUI();
            
            // 每次测速前重新读取文本框，防止用户手打内容忘了触发失去焦点
            extractAndUpdateInput(ipInput.value); 
            
            if (parsedTargets.length > 0) { statusTitle.innerText = '解析目标'; statusSub.innerText = '正在并发解析真实 IP...'; }
            else { statusTitle.innerText = '准备测速'; statusSub.innerText = '正在测试默认节点库...'; }
            
            statusPanel.classList.remove('hidden'); actionBar.classList.add('hidden'); resultBody.innerHTML = '';

            try {
                const taskId = `task_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
                closeProgressStream();
                startProgressPolling(taskId);
                progressSource = new EventSource(`/api/progress/${encodeURIComponent(taskId)}`);
                progressSource.onmessage = (event) => {
                    try { updateProgressUI(JSON.parse(event.data)); } catch (e) {}
                };
                progressSource.onerror = () => {
                    closeProgressStream();
                };

                // 现在的请求极其干净，只需要把纯文本 Target 数组发给后端
                const response = await fetch('/api/start-test', { 
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        targetIps: parsedTargets,
                        inputMode: allowCnameInput.checked ? 'cname' : 'ip',
                        taskId,
                        runtimeOptions: {
                            incremental: incrementalMode.checked,
                            parseTimeoutSec: Number(parseTimeoutInput.value || 25),
                            totalTimeoutSec: Number(totalTimeoutInput.value || 150),
                            performanceMode: 'manual',
                            profile: /mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
                        }
                    }) 
                });
                const json = await response.json();

                if (json.success) {
                    currentTableData = json.data; 
                    renderTable(currentTableData, '未能测出有效的极速节点。');
                    hydrateRegionsForTable(currentTableData);
                    statusPanel.classList.remove('hidden'); loadingSpinner.style.display = 'none';
                    progressFill.style.width = '100%';
                    progressLabel.innerText = '100%';
                    statusTitle.innerText = '完成';
                    statusSub.innerText = `测速完毕：${json.data.length} 个节点`;
                    stopProgressPolling();
                } else { showToast('测速失败: ' + json.msg); statusPanel.classList.add('hidden'); }
            } catch (error) { showToast('网络请求失败！请检查后端'); statusPanel.classList.add('hidden'); } 
            finally {
                setTimeout(() => closeProgressStream(), 800);
                stopProgressPolling();
                startBtn.disabled = false; startBtn.innerText = '重新测速';
            }
        });

        loadTheme();
        loadCfstConfig();
        renderTable(currentTableData, '准备就绪，点击底部按钮开始测速');
