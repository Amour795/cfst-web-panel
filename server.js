const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const dns = require('dns').promises;
const crypto = require('crypto');


const app = express();
const PORT = 3088; 

// 📦 核心更新 1：引入 JSON 解析中间件（为了接收前端的收藏数据）
app.use(express.json());
app.use(cors());
app.use(express.static('public'));
const upload = multer({ storage: multer.memoryStorage() });

const progressClients = new Map();
const lastProgress = new Map();
const taskPhase = new Map();
const lastProgressKey = new Map();
const coloCache = new Map();
let scheduleTimer = null;

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
    } catch (e) {
        console.warn('[SSE] initial write failed:', e && e.message ? e.message : e);
    }

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

// --- 💾 数据库配置：JSON 持久化存储 ---
const DB_FILE = path.join(__dirname, 'database.json');
const LEGACY_JSON_FILE = path.join(__dirname, 'saved_ips.json');
let dbData = { saved_ips: [], settings: {}, test_history: {}, last_targets: [] };

async function initDb() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = await fs.promises.readFile(DB_FILE, 'utf-8');
            dbData = JSON.parse(raw);
            if (!dbData.saved_ips) dbData.saved_ips = [];
            if (!dbData.settings) dbData.settings = {};
            if (!dbData.test_history || typeof dbData.test_history !== 'object') dbData.test_history = {};
            if (!Array.isArray(dbData.last_targets)) dbData.last_targets = [];
            dbData.saved_ips = dbData.saved_ips.map((item) => ({
                ...item,
                tag: typeof item.tag === 'string' ? item.tag : ''
            }));
        } else {
            await fs.promises.writeFile(DB_FILE, JSON.stringify(dbData, null, 2));
        }
    } catch (e) {
        console.error('数据库初始化失败:', e);
    }
}

async function saveDb() {
    try {
        await fs.promises.writeFile(DB_FILE, JSON.stringify(dbData, null, 2));
    } catch (e) {
        console.error('数据库保存失败:', e);
    }
}

async function getSetting(key) {
    return dbData.settings[key] || null;
}

async function setSetting(key, value) {
    dbData.settings[key] = value;
    await saveDb();
}

async function getCfstConfig() {
    const defaults = {
        n: 200, t: 4, tp: 443, url: 'https://speed.cloudflare.com/__down?bytes=20000000',
        mode: 'tcp', httpingCode: 200, cfcolo: '', dt: 5, dn: 10, dnSingle: 1,
        tl: 9999, tll: 0, tlr: 1, sl: 0, disableDownload: false, allip: false,
        debug: false, topN: 50
    };
    const raw = await getSetting('cfst_config');
    if (!raw) return defaults;
    try {
        const parsed = JSON.parse(raw);
        const mode = parsed.mode === 'http' ? 'http' : 'tcp';
        const cfcolo = typeof parsed.cfcolo === 'string' ? parsed.cfcolo.trim() : '';
        const cfcoloNormalized = cfcolo && /^[A-Za-z]{2,5}(,[A-Za-z]{2,5})*$/.test(cfcolo) ? cfcolo : '';
        const tlr = Number(parsed.tlr);
        return {
            n: Number.isFinite(Number(parsed.n)) ? Math.max(1, Math.min(1000, Number(parsed.n))) : defaults.n,
            t: Number.isFinite(Number(parsed.t)) ? Math.max(1, Math.min(20, Number(parsed.t))) : defaults.t,
            tp: Number.isFinite(Number(parsed.tp)) ? Math.max(1, Math.min(65535, Number(parsed.tp))) : defaults.tp,
            url: typeof parsed.url === 'string' && parsed.url.trim() ? parsed.url.trim() : defaults.url,
            mode,
            httpingCode: Number.isFinite(Number(parsed.httpingCode)) ? Math.max(100, Math.min(599, Number(parsed.httpingCode))) : defaults.httpingCode,
            cfcolo: cfcoloNormalized,
            dt: Number.isFinite(Number(parsed.dt)) ? Math.max(1, Math.min(30, Number(parsed.dt))) : defaults.dt,
            dn: Number.isFinite(Number(parsed.dn)) ? Math.max(1, Math.min(50, Number(parsed.dn))) : defaults.dn,
            dnSingle: Number.isFinite(Number(parsed.dnSingle)) ? Math.max(1, Math.min(10, Number(parsed.dnSingle))) : defaults.dnSingle,
            tl: Number.isFinite(Number(parsed.tl)) ? Math.max(0, Math.min(9999, Number(parsed.tl))) : defaults.tl,
            tll: Number.isFinite(Number(parsed.tll)) ? Math.max(0, Math.min(9999, Number(parsed.tll))) : defaults.tll,
            tlr: Number.isFinite(tlr) ? Math.max(0, Math.min(1, tlr)) : defaults.tlr,
            sl: Number.isFinite(Number(parsed.sl)) ? Math.max(0, Math.min(9999, Number(parsed.sl))) : defaults.sl,
            disableDownload: Boolean(parsed.disableDownload),
            allip: Boolean(parsed.allip),
            debug: Boolean(parsed.debug),
            topN: Number.isFinite(Number(parsed.topN)) ? Math.max(1, Math.min(200, Number(parsed.topN))) : defaults.topN
        };
    } catch {
        return defaults;
    }
}

