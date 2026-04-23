const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const crypto = require('crypto');

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3088;
const MAX_PORT_RETRY = 20;

app.use(express.json());
app.use(cors());
app.use(express.static('public'));
const upload = multer({ storage: multer.memoryStorage() });

const progressClients = new Map();
const lastProgress = new Map();
const taskPhase = new Map();
const lastProgressKey = new Map();
const coloCache = new Map();
const runningTasks = new Map();
const MIN_NODE_MAJOR = 18;

function logTask(taskId, step, extra) {
    const now = new Date().toISOString();
    if (typeof extra === 'undefined') {
        console.log(`[TRACE][${now}][${taskId}] ${step}`);
        return;
    }
    let payload = '';
    try { payload = JSON.stringify(extra); } catch { payload = String(extra); }
    console.log(`[TRACE][${now}][${taskId}] ${step} ${payload}`);
}

function normalizeProgress(taskId, payload) {
    const knownPhase = taskPhase.get(taskId);
    const phase = payload.phase || knownPhase || '测速中';
    taskPhase.set(taskId, phase);

    const out = { ...payload, phase };
    if (typeof out.current === 'number' && typeof out.total === 'number' && out.total > 0) {
        if (typeof out.percent !== 'number') {
            const ratio = Math.min(1, Math.max(0, out.current / out.total));
            if (phase === 'Ping 测试') out.percent = Math.round(ratio * 70);
            else if (phase === '下载测速') out.percent = 70 + Math.round(ratio * 30);
            else out.percent = Math.round(ratio * 100);
        }
    }
    if (typeof out.percent === 'number') out.percent = Math.min(100, Math.max(0, out.percent));
    if (typeof out.message === 'string') {
        out.message = out.message.replace(/\s{2,}/g, ' ').trim();
        if (out.message.length > 120) out.message = out.message.slice(0, 120) + '...';
    }
    return out;
}

function sendProgress(taskId, payload) {
    const normalized = normalizeProgress(taskId, payload);
    const key = `${normalized.state || ''}|${normalized.phase || ''}|${normalized.current ?? ''}/${normalized.total ?? ''}|${normalized.percent ?? ''}|${normalized.message || ''}`;
    if (lastProgressKey.get(taskId) === key) return;
    lastProgressKey.set(taskId, key);
    lastProgress.set(taskId, normalized);
    const clients = progressClients.get(taskId);
    if (!clients) return;
    const message = `data: ${JSON.stringify(normalized)}\n\n`;
    const deadClients = [];
    clients.forEach((res) => {
        try {
            if (res.writableEnded || res.destroyed) {
                deadClients.push(res);
                return;
            }
            res.write(message);
        } catch (e) {
            deadClients.push(res);
            console.warn('[SSE] write failed:', e && e.message ? e.message : e);
        }
    });
    if (deadClients.length > 0) {
        deadClients.forEach((res) => clients.delete(res));
        if (clients.size === 0) progressClients.delete(taskId);
    }
}

function closeProgress(taskId, keepMs = 15000) {
    setTimeout(() => {
        const clients = progressClients.get(taskId);
        if (clients) {
            clients.forEach((res) => res.end());
            progressClients.delete(taskId);
        }
        lastProgress.delete(taskId);
        taskPhase.delete(taskId);
        lastProgressKey.delete(taskId);
    }, keepMs);
}

function detachRunningTask(taskId) {
    runningTasks.delete(taskId);
}

function parseProgressLine(line) {
    let cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');
    cleanLine = cleanLine.replace(/[\r\n]+/g, ' ').trim();
    if (!cleanLine) return null;
    if (cleanLine === '[' || cleanLine === ']' || cleanLine === '[]') return null;
    if (/^[-=\s]{8,}\]?$/.test(cleanLine)) return null;
    if (/^\[[\s\-=]+\]$/.test(cleanLine)) return null;
    cleanLine = cleanLine.replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
    if (!cleanLine) return null;
    if (cleanLine.length > 160) cleanLine = cleanLine.slice(0, 160) + '...';

    const ratioMatch = cleanLine.match(/(\d+)\s*\/\s*(\d+)/);
    const lower = cleanLine.toLowerCase();
    let phase = '测速中';
    if (lower.includes('ping')) phase = 'Ping 测试';
    else if (lower.includes('download') || cleanLine.includes('下载')) phase = '下载测速';
    else if (lower.includes('ip')) phase = '目标扫描';

    const payload = { state: 'running', phase, message: cleanLine };
    if (ratioMatch) {
        const current = Number(ratioMatch[1]);
        const total = Number(ratioMatch[2]);
        if (total > 0) {
            payload.current = current;
            payload.total = total;
        }
    }
    return payload;
}

