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
        const sourceUrlPreset = document.getElementById('source-url-preset');
        const sourceUrlInput = document.getElementById('source-url-input');
        const fetchSourceBtn = document.getElementById('fetch-source-btn');
        
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const healthCheckBtn = document.getElementById('health-check-btn');
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
        const tagSelectedBtn = document.getElementById('tag-selected-btn');
        const deleteSelectedBtn = document.getElementById('delete-selected-btn');
        const copySelectedBtn = document.getElementById('copy-selected-btn');
        const exportCsvBtn = document.getElementById('export-csv-btn');
        const exportJsonBtn = document.getElementById('export-json-btn');
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
        const customProfileNameInput = document.getElementById('custom-profile-name');
        const saveCustomProfileBtn = document.getElementById('save-custom-profile-btn');
        const deleteCustomProfileBtn = document.getElementById('delete-custom-profile-btn');
        const exportProfileBtn = document.getElementById('export-profile-btn');
        const importProfileBtn = document.getElementById('import-profile-btn');
        const importProfileFile = document.getElementById('import-profile-file');
        const parseTimeoutInput = document.getElementById('parse-timeout');
        const totalTimeoutInput = document.getElementById('total-timeout');
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        const resetSettingsBtn = document.getElementById('reset-settings-btn');
        const recentTaskList = document.getElementById('recent-task-list');
        const historyStatusFilter = document.getElementById('history-status-filter');
        const historyTimeFilter = document.getElementById('history-time-filter');
        const clearHistoryBtn = document.getElementById('clear-history-btn');

        let currentView = 'test'; 
        let currentTableData = []; 
        let parsedTargets = [];
        let progressSource = null;
        let progressPollTimer = null;
        let lastProgressPercent = 0;
        let regionHydrationSeq = 0;
        let isFavoriteTesting = false;
        let currentTaskId = '';
        const TABLE_COLSPAN = 9;
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
        function formatCompare(item) {
            const ds = Number(item && item.deltaSpeed);
            const dp = Number(item && item.deltaPing);
            const speedText = Number.isFinite(ds) ? `${ds >= 0 ? '+' : ''}${ds.toFixed(2)}MB/s` : '--';
            const pingText = Number.isFinite(dp) ? `${dp >= 0 ? '+' : ''}${dp.toFixed(1)}ms` : '--';
            return `${speedText} / ${pingText}`;
        }
        const REGION_CODE_MAP = {
            HKG: 'HK', KHH: 'TW', TPE: 'TW', NRT: 'JP', KIX: 'JP',
            SIN: 'SG', SGP: 'SG', ICN: 'KR', LAX: 'US', SJC: 'US',
            SEA: 'US', FRA: 'DE', LHR: 'GB', SYD: 'AU', CDG: 'FR',
            AMS: 'NL', YYZ: 'CA', KUL: 'MY', BKK: 'TH', MNL: 'PH',
            CGK: 'ID', BOM: 'IN'
        };
        function normalizeRegionForCopy(csvColo, regionText) {
            const colo = String(csvColo || '').trim().toUpperCase();
            if (colo && colo !== 'N/A') return REGION_CODE_MAP[colo] || colo;
            const cleaned = String(regionText || '')
                .replace(/[^\u4e00-\u9fa5A-Za-z0-9_-]/g, '')
                .toUpperCase();
            if (!cleaned) return 'UNKNOWN';
            return REGION_CODE_MAP[cleaned] || cleaned;
        }
        const URL_PRESET_MAP = {
            cf_5m: 'https://speed.cloudflare.com/__down?bytes=5000000',
            cf_20m: 'https://speed.cloudflare.com/__down?bytes=20000000',
            cf_50m: 'https://speed.cloudflare.com/__down?bytes=50000000',
            cf_100m: 'https://speed.cloudflare.com/__down?bytes=100000000',
            ovh_100m: 'https://proof.ovh.net/files/100Mb.dat',
            ovh_1g: 'https://proof.ovh.net/files/1Gb.dat'
        };
        const SOURCE_URL_PRESET_MAP = {
            uouin_cf: 'https://api.uouin.com/cloudflare.html',
            xiu2_iptxt: 'https://raw.githubusercontent.com/XIU2/CloudflareSpeedTest/master/ip.txt',
            xiu2_ipv6txt: 'https://raw.githubusercontent.com/XIU2/CloudflareSpeedTest/master/ipv6.txt',
            yaozxc_iptxt: 'https://raw.githubusercontent.com/yaozxc/CloudflareSpeedTest-api/master/ip.txt',
            edison_iptxt: 'https://raw.githubusercontent.com/EdisonChenKoonHei/CloudflareSpeedTest/master/ip.txt',
            cf_ips_v4: 'https://www.cloudflare.com/ips-v4',
            cf_ips_v6: 'https://www.cloudflare.com/ips-v6',
            cf_ips_api: 'https://api.cloudflare.com/client/v4/ips'
        };
        function syncUrlPresetSelection(url) {
            const normalized = String(url || '').trim();
            const match = Object.entries(URL_PRESET_MAP).find(([, value]) => value === normalized);
            cfstUrlPreset.value = match ? match[0] : 'custom';
        }
        
        const THEME_KEY = 'cfst_theme_mode';
        const SETTINGS_LOCAL_KEY = 'cfst_runtime_local_settings_v1';
        const TASK_HISTORY_KEY = 'cfst_local_task_history_v1';
        const CUSTOM_PROFILE_KEY = 'cfst_custom_profiles_v1';
        const PROFILE_PRESETS = {
            fast: { n: 60, t: 2, dt: 2, dn: 3, topN: 12 },
            balance: { n: 140, t: 3, dt: 4, dn: 8, topN: 20 },
            precise: { n: 260, t: 5, dt: 8, dn: 12, topN: 30 }
        };
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
        function setStatusVisualState(phase, state) {
            statusPanel.classList.remove('phase-dns', 'phase-ping', 'phase-down', 'phase-run', 'state-running', 'state-done', 'state-error');
            const p = String(phase || '').toLowerCase();
            if (p.includes('解析') || p.includes('dns')) statusPanel.classList.add('phase-dns');
            else if (p.includes('ping')) statusPanel.classList.add('phase-ping');
            else if (p.includes('下载') || p.includes('download')) statusPanel.classList.add('phase-down');
            else statusPanel.classList.add('phase-run');

            if (state === 'done') statusPanel.classList.add('state-done');
            else if (state === 'error') statusPanel.classList.add('state-error');
            else statusPanel.classList.add('state-running');
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
            setStatusVisualState('run', 'running');
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
            setStatusVisualState(payload.phase, payload.state);
            let computedPercentFromRatio = null;
            if (typeof payload.current === 'number' && typeof payload.total === 'number' && payload.total > 0) {
                statusSub.innerText = `${payload.current}/${payload.total}`;
                computedPercentFromRatio = Math.max(0, Math.min(100, Math.round((payload.current / payload.total) * 100)));
            } else if (payload.message) {
                const cleanMessage = sanitizeProgressMessage(payload.message);
                if (/[\u4e00-\u9fffA-Za-z0-9]/.test(cleanMessage)) {
                    statusSub.innerText = cleanMessage.length > 70 ? `${cleanMessage.slice(0, 70)}...` : cleanMessage;
                }
            }
            if (typeof payload.percent === 'number' || computedPercentFromRatio !== null) {
                let percent = typeof payload.percent === 'number'
                    ? Math.max(0, Math.min(100, Math.round(payload.percent)))
                    : 0;
                if (computedPercentFromRatio !== null) {
                    percent = computedPercentFromRatio;
                }
                if (payload.state !== 'done' && payload.state !== 'error' && percent >= 100) {
                    percent = 99;
                }
                // 若存在 current/total，优先使用真实比例；否则才做单调保护
                if (computedPercentFromRatio === null && payload.state !== 'done' && payload.state !== 'error') {
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
                bottomBar.classList.remove('hide-down');
                startBtn.innerText = isFavoriteTesting ? '测速中...' : '测速选中';
                saveSelectedBtn.classList.add('hidden');
                tagSelectedBtn.classList.remove('hidden');
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
                startBtn.disabled = false;
                startBtn.innerText = '开始测速';
                saveSelectedBtn.classList.remove('hidden');
                saveSelectedBtn.innerText = '💾 收藏';
                tagSelectedBtn.classList.add('hidden');
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

        function collectCurrentProfileValues() {
            return {
                mode: cfstMode.value || 'tcp',
                n: Number(cfstNInput.value),
                t: Number(cfstTInput.value),
                dt: Number(cfstDtInput.value),
                dn: Number(cfstDnInput.value),
                topN: Number(cfstTopNInput.value),
                tp: Number(cfstTpInput.value),
                url: cfstUrlInput.value || '',
                sl: Number(cfstSlInput.value),
                tl: Number(cfstTlInput.value),
                tll: Number(cfstTllInput.value),
                tlr: Number(cfstTlrInput.value),
                httpingCode: Number(cfstHttpingCodeInput.value),
                cfcolo: cfstCfcoloInput.value || '',
                disableDownload: Boolean(cfstDisableDownload.checked),
                allip: Boolean(cfstAllip.checked)
            };
        }

        function applyProfilePreset(key) {
            let preset = PROFILE_PRESETS[key];
            if (!preset) {
                const customProfiles = getCustomProfiles();
                preset = customProfiles[key]?.config;
            }
            if (!preset) return;
            if (typeof preset.mode === 'string') cfstMode.value = preset.mode;
            cfstNInput.value = String(preset.n);
            cfstTInput.value = String(preset.t);
            cfstDtInput.value = String(preset.dt);
            cfstDnInput.value = String(preset.dn);
            cfstTopNInput.value = String(preset.topN);
            if (Number.isFinite(Number(preset.tp))) cfstTpInput.value = String(preset.tp);
            if (typeof preset.url === 'string') cfstUrlInput.value = preset.url;
            if (Number.isFinite(Number(preset.sl))) cfstSlInput.value = String(preset.sl);
            if (Number.isFinite(Number(preset.tl))) cfstTlInput.value = String(preset.tl);
            if (Number.isFinite(Number(preset.tll))) cfstTllInput.value = String(preset.tll);
            if (Number.isFinite(Number(preset.tlr))) cfstTlrInput.value = String(preset.tlr);
            if (Number.isFinite(Number(preset.httpingCode))) cfstHttpingCodeInput.value = String(preset.httpingCode);
            if (typeof preset.cfcolo === 'string') cfstCfcoloInput.value = preset.cfcolo;
            if (typeof preset.disableDownload === 'boolean') cfstDisableDownload.checked = preset.disableDownload;
            if (typeof preset.allip === 'boolean') cfstAllip.checked = preset.allip;
            updateCfstModeVisibility();
            syncUrlPresetSelection(cfstUrlInput.value);
            showToast('✅ 已应用测速模板');
        }

        function getCustomProfiles() {
            try {
                const raw = localStorage.getItem(CUSTOM_PROFILE_KEY);
                const parsed = JSON.parse(raw || '{}');
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (e) {
                return {};
            }
        }

        function saveCustomProfiles(data) {
            localStorage.setItem(CUSTOM_PROFILE_KEY, JSON.stringify(data || {}));
        }

        function renderProfileOptions() {
            const current = speedProfilePreset.value;
            const customProfiles = getCustomProfiles();
            Array.from(speedProfilePreset.querySelectorAll('option[data-custom="1"]')).forEach((opt) => opt.remove());
            Object.keys(customProfiles).forEach((name) => {
                const opt = document.createElement('option');
                opt.value = `custom:${name}`;
                opt.dataset.custom = '1';
                opt.textContent = `自定义：${name}`;
                speedProfilePreset.appendChild(opt);
            });
            const exists = Array.from(speedProfilePreset.options).some((opt) => opt.value === current);
            if (current && exists) {
                speedProfilePreset.value = current;
            }
        }

        cfstMode.addEventListener('change', () => updateCfstModeVisibility());
        cfstUrlPreset.addEventListener('change', () => {
            const key = cfstUrlPreset.value;
            if (key === 'custom') return;
            const url = URL_PRESET_MAP[key];
            if (url) cfstUrlInput.value = url;
        });
        cfstUrlInput.addEventListener('input', () => syncUrlPresetSelection(cfstUrlInput.value));
        speedProfilePreset.addEventListener('change', () => applyProfilePreset(speedProfilePreset.value));
        saveCustomProfileBtn.addEventListener('click', () => {
            const name = String(customProfileNameInput.value || '').trim();
            if (!name) return showToast('❌ 请先输入模板名');
            if (name.length > 20) return showToast('❌ 模板名最多 20 个字符');
            const key = `custom:${name}`;
            const all = getCustomProfiles();
            all[key] = { config: collectCurrentProfileValues(), updatedAt: Date.now() };
            saveCustomProfiles(all);
            renderProfileOptions();
            speedProfilePreset.value = key;
            saveLocalRuntimeSettings();
            showToast('✅ 已保存自定义模板');
        });
        deleteCustomProfileBtn.addEventListener('click', () => {
            const key = speedProfilePreset.value || '';
            if (!key.startsWith('custom:')) return showToast('❌ 请先选择一个自定义模板');
            const all = getCustomProfiles();
            if (!all[key]) return showToast('❌ 该模板不存在');
            delete all[key];
            saveCustomProfiles(all);
            renderProfileOptions();
            speedProfilePreset.value = 'balance';
            saveLocalRuntimeSettings();
            showToast('✅ 已删除自定义模板');
        });
        exportProfileBtn.addEventListener('click', () => {
            const all = getCustomProfiles();
            downloadTextFile(`cfst_profiles_${Date.now()}.json`, JSON.stringify(all, null, 2));
            showToast('✅ 已导出自定义模板');
        });
        importProfileBtn.addEventListener('click', () => importProfileFile.click());
        importProfileFile.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const parsed = JSON.parse(String(evt.target?.result || '{}'));
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                        showToast('❌ 模板文件格式错误');
                        return;
                    }
                    const merged = { ...getCustomProfiles(), ...parsed };
                    saveCustomProfiles(merged);
                    renderProfileOptions();
                    showToast('✅ 模板导入完成');
                } catch {
                    showToast('❌ 模板导入失败');
                } finally {
                    importProfileFile.value = '';
                }
            };
            reader.readAsText(file);
        });

        async function loadCfstConfig() {
            try {
                const res = await fetch('/api/settings/cfst');
                const json = await res.json();
                if (!json.success) return;
                applyCfstConfigToForm(json.data || {});
                updateCfstModeVisibility();
            } catch (e) {}
        }

        function loadLocalRuntimeSettings() {
            try {
                const raw = localStorage.getItem(SETTINGS_LOCAL_KEY);
                if (!raw) return;
                const saved = JSON.parse(raw);
                if (typeof saved.incremental === 'boolean') incrementalMode.checked = saved.incremental;
                if (typeof saved.incrementalDownOnly === 'boolean') incrementalDownOnly.checked = saved.incrementalDownOnly;
                if (Number.isFinite(Number(saved.parseTimeoutSec))) parseTimeoutInput.value = String(saved.parseTimeoutSec);
                if (Number.isFinite(Number(saved.totalTimeoutSec))) totalTimeoutInput.value = String(saved.totalTimeoutSec);
                if (typeof saved.profilePreset === 'string' && PROFILE_PRESETS[saved.profilePreset]) {
                    speedProfilePreset.value = saved.profilePreset;
                } else if (typeof saved.profilePreset === 'string' && saved.profilePreset.startsWith('custom:')) {
                    const all = getCustomProfiles();
                    if (all[saved.profilePreset]) speedProfilePreset.value = saved.profilePreset;
                }
            } catch (e) {}
        }

        function saveLocalRuntimeSettings() {
            const payload = {
                incremental: incrementalMode.checked,
                incrementalDownOnly: incrementalDownOnly.checked,
                parseTimeoutSec: Number(parseTimeoutInput.value || 25),
                totalTimeoutSec: Number(totalTimeoutInput.value || 150),
                profilePreset: speedProfilePreset.value || 'balance'
            };
            localStorage.setItem(SETTINGS_LOCAL_KEY, JSON.stringify(payload));
        }

        function getTaskHistory() {
            try {
                const raw = localStorage.getItem(TASK_HISTORY_KEY);
                const data = JSON.parse(raw || '[]');
                return Array.isArray(data) ? data : [];
            } catch (e) {
                return [];
            }
        }

        function renderTaskHistory() {
            const rows = getTaskHistory();
            const statusFilter = historyStatusFilter.value || 'all';
            const timeFilter = historyTimeFilter.value || 'all';
            const now = Date.now();
            const filtered = rows.filter((item) => {
                if (statusFilter === 'success' && !item.success) return false;
                if (statusFilter === 'failed' && item.success) return false;
                if (timeFilter === '24h' && (now - Number(item.ts || 0)) > 24 * 3600 * 1000) return false;
                if (timeFilter === '7d' && (now - Number(item.ts || 0)) > 7 * 24 * 3600 * 1000) return false;
                return true;
            });
            if (!filtered.length) {
                recentTaskList.innerHTML = '<div class="history-item"><span>暂无记录</span><span>-</span></div>';
                return;
            }
            recentTaskList.innerHTML = filtered.slice(0, 8).map((item) => {
                const ts = new Date(item.ts).toLocaleString();
                const text = `${item.mode} · ${item.targets}目标 · ${item.success ? '成功' : '失败'}`;
                const detail = item.success ? `${item.count}结果 / ${item.durationSec}s` : (item.msg || '失败');
                return `<div class="history-item"><span title="${escapeHtml(ts)}">${escapeHtml(text)}</span><span>${escapeHtml(detail)}</span></div>`;
            }).join('');
        }

        function pushTaskHistory(row) {
            const prev = getTaskHistory();
            prev.unshift(row);
            localStorage.setItem(TASK_HISTORY_KEY, JSON.stringify(prev.slice(0, 30)));
            renderTaskHistory();
        }
        historyStatusFilter.addEventListener('change', renderTaskHistory);
        historyTimeFilter.addEventListener('change', renderTaskHistory);
        clearHistoryBtn.addEventListener('click', () => {
            localStorage.removeItem(TASK_HISTORY_KEY);
            renderTaskHistory();
            showToast('✅ 已清空任务历史');
        });

        function diagnoseTestFailure(msg) {
            const text = String(msg || '').toLowerCase();
            if (text.includes('cfst')) return '请检查 cfst 是否存在并已 chmod +x';
            if (text.includes('超时')) return '可在设置里提高“解析超时/任务总超时”，或降低 n/dn';
            if (text.includes('解析')) return '请检查输入内容是否为有效 IP/域名，或切换 CNAME 模式';
            if (text.includes('网络')) return '请检查本机网络连通性后重试';
            return '请先恢复官方推荐参数，再逐步调高性能参数';
        }
        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function applyCfstConfigToForm(cfg) {
            cfstMode.value = cfg.mode || 'tcp';
            cfstHttpingCodeInput.value = String(cfg.httpingCode ?? '');
            cfstCfcoloInput.value = cfg.cfcolo || '';
            cfstTpInput.value = String(cfg.tp ?? '');
            cfstNInput.value = String(cfg.n ?? '');
            cfstTInput.value = String(cfg.t ?? '');
            cfstUrlInput.value = cfg.url || '';
            syncUrlPresetSelection(cfg.url || '');
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
                    applyCfstConfigToForm(json.data || {});
                    showToast('✅ 设置已保存');
                } else {
                    showToast('❌ 保存失败: ' + (json.msg || '未知错误'));
                }
            } catch (e) {
                showToast('❌ 保存失败: 网络错误');
            }
        }

        saveSettingsBtn.addEventListener('click', () => saveCfstConfig());
        resetSettingsBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/settings/cfst/reset', { method: 'POST' });
                const json = await res.json();
                if (!json.success) return showToast('❌ 恢复官方推荐失败');
                applyCfstConfigToForm(json.data || {});
                showToast('✅ 已恢复官方推荐设置');
            } catch (e) {
                showToast('❌ 恢复官方推荐失败');
            }
        });
        [incrementalMode, incrementalDownOnly, parseTimeoutInput, totalTimeoutInput, speedProfilePreset].forEach((el) => {
            el.addEventListener('change', saveLocalRuntimeSettings);
            el.addEventListener('input', saveLocalRuntimeSettings);
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
        sourceUrlPreset.addEventListener('change', () => {
            const key = sourceUrlPreset.value;
            if (key === 'custom') return;
            const url = SOURCE_URL_PRESET_MAP[key];
            if (url) sourceUrlInput.value = url;
        });
        sourceUrlInput.addEventListener('input', () => {
            const current = String(sourceUrlInput.value || '').trim();
            const matched = Object.entries(SOURCE_URL_PRESET_MAP).find(([, value]) => value === current);
            sourceUrlPreset.value = matched ? matched[0] : 'custom';
        });

        fetchSourceBtn.addEventListener('click', async () => {
            const url = String(sourceUrlInput.value || '').trim();
            if (!url) return showToast('❌ 请先输入拉取源 URL');
            fetchSourceBtn.disabled = true;
            const oldText = fetchSourceBtn.innerText;
            fetchSourceBtn.innerText = '拉取中...';
            try {
                const res = await fetch('/api/fetch-source', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                const json = await res.json();
                if (!json.success) return showToast(`❌ 拉取失败: ${json.msg || '未知错误'}`);
                const text = String(json.data || '');
                const merged = [ipInput.value, text].filter(Boolean).join('\n');
                extractAndUpdateInput(merged);
                showToast(`✅ 拉取成功，当前识别 ${parsedTargets.length} 个${allowCnameInput.checked ? '目标' : 'IP'}`);
            } catch (e) {
                showToast('❌ 拉取失败: 网络错误');
            } finally {
                fetchSourceBtn.disabled = false;
                fetchSourceBtn.innerText = oldText;
            }
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
                resultBody.innerHTML = `<tr><td colspan="${TABLE_COLSPAN}" class="text-center text-slate-500" style="padding: 4rem 1rem;">${emptyMsg}</td></tr>`;
                return;
            }
            actionBar.classList.remove('hidden');
            dataArray.forEach((item) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="text-center">
                        <input type="checkbox" class="ip-checkbox" data-ip="${item.ip}" data-region="${item.region || ''}" data-csvcolo="${item.csvColo || ''}" data-tag="${item.tag || ''}" data-ping="${item.ping}" data-speed="${item.speed}" data-trend="${item.trend || ''}">
                    </td>
                    <td><span class="region-badge">${item.region || '❓ 未知'}</span></td>
                    <td><div class="copyable-ip font-mono text-slate-800" data-ip="${item.ip}">${item.ip}</div></td>
                    <td class="text-center text-slate-500">${Number(item.ping).toFixed(1)}ms</td>
                    <td class="text-right ${getSpeedClass(item.speed)}">${Number(item.speed).toFixed(2)}</td>
                    <td class="text-center text-slate-500">${item.tag ? item.tag : '-'}</td>
                    <td class="text-center">${Number(item.healthScore || 0).toFixed(1)}</td>
                    <td class="text-center text-slate-500">${getTrendLabel(item.trend)}</td>
                    <td class="text-center text-slate-500">${formatCompare(item)}</td>
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
            exportCsvBtn.disabled = currentTableData.length === 0;
            exportJsonBtn.disabled = currentTableData.length === 0;
            saveSelectedBtn.disabled = !hasSelection;
            tagSelectedBtn.disabled = !hasSelection;
            deleteSelectedBtn.disabled = !hasSelection;
            selectAllCheckbox.checked = hasSelection && checkedCount === checkboxes.length;
            if (currentView === 'favorites') {
                startBtn.disabled = !hasSelection || isFavoriteTesting;
                startBtn.innerText = isFavoriteTesting ? '测速中...' : '测速选中';
            }
            stopBtn.disabled = !currentTaskId;
        }

        function getRowsForExport() {
            const selectedIps = new Set(Array.from(document.querySelectorAll('.ip-checkbox:checked')).map(cb => cb.dataset.ip));
            if (selectedIps.size === 0) return [...currentTableData];
            return currentTableData.filter(item => selectedIps.has(item.ip));
        }

        function downloadTextFile(filename, content) {
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        }

        selectAllCheckbox.addEventListener('change', (e) => {
            document.querySelectorAll('.ip-checkbox').forEach(cb => cb.checked = e.target.checked);
            updateSelectionState();
        });
        
        copySelectedBtn.addEventListener('click', () => {
            const selected = Array.from(document.querySelectorAll('.ip-checkbox:checked'));
            if (currentView === 'favorites') {
                const lines = selected.map((cb) => {
                    const ip = cb.dataset.ip || '';
                    const region = normalizeRegionForCopy(cb.dataset.csvcolo, cb.dataset.region);
                    const tag = String(cb.dataset.tag || '').trim() || '未标记';
                    return `${ip}#${region}|${tag}`;
                }).join('\n');
                copyToClipboard(lines, `✅ 成功复制 ${selected.length} 个节点`);
                return;
            }
            const ips = selected.map(cb => cb.dataset.ip).join('\n');
            copyToClipboard(ips, `✅ 成功复制 ${selected.length} 个 IP`);
        });
        exportCsvBtn.addEventListener('click', () => {
            const rows = getRowsForExport();
            if (rows.length === 0) return showToast('❌ 当前没有可导出结果');
            const head = 'ip,region,ping,speed,loss,tag,healthScore,trend,deltaSpeed,deltaPing';
            const body = rows.map((item) => {
                const fields = [
                    item.ip || '',
                    String(item.region || '').replace(/,/g, ' '),
                    Number.isFinite(Number(item.ping)) ? Number(item.ping).toFixed(1) : '',
                    Number.isFinite(Number(item.speed)) ? Number(item.speed).toFixed(2) : '',
                    Number.isFinite(Number(item.loss)) ? Number(item.loss).toFixed(2) : '',
                    String(item.tag || '').replace(/,/g, ' '),
                    Number.isFinite(Number(item.healthScore)) ? Number(item.healthScore).toFixed(1) : '',
                    item.trend || '',
                    Number.isFinite(Number(item.deltaSpeed)) ? Number(item.deltaSpeed).toFixed(2) : '',
                    Number.isFinite(Number(item.deltaPing)) ? Number(item.deltaPing).toFixed(1) : ''
                ];
                return fields.join(',');
            }).join('\n');
            downloadTextFile(`cfst_results_${Date.now()}.csv`, `${head}\n${body}`);
            showToast(`✅ 已导出 ${rows.length} 条 CSV`);
        });
        exportJsonBtn.addEventListener('click', () => {
            const rows = getRowsForExport();
            if (rows.length === 0) return showToast('❌ 当前没有可导出结果');
            downloadTextFile(`cfst_results_${Date.now()}.json`, JSON.stringify(rows, null, 2));
            showToast(`✅ 已导出 ${rows.length} 条 JSON`);
        });

        tagSelectedBtn.addEventListener('click', async () => {
            if (currentView !== 'favorites') return;
            const selected = Array.from(document.querySelectorAll('.ip-checkbox:checked'));
            if (selected.length === 0) return showToast('❌ 请先选择节点');
            const tag = prompt('请输入标签（留空则清除标签）', '');
            if (tag === null) return;
            const payload = selected.map((cb) => ({ ip: cb.dataset.ip, tag: String(tag).trim() }));
            try {
                const res = await fetch('/api/save-ips', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ips: payload })
                });
                const json = await res.json();
                if (json.success) {
                    showToast(`✅ 已为 ${selected.length} 个节点设置标签`);
                    fetchAndRenderFavorites();
                } else {
                    showToast('❌ 标签保存失败');
                }
            } catch (e) {
                showToast('❌ 标签保存失败');
            }
        });

        // 收藏夹相关 API
        async function fetchAndRenderFavorites() {
            resultBody.innerHTML = `<tr><td colspan="${TABLE_COLSPAN}" class="text-center" style="padding: 3rem;"><div class="spinner" style="margin: 0 auto;"></div></td></tr>`;
            try {
                const res = await fetch('/api/saved-ips'); const json = await res.json();
                if (json.success) {
                    const data = json.data || [];
                    if (data.length === 0) {
                        currentTableData = [];
                        renderTable([], '📭 收藏夹空空如也，快去测速页面收藏几个极速节点吧！');
                    } else {
                        const sorted = data.sort((a, b) => b.speed - a.speed);
                        currentTableData = sorted;
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

        async function runFavoritesSelectedTest() {
            if (isFavoriteTesting) return;
            const selectedIps = Array.from(document.querySelectorAll('.ip-checkbox:checked')).map(cb => cb.dataset.ip).filter(Boolean);
            if (selectedIps.length === 0) return showToast('❌ 请先选择要测速的 IP');
            const pickedIps = incrementalDownOnly.checked
                ? selectedIps.filter((ip) => {
                    const cb = document.querySelector(`.ip-checkbox[data-ip="${ip}"]`);
                    return cb && cb.dataset.trend === 'down';
                })
                : selectedIps;
            const targetIps = pickedIps.length > 0 ? pickedIps : selectedIps;
            isFavoriteTesting = true;
            updateSelectionState();
            const taskId = `task_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
            currentTaskId = taskId;
            stopBtn.disabled = false;
            const startedAt = Date.now();
            try {
                resetProgressUI();
                switchTab('test');
                statusPanel.classList.remove('hidden');
                statusTitle.innerText = '收藏测速';
                statusSub.innerText = `正在测速 ${targetIps.length} 个已收藏 IP...`;
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
                        targetIps: targetIps,
                        inputMode: 'ip',
                        taskId,
                        runtimeOptions: {
                            incremental: false,
                            incrementalDownOnly: incrementalDownOnly.checked,
                            parseTimeoutSec: Number(parseTimeoutInput.value || 25),
                            totalTimeoutSec: Number(totalTimeoutInput.value || 150),
                            performanceMode: 'manual',
                            profile: /mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
                        }
                    })
                });
                const json = await response.json();
                if (!json.success) {
                    const reason = diagnoseTestFailure(json.msg);
                    showToast(`❌ 测速失败: ${json.msg || '未知错误'}；${reason}`);
                    pushTaskHistory({
                        ts: Date.now(),
                        mode: '收藏测速',
                        targets: targetIps.length,
                        success: false,
                        msg: String(json.msg || '未知错误')
                    });
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
                    const failedCount = Math.max(0, targetIps.length - tested.length);
                    showToast(`✅ 已更新 ${saveJson.updated || 0} 个收藏${failedCount > 0 ? `，${failedCount} 个疑似不可用` : ''}`);
                    pushTaskHistory({
                        ts: Date.now(),
                        mode: '收藏测速',
                        targets: targetIps.length,
                        success: true,
                        count: tested.length,
                        durationSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000))
                    });
                    fetchAndRenderFavorites();
                } else {
                    showToast('❌ 测速结果回写失败');
                }
            } catch (e) {
                showToast('❌ 收藏测速失败');
            } finally {
                currentTaskId = '';
                isFavoriteTesting = false;
                updateSelectionState();
                setTimeout(() => closeProgressStream(), 800);
                stopProgressPolling();
            }
        }

        async function requestStopCurrentTask() {
            if (!currentTaskId) return showToast('❌ 当前没有运行中的任务');
            try {
                const res = await fetch('/api/stop-test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taskId: currentTaskId })
                });
                const json = await res.json();
                if (json.success && json.stopped) {
                    showToast('✅ 已停止当前测速任务');
                } else {
                    showToast('❌ 当前任务已结束');
                }
            } catch {
                showToast('❌ 停止任务失败');
            }
        }

        async function runLocalHealthCheck() {
            healthCheckBtn.disabled = true;
            const prevText = healthCheckBtn.innerText;
            healthCheckBtn.innerText = '检测中...';
            try {
                const res = await fetch('/api/local-health');
                const json = await res.json();
                if (!json.success || !json.data) {
                    showToast('❌ 环境巡检失败');
                    return;
                }
                const failed = (json.data.checks || []).filter((item) => !item.ok);
                if (failed.length === 0) {
                    showToast('✅ 环境巡检通过');
                } else {
                    const tip = failed.map((item) => item.name).slice(0, 2).join(' / ');
                    showToast(`⚠️ 巡检发现问题: ${tip}`);
                }
            } catch {
                showToast('❌ 环境巡检失败');
            } finally {
                healthCheckBtn.disabled = false;
                healthCheckBtn.innerText = prevText;
            }
        }
        stopBtn.addEventListener('click', requestStopCurrentTask);
        healthCheckBtn.addEventListener('click', runLocalHealthCheck);

        saveSelectedBtn.addEventListener('click', async () => {
            if (currentView === 'favorites') {
                await runFavoritesSelectedTest();
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
            if (currentView === 'favorites') {
                await runFavoritesSelectedTest();
                return;
            }
            startBtn.disabled = true; startBtn.innerText = '测速中...';
            resetProgressUI();
            const startedAt = Date.now();
            
            // 每次测速前重新读取文本框，防止用户手打内容忘了触发失去焦点
            extractAndUpdateInput(ipInput.value); 
            
            if (parsedTargets.length > 0) { statusTitle.innerText = '解析目标'; statusSub.innerText = '正在并发解析真实 IP...'; }
            else { statusTitle.innerText = '准备测速'; statusSub.innerText = '正在测试默认节点库...'; }
            
            statusPanel.classList.remove('hidden'); actionBar.classList.add('hidden'); resultBody.innerHTML = '';

            try {
                const taskId = `task_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
                currentTaskId = taskId;
                stopBtn.disabled = false;
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
                            incrementalDownOnly: incrementalMode.checked && incrementalDownOnly.checked,
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
                    pushTaskHistory({
                        ts: Date.now(),
                        mode: '测速大厅',
                        targets: parsedTargets.length,
                        success: true,
                        count: json.data.length,
                        durationSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000))
                    });
                    statusPanel.classList.remove('hidden'); loadingSpinner.style.display = 'none';
                    progressFill.style.width = '100%';
                    progressLabel.innerText = '100%';
                    statusTitle.innerText = '完成';
                    statusSub.innerText = `测速完毕：${json.data.length} 个节点`;
                    statusTag.innerText = 'DONE';
                    statusDots.style.display = 'none';
                    setStatusVisualState('done', 'done');
                    stopProgressPolling();
                } else {
                    const reason = diagnoseTestFailure(json.msg);
                    showToast(`测速失败: ${json.msg}；${reason}`);
                    pushTaskHistory({
                        ts: Date.now(),
                        mode: '测速大厅',
                        targets: parsedTargets.length,
                        success: false,
                        msg: String(json.msg || '未知错误')
                    });
                    statusPanel.classList.add('hidden');
                }
            } catch (error) {
                showToast('网络请求失败！请检查后端');
                pushTaskHistory({
                    ts: Date.now(),
                    mode: '测速大厅',
                    targets: parsedTargets.length,
                    success: false,
                    msg: '网络请求失败'
                });
                statusPanel.classList.add('hidden');
            } 
            finally {
                currentTaskId = '';
                stopBtn.disabled = true;
                setTimeout(() => closeProgressStream(), 800);
                stopProgressPolling();
                startBtn.disabled = false; startBtn.innerText = '重新测速';
            }
        });

        loadTheme();
        renderProfileOptions();
        loadCfstConfig();
        loadLocalRuntimeSettings();
        renderTaskHistory();
        renderTable(currentTableData, '准备就绪，点击底部按钮开始测速');