async function migrateLegacySavedIpsIfNeeded() {
    if (!fs.existsSync(LEGACY_JSON_FILE)) return;
    if (dbData.saved_ips.length > 0) return;

    let raw = '';
    try {
        raw = fs.readFileSync(LEGACY_JSON_FILE, 'utf-8');
    } catch { return; }
    if (!raw.trim()) return;

    let items = [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) items = parsed;
    } catch { return; }
    if (items.length === 0) return;

    for (const item of items) {
        if (!item || !item.ip) continue;
        const ip = String(item.ip).trim();
        if (!ip) continue;
        const existing = dbData.saved_ips.find(s => s.ip === ip);
        if (!existing) {
            dbData.saved_ips.push({
                ip,
                loss: Number.isFinite(Number(item.loss)) ? Number(item.loss) : null,
                ping: Number.isFinite(Number(item.ping)) ? Number(item.ping) : null,
                speed: Number.isFinite(Number(item.speed)) ? Number(item.speed) : null,
                csvColo: item.csvColo ? String(item.csvColo) : null,
                region: item.region ? String(item.region) : null,
                tag: typeof item.tag === 'string' ? item.tag : '',
                created_at: Date.now()
            });
        }
    }
    await saveDb();
}

app.get('/api/saved-ips', async (req, res) => {
    try {
        const rows = [...dbData.saved_ips].sort((a, b) => b.created_at - a.created_at);
        res.json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, msg: '读取收藏失败' });
    }
});

app.post('/api/save-ips', async (req, res) => {
    const newIps = Array.isArray(req.body.ips) ? req.body.ips : [];
    if (newIps.length === 0) return res.json({ success: true, added: 0 });

    let added = 0;
    let updated = 0;
    try {
        for (const item of newIps) {
            if (!item || !item.ip) continue;
            const ip = String(item.ip).trim();
            if (!ip) continue;
            const existingIdx = dbData.saved_ips.findIndex(s => s.ip === ip);
            if (existingIdx === -1) {
                dbData.saved_ips.push({
                    ip,
                    loss: Number.isFinite(Number(item.loss)) ? Number(item.loss) : null,
                    ping: Number.isFinite(Number(item.ping)) ? Number(item.ping) : null,
                    speed: Number.isFinite(Number(item.speed)) ? Number(item.speed) : null,
                    csvColo: item.csvColo ? String(item.csvColo) : null,
                    region: item.region ? String(item.region) : null,
                    tag: typeof item.tag === 'string' ? String(item.tag).trim() : '',
                    created_at: Date.now()
                });
                added++;
            } else {
                const incomingHasTag = typeof item.tag === 'string';
                dbData.saved_ips[existingIdx] = {
                    ...dbData.saved_ips[existingIdx],
                    loss: Number.isFinite(Number(item.loss)) ? Number(item.loss) : dbData.saved_ips[existingIdx].loss,
                    ping: Number.isFinite(Number(item.ping)) ? Number(item.ping) : dbData.saved_ips[existingIdx].ping,
                    speed: Number.isFinite(Number(item.speed)) ? Number(item.speed) : dbData.saved_ips[existingIdx].speed,
                    csvColo: item.csvColo ? String(item.csvColo) : dbData.saved_ips[existingIdx].csvColo,
                    region: item.region ? String(item.region) : dbData.saved_ips[existingIdx].region,
                    tag: incomingHasTag ? String(item.tag).trim() : (dbData.saved_ips[existingIdx].tag || ''),
                    updated_at: Date.now()
                };
                updated++;
            }
        }
        if (added > 0 || updated > 0) await saveDb();
        res.json({ success: true, added, updated });
    } catch (e) {
        res.status(500).json({ success: false, msg: '保存收藏失败' });
    }
});