function isPrivateIPv4(hostname) {
    const m = String(hostname || '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
}

app.get('/api/progress/:taskId', (req, res) => {
    const taskId = req.params.taskId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clients = progressClients.get(taskId) || new Set();
    clients.add(res);
    progressClients.set(taskId, clients);

    const cached = lastProgress.get(taskId);
    try {
        if (cached) res.write(`data: ${JSON.stringify(cached)}\n\n`);
        else res.write(`data: ${JSON.stringify({ state: 'waiting', phase: '等待任务', message: '等待测速任务启动...' })}\n\n`);
    } catch (e) {}

    req.on('close', () => {
        const current = progressClients.get(taskId);
        if (!current) return;
        current.delete(res);
        if (current.size === 0) progressClients.delete(taskId);
    });
});

app.get('/api/progress-state/:taskId', (req, res) => {
    const taskId = req.params.taskId;
    const payload = lastProgress.get(taskId) || { state: 'waiting', phase: '等待任务', message: '等待测速任务启动...' };
    res.json({ success: true, data: payload });
});

app.post('/api/stop-test', async (req, res) => {
    const taskId = String(req.body?.taskId || '').trim();
    if (!taskId) return res.status(400).json({ success: false, msg: 'taskId 不能为空' });
    const task = runningTasks.get(taskId);
    if (!task) return res.json({ success: true, stopped: false, msg: '任务不存在或已结束' });
    try {
        if (task.watchdog) clearTimeout(task.watchdog);
        task.stoppedByUser = true;
        try { task.child.kill('SIGKILL'); } catch {}
        sendProgress(taskId, { state: 'error', phase: '用户中止', message: '任务已手动停止' });
        closeProgress(taskId);
        detachRunningTask(taskId);
        return res.json({ success: true, stopped: true });
    } catch {
        return res.status(500).json({ success: false, msg: '停止任务失败' });
    }
});

app.post('/api/fetch-source', async (req, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    if (!rawUrl) return res.status(400).json({ success: false, msg: 'URL 不能为空' });
    if (rawUrl.length > 500) return res.status(400).json({ success: false, msg: 'URL 过长' });

    let parsed;
    try { parsed = new URL(rawUrl); } catch { return res.status(400).json({ success: false, msg: 'URL 格式不合法' }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ success: false, msg: '仅支持 http/https' });
    
    const host = String(parsed.hostname || '').toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local') || isPrivateIPv4(host)) {
        return res.status(400).json({ success: false, msg: '不允许拉取内网地址' });
    }

    try {
        const response = await fetch(parsed.toString(), {
            method: 'GET',
            headers: { 'User-Agent': 'cfst-web-panel/1.0' },
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) return res.status(400).json({ success: false, msg: `上游响应异常: ${response.status}` });
        const text = await response.text();
        const capped = String(text || '').slice(0, 2 * 1024 * 1024);
        return res.json({ success: true, data: capped });
    } catch (e) {
        return res.status(500).json({ success: false, msg: '拉取源地址失败' });
    }
});

// --- JSON 数据库与 CF API ---
const DB_FILE = path.join(__dirname, 'database.json');
const LEGACY_JSON_FILE = path.join(__dirname, 'saved_ips.json');
let dbData = { saved_ips: [], settings: {}, test_history: {}, last_targets: [] };
let dbSaveQueue = Promise.resolve();

function ensureLocalRuntimeReady() {
    const major = Number(String(process.versions.node || '').split('.')[0] || 0);
    if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) throw new Error(`Node.js 版本需 >= ${MIN_NODE_MAJOR}`);
    const cfstPath = path.join(__dirname, 'cfst');
    if (!fs.existsSync(cfstPath)) throw new Error('缺少 cfst 可执行文件');
    try { fs.accessSync(cfstPath, fs.constants.X_OK); } catch { throw new Error('cfst 未设置可执行权限'); }
}

