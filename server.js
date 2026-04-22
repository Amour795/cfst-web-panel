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
    clients.forEach((res) => res.write(message));
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
    if (cached) res.write(`data: ${JSON.stringify(cached)}\n\n`);
    else res.write(`data: ${JSON.stringify({ state: 'waiting', phase: '等待任务', message: '等待测速任务启动...' })}\n\n`);

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
let dbData = { saved_ips: [], settings: {} };

async function initDb() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = await fs.promises.readFile(DB_FILE, 'utf-8');
            dbData = JSON.parse(raw);
            if (!dbData.saved_ips) dbData.saved_ips = [];
            if (!dbData.settings) dbData.settings = {};
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
                    created_at: Date.now()
                });
                added++;
            }
        }
        if (added > 0) await saveDb();
        res.json({ success: true, added });
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
    if (coloCache.has(key)) return coloCache.get(key);
    const region = await getColo(key);
    coloCache.set(key, region || '❓ 未知');
    return coloCache.get(key);
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
        const promises = [];
        domains.forEach(domain => {
            cfGlobalDnsServers.forEach(servers => {
                const resolver = new dns.Resolver();
                resolver.setServers(servers);
                promises.push(resolver.resolve4(domain).catch(() => { return []; }));
            });
        });
        const results = await Promise.all(promises);
        results.forEach(records => records.forEach(ip => finalIps.add(ip)));
    }
    return Array.from(finalIps);
}

app.post('/api/start-test', upload.single('csvFile'), async (req, res) => {
    req.setTimeout(300000); 
    let rawTargets = [];
    const taskId = (req.body && req.body.taskId) || crypto.randomUUID();
    const mixedRegex = /(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-zA-Z0-9][-a-zA-Z0-9]{0,62}\.)+[a-zA-Z]{2,}/g;
    sendProgress(taskId, { state: 'start', phase: '准备中', message: '测速任务初始化中...' });

    if (req.file) {
        const content = req.file.buffer.toString('utf-8');
        rawTargets = [...new Set(content.match(mixedRegex) || [])];
    } else if (req.body.targetIps) {
        if (Array.isArray(req.body.targetIps)) {
            rawTargets = req.body.targetIps;
        } else if (typeof req.body.targetIps === 'string') {
            try { rawTargets = JSON.parse(req.body.targetIps); } catch(e) {}
        }
    }

    const cfstConfig = await getCfstConfig();
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

    if (rawTargets && rawTargets.length > 0) {
        sendProgress(taskId, { state: 'running', phase: '解析目标', message: `正在解析 ${rawTargets.length} 个输入目标...` });
        const resolvedIps = await resolveTargets(rawTargets);
        if (resolvedIps.length === 0) {
            sendProgress(taskId, { state: 'error', phase: '解析失败', message: '输入的目标无法解析出有效 IPv4' });
            closeProgress(taskId);
            return res.json({ success: false, msg: '输入的目标无法解析出有效 IPv4' });
        }
        inputIps = new Set(resolvedIps);
        args.push('-ip', resolvedIps.join(','));
        args.push('-url', cfstConfig.url);
        args.push('-dt', String(cfstConfig.dt));
        args.push('-dn', String(resolvedIps.length <= 1 ? cfstConfig.dnSingle : cfstConfig.dn));
        sendProgress(taskId, { state: 'running', phase: '准备测速', message: `解析完成，开始测试 ${resolvedIps.length} 个 IP...` });
    } else {
        args.push('-url', cfstConfig.url);
        args.push('-dt', String(cfstConfig.dt));
        args.push('-dn', String(cfstConfig.dn));
        sendProgress(taskId, { state: 'running', phase: '准备测速', message: '未指定目标，开始测试默认节点库...' });
    }

    const child = spawn('./cfst', args, { cwd: __dirname });
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
        const raw = chunk.toString();
        const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        lines.forEach((line) => {
            const parsed = parseProgressLine(line);
            if (parsed) return sendProgress(taskId, parsed);
            const lower = line.toLowerCase();
            if (lower.includes('error') || lower.includes('fail') || line.includes('失败')) {
                sendProgress(taskId, { state: 'running', phase: '引擎错误', message: line });
            }
        });
    });

    child.on('error', () => {
        sendProgress(taskId, { state: 'error', phase: '执行失败', message: '底层引擎执行失败' });
        closeProgress(taskId);
        res.status(500).json({ success: false, msg: '底层引擎执行失败' });
    });

    child.on('close', async (code) => {
        if (code !== 0) {
            sendProgress(taskId, { state: 'error', phase: '执行失败', message: `底层引擎退出码异常: ${code}` });
            closeProgress(taskId);
            return res.status(500).json({ success: false, msg: '底层引擎执行失败' });
        }

        const csvPath = path.join(__dirname, 'result.csv');
        if (!fs.existsSync(csvPath)) {
            sendProgress(taskId, { state: 'error', phase: '结果解析', message: '未找到结果文件' });
            closeProgress(taskId);
            return res.status(500).json({ success: false, msg: '未找到结果文件' });
        }

        sendProgress(taskId, { state: 'running', phase: '结果解析', message: '测速完成，正在解析结果...' });
        const csvData = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvData.trim().split('\n');
        const results = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i]) continue;
            const values = lines[i].split(',');
            results.push({
                ip: values[0], loss: parseFloat(values[3]), ping: parseFloat(values[4]),
                speed: parseFloat(values[5]), csvColo: values[6] ? values[6].replace('\r', '').trim() : null
            });
        }
        let filtered = results;
        if (inputIps) filtered = results.filter((r) => inputIps.has(r.ip));
        if (cfstConfig.disableDownload) {
            filtered.sort((a, b) => {
                const ap = Number.isFinite(Number(a.ping)) ? Number(a.ping) : 999999;
                const bp = Number.isFinite(Number(b.ping)) ? Number(b.ping) : 999999;
                if (ap !== bp) return ap - bp;
                const al = Number.isFinite(Number(a.loss)) ? Number(a.loss) : 999999;
                const bl = Number.isFinite(Number(b.loss)) ? Number(b.loss) : 999999;
                return al - bl;
            });
        } else {
            filtered.sort((a, b) => {
                const as = Number.isFinite(Number(a.speed)) ? Number(a.speed) : -1;
                const bs = Number.isFinite(Number(b.speed)) ? Number(b.speed) : -1;
                return bs - as;
            });
        }
        const topResults = filtered.slice(0, cfstConfig.topN);

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
        sendProgress(taskId, { state: 'done', phase: '完成', message: `测速完成，共获得 ${topResults.length} 个节点`, percent: 100, current: 1, total: 1 });
        closeProgress(taskId);
        res.json({ success: true, data: topResults });
    });
});

process.on('uncaughtException', (err) => console.error('\n🔥 致命错误:', err.message, '\n'));
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