app.post('/api/delete-ips', async (req, res) => {
    const ips = Array.isArray(req.body.ips) ? req.body.ips.map(s => String(s).trim()).filter(Boolean) : [];
    if (ips.length === 0) return res.json({ success: true });
    try {
        const initialLength = dbData.saved_ips.length;
        dbData.saved_ips = dbData.saved_ips.filter(item => !ips.includes(item.ip));
        if (dbData.saved_ips.length !== initialLength) {
            await saveDb();
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, msg: '删除收藏失败' });
    }
});

app.get('/api/settings/cfst', async (req, res) => {
    try {
        const cfg = await getCfstConfig();
        res.json({ success: true, data: cfg });
    } catch (e) {
        res.status(500).json({ success: false, msg: '读取设置失败' });
    }
});

app.post('/api/settings/cfst', async (req, res) => {
    const body = req.body || {};
    const cfg = {
        n: body.n, t: body.t, tp: body.tp,
        url: typeof body.url === 'string' ? body.url.trim() : '',
        mode: body.mode, httpingCode: body.httpingCode,
        cfcolo: typeof body.cfcolo === 'string' ? body.cfcolo.trim() : '',
        dt: body.dt, dn: body.dn, dnSingle: body.dnSingle,
        tl: body.tl, tll: body.tll, tlr: body.tlr, sl: body.sl,
        disableDownload: Boolean(body.disableDownload),
        allip: Boolean(body.allip), debug: Boolean(body.debug), topN: body.topN
    };
    try {
        await setSetting('cfst_config', JSON.stringify(cfg));
        const normalized = await getCfstConfig();
        res.json({ success: true, data: normalized });
    } catch (e) {
        res.status(500).json({ success: false, msg: '保存设置失败' });
    }
});

app.post('/api/regions', async (req, res) => {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
    const ips = Array.isArray(req.body?.ips)
        ? [...new Set(req.body.ips.map(s => String(s || '').trim()).filter(ip => ipRegex.test(ip)))]
        : [];
    if (ips.length === 0) return res.json({ success: true, data: {} });

    const data = {};
    try {
        await mapWithConcurrency(ips, 8, async (ip) => {
            data[ip] = await getColoCached(ip);
        });
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, msg: '地区查询失败' });
    }
});

app.post('/api/export', async (req, res) => {
    const format = String(req.body?.format || 'clash').toLowerCase();
    const rows = Array.isArray(req.body?.items) ? req.body.items : [];
    const nodes = rows.filter(item => item && item.ip).slice(0, 50);
    if (nodes.length === 0) {
        return res.json({ success: false, msg: '没有可导出的节点' });
    }

    if (format === 'singbox') {
        const outbounds = nodes.map((item, idx) => ({
            type: 'http',
            tag: `cf-${idx + 1}-${item.ip}`,
            server: item.ip,
            server_port: 443
        }));
        return res.json({ success: true, data: JSON.stringify({ outbounds }, null, 2) });
    }

    const proxies = nodes.map((item, idx) => ({
        name: `CF-${idx + 1}-${item.ip}`,
        type: 'http',
        server: item.ip,
        port: 443
    }));
    const clash = { proxies, 'proxy-groups': [{ name: 'CF-AUTO', type: 'select', proxies: proxies.map(p => p.name) }] };
    res.json({ success: true, data: JSON.stringify(clash, null, 2) });
});