async function initDb() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = await fs.promises.readFile(DB_FILE, 'utf-8');
            dbData = JSON.parse(raw);
            if (!dbData.saved_ips) dbData.saved_ips = [];
            if (!dbData.settings) dbData.settings = {};
            if (!dbData.test_history) dbData.test_history = {};
            if (!Array.isArray(dbData.last_targets)) dbData.last_targets = [];
        } else {
            await fs.promises.writeFile(DB_FILE, JSON.stringify(dbData, null, 2));
        }
    } catch (e) { console.error('DB init failed:', e); }
}

async function saveDb() {
    dbSaveQueue = dbSaveQueue.catch(() => {}).then(async () => {
        const tmpFile = `${DB_FILE}.tmp`;
        await fs.promises.writeFile(tmpFile, JSON.stringify(dbData, null, 2));
        await fs.promises.rename(tmpFile, DB_FILE);
    }).catch(e => console.error('DB save failed:', e));
    await dbSaveQueue;
}

async function getSetting(key) { return dbData.settings[key] || null; }
async function setSetting(key, value) { dbData.settings[key] = value; await saveDb(); }

async function requestCF(path, method, body) {
    const raw = await getSetting('cf_api');
    if (!raw) throw new Error('未配置 CF 信息');
    const { token, email } = JSON.parse(raw);
    const headers = { 'Content-Type': 'application/json' };
    if (email) {
        headers['X-Auth-Email'] = email;
        headers['X-Auth-Key'] = token;
    } else {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
        method, headers, body: body ? JSON.stringify(body) : undefined
    });
    return await res.json();
}

app.get('/api/settings/cf', async (req, res) => {
    try {
        const raw = await getSetting('cf_api');
        res.json({ success: true, data: raw ? JSON.parse(raw) : {} });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/settings/cf', async (req, res) => {
    try {
        await setSetting('cf_api', JSON.stringify(req.body));
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.get('/api/cf/dns', async (req, res) => {
    try {
        const raw = await getSetting('cf_api');
        const { zoneId, domain } = raw ? JSON.parse(raw) : {};
        if (!zoneId || !domain) return res.json({ success: false, msg: '未配置 Zone ID 或域名' });
        
        const data = await requestCF(`/zones/${zoneId}/dns_records?type=A&name=${domain}`, 'GET');
        res.json({ success: data.success, data: data.result, msg: data.errors?.[0]?.message });
    } catch (e) { res.status(500).json({ success: false, msg: 'CF API 请求失败' }); }
});

app.post('/api/cf/dns/sync', async (req, res) => {
    try {
        const { ips, clearOnly } = req.body;
        const raw = await getSetting('cf_api');
        const { zoneId, domain } = raw ? JSON.parse(raw) : {};
        if (!zoneId || !domain) return res.json({ success: false, msg: '未配置 CF 信息' });

        const curr = await requestCF(`/zones/${zoneId}/dns_records?type=A&name=${domain}`, 'GET');
        if (curr.success && curr.result) {
            for (const record of curr.result) {
                await requestCF(`/zones/${zoneId}/dns_records/${record.id}`, 'DELETE');
            }
        }
        
        if (clearOnly) return res.json({ success: true, msg: '已清空解析' });

        let added = 0;
        for (const ip of ips) {
            const addRes = await requestCF(`/zones/${zoneId}/dns_records`, 'POST', {
                type: 'A', name: domain, content: ip, proxied: false, ttl: 60
            });
            if (addRes.success) added++;
        }
        res.json({ success: true, added });
    } catch (e) { res.status(500).json({ success: false, msg: '同步解析失败' }); }
});

function getOfficialRecommendedCfstConfig() {
    return {
        n: 200, t: 4, tp: 443, url: 'https://speed.cloudflare.com/__down?bytes=20000000',
        mode: 'tcp', httpingCode: 200, cfcolo: '', dt: 5, dn: 10, dnSingle: 1,
        tl: 9999, tll: 0, tlr: 1, sl: 0, disableDownload: false, allip: false,
        debug: false, topN: 50
    };
}

async function getCfstConfig() {
    const defaults = getOfficialRecommendedCfstConfig();
    const raw = await getSetting('cfst_config');
    if (!raw) return defaults;
    try {
        const parsed = JSON.parse(raw);
        const mode = parsed.mode === 'http' ? 'http' : 'tcp';
        return {
            n: Number.isFinite(Number(parsed.n)) ? Math.max(1, Math.min(1000, Number(parsed.n))) : defaults.n,
            t: Number.isFinite(Number(parsed.t)) ? Math.max(1, Math.min(20, Number(parsed.t))) : defaults.t,
            tp: Number.isFinite(Number(parsed.tp)) ? Math.max(1, Math.min(65535, Number(parsed.tp))) : defaults.tp,
            url: typeof parsed.url === 'string' && parsed.url.trim() ? parsed.url.trim() : defaults.url,
            mode,
            httpingCode: Number.isFinite(Number(parsed.httpingCode)) ? Math.max(100, Math.min(599, Number(parsed.httpingCode))) : defaults.httpingCode,
            cfcolo: typeof parsed.cfcolo === 'string' ? parsed.cfcolo.trim() : '',
            dt: Number.isFinite(Number(parsed.dt)) ? Math.max(1, Math.min(30, Number(parsed.dt))) : defaults.dt,
            dn: Number.isFinite(Number(parsed.dn)) ? Math.max(1, Math.min(50, Number(parsed.dn))) : defaults.dn,
            dnSingle: Number.isFinite(Number(parsed.dnSingle)) ? Math.max(1, Math.min(10, Number(parsed.dnSingle))) : defaults.dnSingle,
            tl: Number.isFinite(Number(parsed.tl)) ? Math.max(0, Math.min(9999, Number(parsed.tl))) : defaults.tl,
            tll: Number.isFinite(Number(parsed.tll)) ? Math.max(0, Math.min(9999, Number(parsed.tll))) : defaults.tll,
            tlr: Number.isFinite(Number(parsed.tlr)) ? Math.max(0, Math.min(1, Number(parsed.tlr))) : defaults.tlr,
            sl: Number.isFinite(Number(parsed.sl)) ? Math.max(0, Math.min(9999, Number(parsed.sl))) : defaults.sl,
            disableDownload: Boolean(parsed.disableDownload),
            allip: Boolean(parsed.allip),
            debug: Boolean(parsed.debug),
            topN: Number.isFinite(Number(parsed.topN)) ? Math.max(1, Math.min(200, Number(parsed.topN))) : defaults.topN
        };
    } catch { return defaults; }
}

async function migrateLegacySavedIpsIfNeeded() {
    if (!fs.existsSync(LEGACY_JSON_FILE) || dbData.saved_ips.length > 0) return;
    try {
        const raw = fs.readFileSync(LEGACY_JSON_FILE, 'utf-8');
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
            for (const item of items) {
                if (item?.ip && !dbData.saved_ips.find(s => s.ip === item.ip)) {
                    dbData.saved_ips.push({ ...item, created_at: Date.now(), tag: item.tag || '' });
                }
            }
            await saveDb();
        }
    } catch {}
}

function computeDelta(ip, ping, speed) {
    const hist = dbData.test_history[ip] || [];
    if (hist.length === 0) return { deltaSpeed: null, deltaPing: null };
    const last = hist[hist.length - 1];
    return {
        deltaSpeed: last.speed === null || speed === null ? null : Number((speed - last.speed).toFixed(2)),
        deltaPing: last.ping === null || ping === null ? null : Number((ping - last.ping).toFixed(1))
    };
}

app.get('/api/saved-ips', async (req, res) => {
    try {
        const rows = [...dbData.saved_ips].map(item => ({
            ...item, ...computeDelta(item.ip, item.ping, item.speed)
        })).sort((a, b) => b.created_at - a.created_at);
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/save-ips', async (req, res) => {
    const newIps = Array.isArray(req.body.ips) ? req.body.ips : [];
    let added = 0, updated = 0;
    try {
        for (const item of newIps) {
            if (!item?.ip) continue;
            const ip = String(item.ip).trim();
            const existingIdx = dbData.saved_ips.findIndex(s => s.ip === ip);
            if (existingIdx === -1) {
                dbData.saved_ips.push({ ip, ...item, tag: item.tag || '', created_at: Date.now() });
                added++;
            } else {
                dbData.saved_ips[existingIdx] = { ...dbData.saved_ips[existingIdx], ...item, updated_at: Date.now() };
                updated++;
            }
        }
        if (added > 0 || updated > 0) await saveDb();
        res.json({ success: true, added, updated });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/delete-ips', async (req, res) => {
    const ips = Array.isArray(req.body.ips) ? req.body.ips : [];
    if (ips.length > 0) {
        dbData.saved_ips = dbData.saved_ips.filter(item => !ips.includes(item.ip));
        await saveDb();
    }
    res.json({ success: true });
});

app.get('/api/settings/cfst', async (req, res) => { res.json({ success: true, data: await getCfstConfig() }); });
app.post('/api/settings/cfst', async (req, res) => { await setSetting('cfst_config', JSON.stringify(req.body)); res.json({ success: true, data: await getCfstConfig() }); });
app.post('/api/settings/cfst/reset', async (req, res) => { await setSetting('cfst_config', JSON.stringify(getOfficialRecommendedCfstConfig())); res.json({ success: true, data: await getCfstConfig() }); });

app.post('/api/regions', async (req, res) => {
    const ips = Array.isArray(req.body?.ips) ? req.body.ips : [];
    const data = {};
    await mapWithConcurrency(ips, 5, async (ip) => { data[ip] = await getColoCached(ip); });
    res.json({ success: true, data });
});

const cfColoMap = {
    'HKG': '🇭🇰 香港', 'TPE': '🇹🇼 台北', 'NRT': '🇯🇵 东京', 'KIX': '🇯🇵 大阪',
    'SGP': '🇸🇬 新加坡', 'ICN': '🇰🇷 首尔', 'LAX': '🇺🇸 洛杉矶', 'SJC': '🇺🇸 圣何塞',
    'SEA': '🇺🇸 西雅图', 'FRA': '🇩🇪 法兰克福', 'LHR': '🇬🇧 伦敦', 'SYD': '🇦🇺 悉尼',
    'CDG': '🇫🇷 巴黎', 'AMS': '🇳🇱 阿姆斯特丹', 'YYZ': '🇨🇦 多伦多', 'KUL': '🇲🇾 吉隆坡',
    'BKK': '🇹🇭 曼谷', 'MNL': '🇵🇭 马尼拉', 'CGK': '🇮🇩 雅加达', 'BOM': '🇮🇳 孟买'
};

function getColo(ip) {
    return new Promise((resolve) => {
        const probes = [ { mod: http, url: `http://${ip}/cdn-cgi/trace`, timeout: 1800 }, { mod: https, url: `https://${ip}/cdn-cgi/trace`, timeout: 2200 } ];
        let idx = 0;
        const runProbe = () => {
            if (idx >= probes.length) return resolve('❓ 测速节点');
            const current = probes[idx++];
            const req = current.mod.get(current.url, { timeout: current.timeout, rejectUnauthorized: false }, (res) => {
                let data = ''; res.on('data', (c) => data += c);
                res.on('end', () => {
                    const match = data.match(/colo=([A-Z]+)/);
                    if (match && match[1]) resolve(cfColoMap[match[1]] || `🌐 ${match[1]}`); else runProbe();
                });
            });
            req.on('error', () => runProbe());
            req.on('timeout', () => { try { req.destroy(); } catch {} runProbe(); });
        };
        runProbe();
    });
}

async function getColoCached(ip) {
    const key = String(ip || '').trim();
    if (!key) return '❓ 未知';
    const cache = coloCache.get(key);
    const now = Date.now();
    if (cache && cache.expireAt > now) return cache.region;
    const region = await getColo(key);
    coloCache.set(key, { region, expireAt: now + (region.includes('超时') ? 90000 : 1800000) });
    return region;
}

async function mapWithConcurrency(items, limit, mapper) {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(limit, queue.length) }).map(async () => {
        while (queue.length > 0) { const item = queue.shift(); if (item) await mapper(item); }
    });
    await Promise.all(workers);
}

function clamp(num, min, max) { return Math.max(min, Math.min(max, num)); }
function withTimeout(prom, ms, msg) { let t; return Promise.race([prom, new Promise((_, r) => t = setTimeout(() => r(new Error(msg)), ms))]).finally(() => clearTimeout(t)); }

async function saveHistory(items) {
    const now = Date.now();
    items.forEach(item => {
        if (!item?.ip) return;
        if (!dbData.test_history[item.ip]) dbData.test_history[item.ip] = [];
        dbData.test_history[item.ip].push({ ts: now, ping: item.ping, speed: item.speed, loss: item.loss });
        if (dbData.test_history[item.ip].length > 20) dbData.test_history[item.ip] = dbData.test_history[item.ip].slice(-20);
    });
    await saveDb();
}

function getAdaptiveConfig(base, opts, count) {
    const cfg = { ...base };
    if (opts.profile?.includes('mobile') || opts.performanceMode === 'mobile') {
        cfg.n = clamp(Math.round(cfg.n * 0.35), 24, 96);
        cfg.t = clamp(Math.round(cfg.t * 0.6), 1, 3);
        cfg.dt = clamp(Math.round(cfg.dt * 0.6), 1, 3);
        cfg.dn = clamp(Math.round(cfg.dn * 0.5), 1, 5);
        cfg.topN = clamp(Math.round(cfg.topN * 0.5), 8, 25);
    }
    if (count > 0 && count <= 3) cfg.dn = 1;
    return cfg;
}

const cfGlobalDnsServers = [ ['8.8.8.8', '8.8.4.4'], ['1.1.1.1', '1.0.0.1'], ['208.67.222.222', '208.67.220.220'] ];
async function resolveTargets(targets) {
    const finalIps = new Set();
    const domains = targets.filter(t => !/^(\d{1,3}\.){3}\d{1,3}$/.test(t));
    targets.filter(t => /^(\d{1,3}\.){3}\d{1,3}$/.test(t)).forEach(ip => finalIps.add(ip));

    if (domains.length > 0) {
        const jobs = [];
        domains.slice(0, 120).forEach(domain => cfGlobalDnsServers.forEach(servers => jobs.push({ domain, servers })));
        await mapWithConcurrency(jobs, 16, async ({ domain, servers }) => {
            const resolver = new dns.Resolver(); resolver.setServers(servers);
            try { (await withTimeout(resolver.resolve4(domain), 2500, '')).forEach(ip => finalIps.add(ip)); } catch {}
        });
    }
    return Array.from(finalIps);
}

app.post('/api/start-test', upload.single('csvFile'), async (req, res) => {
    req.setTimeout(300000);
    const taskId = req.body?.taskId || crypto.randomUUID();
    const inputMode = req.body?.inputMode || 'ip';
    const opts = req.body?.runtimeOptions || {};
    sendProgress(taskId, { state: 'start', phase: '准备中', message: '测速任务初始化中...' });

    let rawTargets = req.file ? [...new Set(req.file.buffer.toString().match(/(?:\d{1,3}\.){3}\d{1,3}|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/g) || [])] : (req.body.targetIps || []);
    if (typeof rawTargets === 'string') { try { rawTargets = JSON.parse(rawTargets); } catch {} }
    rawTargets = rawTargets.map(s => String(s).trim()).filter(Boolean);

    const baseConfig = await getCfstConfig();
    const cfstConfig = getAdaptiveConfig(baseConfig, opts, rawTargets.length);
    const args = ['-n', String(cfstConfig.n), '-t', String(cfstConfig.t), '-tp', String(cfstConfig.tp), '-tl', String(cfstConfig.tl), '-tll', String(cfstConfig.tll), '-tlr', String(cfstConfig.tlr), '-sl', String(cfstConfig.sl)];
    if (cfstConfig.mode === 'http') { args.push('-httping', '-httping-code', String(cfstConfig.httpingCode)); if (cfstConfig.cfcolo) args.push('-cfcolo', cfstConfig.cfcolo); }
    if (cfstConfig.disableDownload) args.push('-dd');
    if (cfstConfig.allip) args.push('-allip');
    if (cfstConfig.debug) args.push('-debug');

    let inputIps = null;
    if (rawTargets.length > 0) {
        sendProgress(taskId, { state: 'running', phase: '解析目标', message: `解析 ${rawTargets.length} 个目标...` });
        let resolvedIps = await resolveTargets(rawTargets);
        if (!resolvedIps.length) {
            sendProgress(taskId, { state: 'error', phase: '解析失败', message: '未解析出有效 IPv4' });
            closeProgress(taskId); return res.json({ success: false, msg: '未解析出有效 IPv4' });
        }
        let finalIps = [...new Set(resolvedIps)];
        if (opts.incrementalDownOnly) finalIps = finalIps.filter(ip => dbData.test_history[ip]?.length >= 2 && dbData.test_history[ip][dbData.test_history[ip].length-1].speed < dbData.test_history[ip][dbData.test_history[ip].length-2].speed - 3) || finalIps;
        inputIps = new Set(finalIps);
        args.push('-ip', finalIps.join(','), '-url', cfstConfig.url, '-dt', String(cfstConfig.dt), '-dn', String(finalIps.length <= 1 ? cfstConfig.dnSingle : cfstConfig.dn));
    } else {
        args.push('-url', cfstConfig.url, '-dt', String(cfstConfig.dt), '-dn', String(cfstConfig.dn));
    }

    let replied = false;
    const finish = (code, msg, phase, data = null) => {
        if (replied) return; replied = true;
        sendProgress(taskId, { state: data ? 'done' : 'error', phase, message: msg, percent: 100 });
        closeProgress(taskId);
        res.status(code).json({ success: !!data, msg, data });
    };

    const child = spawn('./cfst', args, { cwd: __dirname });
    const watchdog = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} finish(500, '测速超时', '执行超时'); }, clamp(opts.totalTimeoutSec || 150, 20, 600) * 1000);
    runningTasks.set(taskId, { child, watchdog });

    let stdoutBuffer = '';
    child.stdout.on('data', c => { stdoutBuffer += c; const lines = stdoutBuffer.split(/\r?\n/); stdoutBuffer = lines.pop() || ''; lines.forEach(l => { const p = parseProgressLine(l); if (p) sendProgress(taskId, p); }); });
    child.stderr.on('data', c => { c.toString().split(/\r?\n/).forEach(l => { const p = parseProgressLine(l); if (p) sendProgress(taskId, p); else if (l.match(/error|fail|失败/i)) sendProgress(taskId, { state: 'running', phase: '引擎错误', message: l }); }); });
    
    child.on('error', () => { clearTimeout(watchdog); detachRunningTask(taskId); finish(500, '引擎执行失败', '执行失败'); });
    child.on('close', async (code) => {
        clearTimeout(watchdog);
        if (runningTasks.get(taskId)?.stoppedByUser) return finish(499, '已停止', '用户中止');
        detachRunningTask(taskId);
        if (replied) return;
        if (code !== 0) return finish(500, `引擎异常退出(${code})`, '执行失败');

        const csvPath = path.join(__dirname, 'result.csv');
        if (!fs.existsSync(csvPath)) return finish(500, '未找到结果文件', '解析失败');
        
        sendProgress(taskId, { state: 'running', phase: '结果解析', message: '正在解析...' });
        const results = fs.readFileSync(csvPath, 'utf-8').trim().split('\n').slice(1).map(l => {
            const v = l.split(','); return { ip: v[0], loss: parseFloat(v[3]), ping: parseFloat(v[4]), speed: parseFloat(v[5]), csvColo: v[6]?.replace('\r','').trim() };
        }).filter(r => !inputIps || inputIps.has(r.ip));
        
        if (cfstConfig.disableDownload) results.sort((a,b) => (a.ping||999) - (b.ping||999)); else results.sort((a,b) => (b.speed||-1) - (a.speed||-1));
        
        const top = results.slice(0, cfstConfig.topN).map(item => ({ ...item, ...computeDelta(item.ip, item.ping, item.speed) }));
        
        const pending = [];
        top.forEach(i => { if (i.csvColo && i.csvColo !== '0.00' && i.csvColo !== 'N/A') i.region = cfColoMap[i.csvColo] || `🌐 ${i.csvColo}`; else { i.region = '⏳'; pending.push(i.ip); } });
        if (pending.length) mapWithConcurrency([...new Set(pending)], 4, async ip => await getColoCached(ip)).catch(()=>{});
        
        await saveHistory(top);
        finish(200, `完成，${top.length}个节点`, '完成', top);
    });
});

process.on('uncaughtException', err => console.error('🔥 uncaughtException:', err));
process.on('unhandledRejection', err => console.error('🔥 unhandledRejection:', err));

(async () => {
    try {
        ensureLocalRuntimeReady();
        await initDb();
        await migrateLegacySavedIpsIfNeeded();
        const server = app.listen(DEFAULT_PORT, () => {
            console.log(`\n🎉 测速中心已启动: http://localhost:${server.address().port}\n`);
        });
        server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                app.listen(DEFAULT_PORT + 1, () => console.log(`\n🎉 测速中心已启动: http://localhost:${DEFAULT_PORT + 1}\n`));
            }
        });
    } catch (e) {
        console.error('启动失败:', e.message); process.exit(1);
    }
})();