app.post('/api/schedule', async (req, res) => {
    const body = req.body || {};
    const enabled = Boolean(body.enabled);
    const intervalMin = clamp(Number(body.intervalMin) || 60, 10, 1440);
    const targets = Array.isArray(body.targets) ? body.targets.map(s => String(s || '').trim()).filter(Boolean).slice(0, 200) : [];
    try {
        await setSetting('schedule_config', JSON.stringify({ enabled, intervalMin, targets }));
        if (scheduleTimer) {
            clearInterval(scheduleTimer);
            scheduleTimer = null;
        }
        if (enabled && targets.length > 0) {
            scheduleTimer = setInterval(async () => {
                dbData.last_targets = targets;
                await saveDb();
            }, intervalMin * 60 * 1000);
        }
        res.json({ success: true, data: { enabled, intervalMin, targetsCount: targets.length } });
    } catch (e) {
        res.status(500).json({ success: false, msg: '保存计划任务失败' });
    }
});

// --- 以下为原有的测速与解析逻辑（保持不变） ---
const cfColoMap = {
    'HKG': '🇭🇰 香港', 'TPE': '🇹🇼 台北', 'NRT': '🇯🇵 东京', 'KIX': '🇯🇵 大阪',
    'SGP': '🇸🇬 新加坡', 'ICN': '🇰🇷 首尔', 'LAX': '🇺🇸 洛杉矶', 'SJC': '🇺🇸 圣何塞',
    'SEA': '🇺🇸 西雅图', 'FRA': '🇩🇪 法兰克福', 'LHR': '🇬🇧 伦敦', 'SYD': '🇦🇺 悉尼',
    'CDG': '🇫🇷 巴黎', 'AMS': '🇳🇱 阿姆斯特丹', 'YYZ': '🇨🇦 多伦多', 'KUL': '🇲🇾 吉隆坡',
    'BKK': '🇹🇭 曼谷', 'MNL': '🇵🇭 马尼拉', 'CGK': '🇮🇩 雅加达', 'BOM': '🇮🇳 孟买'
};

function getColo(ip) {
    return new Promise((resolve) => {
        const req = http.get(`http://${ip}/cdn-cgi/trace`, { timeout: 1500 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const match = data.match(/colo=([A-Z]+)/);
                if (match && match[1]) resolve(cfColoMap[match[1]] || `🌐 ${match[1]}`);
                else resolve('❓ 未知');
            });
        }).on('error', () => resolve('❓ 测速节点'))
          .on('timeout', () => { req.destroy(); resolve('⏳ 超时'); });
    });
}

async function getColoCached(ip) {
    const key = String(ip || '').trim();
    if (!key) return '❓ 未知';
    const cache = coloCache.get(key);
    const now = Date.now();
    if (cache && cache.expireAt > now) return cache.region;
    const region = await getColo(key);
    const normalized = region || '❓ 未知';
    coloCache.set(key, { region: normalized, expireAt: now + 30 * 60 * 1000 });
    return normalized;
}

async function mapWithConcurrency(items, limit, mapper) {
    const queue = Array.isArray(items) ? [...items] : [];
    const workerCount = Math.max(1, Math.min(limit || 1, queue.length || 1));
    const workers = Array.from({ length: workerCount }).map(async () => {
        while (queue.length > 0) {
            const item = queue.shift();
            if (typeof item === 'undefined') continue;
            await mapper(item);
        }
    });
    await Promise.all(workers);
}

function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
}

function withTimeout(taskPromise, timeoutMs, timeoutMessage) {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage || '操作超时')), timeoutMs);
    });
    return Promise.race([taskPromise, timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

function computeHealthScore(item) {
    const ping = Number.isFinite(Number(item.ping)) ? Number(item.ping) : 9999;
    const loss = Number.isFinite(Number(item.loss)) ? Number(item.loss) : 1;
    const speed = Number.isFinite(Number(item.speed)) ? Number(item.speed) : 0;
    const pingScore = clamp(100 - ping, 0, 100) * 0.45;
    const speedScore = clamp(speed * 4, 0, 100) * 0.4;
    const lossScore = clamp((1 - loss) * 100, 0, 100) * 0.15;
    return Number((pingScore + speedScore + lossScore).toFixed(1));
}

function computeTrend(ip, currentSpeed) {
    const hist = Array.isArray(dbData.test_history[ip]) ? dbData.test_history[ip] : [];
    if (hist.length === 0) return 'new';
    const last = hist[hist.length - 1];
    const prevSpeed = Number.isFinite(Number(last.speed)) ? Number(last.speed) : 0;
    const nowSpeed = Number.isFinite(Number(currentSpeed)) ? Number(currentSpeed) : 0;
    const delta = nowSpeed - prevSpeed;
    if (delta > 3) return 'up';
    if (delta < -3) return 'down';
    return 'stable';
}

async function saveHistory(items) {
    const rows = Array.isArray(items) ? items : [];
    if (rows.length === 0) return;
    const now = Date.now();
    rows.forEach((item) => {
        if (!item || !item.ip) return;
        const key = String(item.ip).trim();
        if (!key) return;
        if (!Array.isArray(dbData.test_history[key])) dbData.test_history[key] = [];
        dbData.test_history[key].push({
            ts: now,
            ping: Number.isFinite(Number(item.ping)) ? Number(item.ping) : null,
            speed: Number.isFinite(Number(item.speed)) ? Number(item.speed) : null,
            loss: Number.isFinite(Number(item.loss)) ? Number(item.loss) : null
        });
        if (dbData.test_history[key].length > 20) {
            dbData.test_history[key] = dbData.test_history[key].slice(-20);
        }
    });
    await saveDb();
}

function getAdaptiveConfig(baseConfig, runtimeOptions, targetsCount) {
    const cfg = { ...baseConfig };
    const opts = runtimeOptions || {};
    const profile = String(opts.profile || '').trim();
    const mode = String(opts.performanceMode || 'auto').trim();
    const mobileLikely = profile.includes('mobile');
    const shouldAdapt = mode === 'mobile' || (mode === 'auto' && mobileLikely);
    if (!shouldAdapt) return cfg;

    cfg.n = clamp(Math.round(cfg.n * 0.35), 24, 96);
    cfg.t = clamp(Math.round(cfg.t * 0.6), 1, 3);
    cfg.dt = clamp(Math.round(cfg.dt * 0.6), 1, 3);
    cfg.dn = clamp(Math.round(cfg.dn * 0.5), 1, 5);
    cfg.topN = clamp(Math.round(cfg.topN * 0.5), 8, 25);
    if (targetsCount > 0 && targetsCount <= 3) cfg.dn = 1;
    return cfg;
}

const cfGlobalDnsServers = [
    ['8.8.8.8', '8.8.4.4'], ['1.1.1.1', '1.0.0.1'], ['208.67.222.222', '208.67.220.220'],
    ['9.9.9.9', '149.112.112.112'], ['119.29.29.29', '223.5.5.5']
];

async function resolveTargets(targets) {
    const finalIps = new Set();
    const domains = [];
    const ipRegex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

    targets.forEach(t => {
        const trimmed = String(t || '').trim();
        if (!trimmed) return;
        if (ipRegex.test(trimmed)) finalIps.add(trimmed);
        else domains.push(trimmed);
    });

    if (domains.length > 0) {
        const resolveWithTimeout = async (resolver, domain, timeoutMs = 2500) => {
            let timer = null;
            try {
                return await Promise.race([
                    resolver.resolve4(domain).catch(() => []),
                    new Promise((resolve) => {
                        timer = setTimeout(() => {
                            try { resolver.cancel(); } catch {}
                            resolve([]);
                        }, timeoutMs);
                    })
                ]);
            } finally {
                if (timer) clearTimeout(timer);
            }
        };

        // 限制域名解析规模与并发，避免批量输入时卡在解析阶段
        const domainList = domains.slice(0, 120);
        const jobs = [];
        domainList.forEach((domain) => {
            cfGlobalDnsServers.forEach((servers) => jobs.push({ domain, servers }));
        });
        logTask('resolver', 'dns-jobs-created', { domains: domainList.length, jobs: jobs.length, concurrency: 16 });
        await mapWithConcurrency(jobs, 16, async ({ domain, servers }) => {
            const resolver = new dns.Resolver();
            resolver.setServers(servers);
            const records = await resolveWithTimeout(resolver, domain, 2500);
            records.forEach(ip => finalIps.add(ip));
        });
    }
    return Array.from(finalIps);
}

app.post('/api/start-test', upload.single('csvFile'), async (req, res) => {
    req.setTimeout(300000);
    const taskId = (req.body && req.body.taskId) || crypto.randomUUID();
    const mixedRegex = /(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-zA-Z0-9][-a-zA-Z0-9]{0,62}\.)+[a-zA-Z]{2,}/g;
    const runtimeOptions = req.body?.runtimeOptions || {};
    const inputMode = String(req.body?.inputMode || 'ip').toLowerCase();
    const parseTimeoutMs = clamp(Number(runtimeOptions.parseTimeoutSec) || 25, 5, 120) * 1000;
    const totalTimeoutMs = clamp(Number(runtimeOptions.totalTimeoutSec) || 150, 20, 600) * 1000;
    const incremental = Boolean(runtimeOptions.incremental);
    sendProgress(taskId, { state: 'start', phase: '准备中', message: '测速任务初始化中...' });
    logTask(taskId, 'start-request', {
        hasFile: Boolean(req.file),
        hasTargetIps: Boolean(req.body?.targetIps),
        inputMode,
        runtimeOptions
    });

    let rawTargets = [];
    if (req.file) {
        const content = req.file.buffer.toString('utf-8');
        rawTargets = [...new Set(content.match(mixedRegex) || [])];
    } else if (req.body.targetIps) {
        if (Array.isArray(req.body.targetIps)) rawTargets = req.body.targetIps;
        else if (typeof req.body.targetIps === 'string') {
            try { rawTargets = JSON.parse(req.body.targetIps); } catch {}
        }
    }
    rawTargets = rawTargets.map(s => String(s || '').trim()).filter(Boolean);
    if (inputMode !== 'ip' && inputMode !== 'cname') {
        logTask(taskId, 'input-mode-invalid', { inputMode });
        closeProgress(taskId);
        return res.status(400).json({ success: false, msg: '输入模式无效，仅支持 ip 或 cname' });
    }

    const ipRegexExact = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
    const domainRegexExact = /^(?:[a-zA-Z0-9](?:[-a-zA-Z0-9]{0,62})\.)+[a-zA-Z]{2,}$/;
    if (inputMode === 'ip') {
        const invalid = rawTargets.filter((item) => !ipRegexExact.test(item));
        if (invalid.length > 0) {
            logTask(taskId, 'input-mode-mismatch', { mode: inputMode, invalidCount: invalid.length, sample: invalid.slice(0, 3) });
            sendProgress(taskId, { state: 'error', phase: '输入校验', message: `IP 模式下检测到 ${invalid.length} 个非 IP 内容` });
            closeProgress(taskId);
            return res.status(400).json({ success: false, msg: `当前为 IP 模式，检测到 ${invalid.length} 个非 IP 值，请关闭 CNAME 或移除域名后重试` });
        }
    } else {
        const invalid = rawTargets.filter((item) => !ipRegexExact.test(item) && !domainRegexExact.test(item));
        if (invalid.length > 0) {
            logTask(taskId, 'input-mode-mismatch', { mode: inputMode, invalidCount: invalid.length, sample: invalid.slice(0, 3) });
            sendProgress(taskId, { state: 'error', phase: '输入校验', message: `CNAME 模式下检测到 ${invalid.length} 个非法值` });
            closeProgress(taskId);
            return res.status(400).json({ success: false, msg: `当前为 CNAME 模式，检测到 ${invalid.length} 个非法值（既不是 IP 也不是域名）` });
        }
    }
    logTask(taskId, 'raw-targets-loaded', { count: rawTargets.length, inputMode });

    const baseConfig = await getCfstConfig();
    const cfstConfig = getAdaptiveConfig(baseConfig, runtimeOptions, rawTargets.length);
    logTask(taskId, 'config-ready', { baseN: baseConfig.n, useN: cfstConfig.n, adaptive: cfstConfig.n !== baseConfig.n });
    const args = [];
    let inputIps = null;

    args.push('-n', String(cfstConfig.n));
    args.push('-t', String(cfstConfig.t));
    args.push('-tp', String(cfstConfig.tp));
    args.push('-tl', String(cfstConfig.tl));
    args.push('-tll', String(cfstConfig.tll));
    args.push('-tlr', String(cfstConfig.tlr));
    args.push('-sl', String(cfstConfig.sl));
    if (cfstConfig.mode === 'http') {
        args.push('-httping');
        args.push('-httping-code', String(cfstConfig.httpingCode));
        if (cfstConfig.cfcolo) args.push('-cfcolo', cfstConfig.cfcolo);
    }
    if (cfstConfig.disableDownload) args.push('-dd');
    if (cfstConfig.allip) args.push('-allip');
    if (cfstConfig.debug) args.push('-debug');

    if (rawTargets.length > 0) {
        sendProgress(taskId, { state: 'running', phase: '解析目标', message: `正在解析 ${rawTargets.length} 个输入目标...` });
        let resolvedIps;
        const ipRegexFast = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
        const allIpOnly = rawTargets.every((item) => ipRegexFast.test(String(item || '').trim()));
        logTask(taskId, 'parse-begin', { rawCount: rawTargets.length, allIpOnly, parseTimeoutMs });
        try {
            if (allIpOnly) {
                resolvedIps = [...new Set(rawTargets.map(s => String(s).trim()).filter(Boolean))];
                sendProgress(taskId, { state: 'running', phase: '解析目标', message: `检测到纯 IP 输入，快速跳过 DNS 解析（${resolvedIps.length} 个）` });
                logTask(taskId, 'parse-fast-path', { resolvedCount: resolvedIps.length });
            } else {
                resolvedIps = await withTimeout(resolveTargets(rawTargets), parseTimeoutMs, '解析超时');
                logTask(taskId, 'parse-dns-done', { resolvedCount: resolvedIps.length });
            }
        } catch (e) {
            logTask(taskId, 'parse-error', { message: e && e.message ? e.message : String(e) });
            sendProgress(taskId, { state: 'error', phase: '解析失败', message: e.message || '解析超时' });
            closeProgress(taskId);
            return res.json({ success: false, msg: e.message || '解析失败' });
        }
        if (!Array.isArray(resolvedIps) || resolvedIps.length === 0) {
            logTask(taskId, 'parse-empty');
            sendProgress(taskId, { state: 'error', phase: '解析失败', message: '输入目标未解析出有效 IPv4' });
            closeProgress(taskId);
            return res.json({ success: false, msg: '输入目标未解析出有效 IPv4' });
        }

        let finalIps = [...new Set(resolvedIps)];
        if (incremental && dbData.last_targets.length > 0) {
            const previous = new Set(dbData.last_targets);
            const newOnes = finalIps.filter(ip => !previous.has(ip));
            const reused = finalIps.filter(ip => previous.has(ip)).slice(0, 20);
            finalIps = [...new Set([...newOnes, ...reused])];
        }
        dbData.last_targets = finalIps.slice(0, 500);
        await saveDb();
        logTask(taskId, 'final-ips-ready', { finalCount: finalIps.length, incremental });

        inputIps = new Set(finalIps);
        args.push('-ip', finalIps.join(','));
        args.push('-url', cfstConfig.url);
        args.push('-dt', String(cfstConfig.dt));
        args.push('-dn', String(finalIps.length <= 1 ? cfstConfig.dnSingle : cfstConfig.dn));
        sendProgress(taskId, { state: 'running', phase: '准备测速', message: `解析完成，开始测试 ${finalIps.length} 个 IP...` });
    } else {
        args.push('-url', cfstConfig.url);
        args.push('-dt', String(cfstConfig.dt));
        args.push('-dn', String(cfstConfig.dn));
        sendProgress(taskId, { state: 'running', phase: '准备测速', message: '未指定目标，开始测试默认节点库...' });
    }

    let replied = false;
    const finishWithError = (code, msg, phase = '执行失败') => {
        if (replied) return;
        replied = true;
        sendProgress(taskId, { state: 'error', phase, message: msg });
        closeProgress(taskId);
        res.status(code).json({ success: false, msg });
    };
    const finishWithSuccess = (data) => {
        if (replied) return;
        replied = true;
        sendProgress(taskId, { state: 'done', phase: '完成', message: `测速完成，共获得 ${data.length} 个节点`, percent: 100, current: 1, total: 1 });
        closeProgress(taskId);
        res.json({ success: true, data, meta: { adaptive: cfstConfig.n !== baseConfig.n, incremental } });
    };

    const child = spawn('./cfst', args, { cwd: __dirname });
    logTask(taskId, 'spawn-cfst', { argsCount: args.length, totalTimeoutMs });
    let timedOutKilled = false;
    const watchdog = setTimeout(() => {
        logTask(taskId, 'watchdog-timeout-kill', { totalTimeoutMs });
        timedOutKilled = true;
        try { child.kill('SIGKILL'); } catch {}
    }, totalTimeoutMs);
    let stdoutBuffer = '';

    child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';
        lines.forEach((line) => {
            const payload = parseProgressLine(line);
            if (payload) sendProgress(taskId, payload);
        });
    });

    child.stderr.on('data', (chunk) => {
        const lines = chunk.toString().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        lines.forEach((line) => {
            const parsed = parseProgressLine(line);
            if (parsed) return sendProgress(taskId, parsed);
            if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fail') || line.includes('失败')) {
                sendProgress(taskId, { state: 'running', phase: '引擎错误', message: line });
            }
        });
    });

    child.on('error', () => {
        logTask(taskId, 'child-error');
        clearTimeout(watchdog);
        finishWithError(500, '底层引擎执行失败');
    });

    child.on('close', async (code, signal) => {
        logTask(taskId, 'child-close', { code, signal, timedOutKilled });
        clearTimeout(watchdog);
        if (replied) return;
        if (timedOutKilled) {
            return finishWithError(500, `测速超时已终止（>${Math.round(totalTimeoutMs / 1000)}秒），请降低并发/数量或调大“任务总超时”`, '执行超时');
        }
        if (code !== 0) {
            const reason = signal ? `信号:${signal}` : `退出码:${code}`;
            return finishWithError(500, `底层引擎异常退出（${reason}）`);
        }

        const csvPath = path.join(__dirname, 'result.csv');
        if (!fs.existsSync(csvPath)) return finishWithError(500, '未找到结果文件', '结果解析');

        sendProgress(taskId, { state: 'running', phase: '结果解析', message: '测速完成，正在解析结果...' });
        const csvData = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvData.trim().split('\n');
        const results = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i]) continue;
            const values = lines[i].split(',');
            results.push({
                ip: values[0],
                loss: parseFloat(values[3]),
                ping: parseFloat(values[4]),
                speed: parseFloat(values[5]),
                csvColo: values[6] ? values[6].replace('\r', '').trim() : null
            });
        }

        let filtered = inputIps ? results.filter((r) => inputIps.has(r.ip)) : results;
        if (cfstConfig.disableDownload) {
            filtered.sort((a, b) => (Number(a.ping) || 999999) - (Number(b.ping) || 999999));
        } else {
            filtered.sort((a, b) => (Number(b.speed) || -1) - (Number(a.speed) || -1));
        }

        const topResults = filtered.slice(0, cfstConfig.topN).map((item) => ({
            ...item,
            healthScore: computeHealthScore(item),
            trend: computeTrend(item.ip, item.speed)
        }));
        logTask(taskId, 'results-ready', { rawResults: results.length, filtered: filtered.length, top: topResults.length });
        topResults.sort((a, b) => b.healthScore - a.healthScore);

        const pendingRegionIps = [];
        topResults.forEach((item) => {
            if (item.csvColo && item.csvColo !== '' && item.csvColo !== '0.00' && item.csvColo !== '未知' && item.csvColo !== 'N/A') {
                item.region = cfColoMap[item.csvColo] || `🌐 ${item.csvColo}`;
            } else {
                item.region = '⏳ 获取中';
                pendingRegionIps.push(item.ip);
            }
        });
        if (pendingRegionIps.length > 0) {
            mapWithConcurrency([...new Set(pendingRegionIps)], 6, async (ip) => {
                await getColoCached(ip);
            }).catch(() => {});
        }

        await saveHistory(topResults);
        finishWithSuccess(topResults);
    });
});

process.on('uncaughtException', (err) => {
    console.error('\n🔥 uncaughtException:', err && err.stack ? err.stack : err, '\n');
});
process.on('unhandledRejection', (reason) => {
    console.error('\n🔥 unhandledRejection:', reason && reason.stack ? reason.stack : reason, '\n');
});
(async () => {
    try {
        await initDb();
        await migrateLegacySavedIpsIfNeeded();
        app.listen(PORT, () => console.log(`\n🎉 全栈测速中枢 (带持久化存储) 已启动！👉 访问: http://localhost:${PORT}\n`));
    } catch (e) {
        console.error('\n🔥 数据库初始化失败:', e && e.message ? e.message : e, '\n');
        process.exit(1);
    }
})();
