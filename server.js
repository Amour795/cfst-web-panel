const express = require('express');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const crypto = require('crypto');
const os = require('os');

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3088;
const MAX_PORT_RETRY = 20;
const MAX_TIMER_MS = 2147483647; // Node.js setTimeout 安全上限（约 24.8 天）
const CFST_BIN_NAME = process.platform === 'win32' ? 'cfst.exe' : 'cfst';

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

function isPrivateIP(hostname) {
    const ipv4Match = String(hostname || '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
        const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
        if (a === 10 || a === 127 || a === 0) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
    }
    // 简单判断 IPv6 内部地址
    if (hostname.startsWith('fe80:') || hostname === '::1' || hostname === '::') return true;
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
    if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ success: false, msg: '仅支持 http/https 地址' });
    
    const host = String(parsed.hostname || '').toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local') || isPrivateIP(host)) {
        return res.status(400).json({ success: false, msg: '不允许拉取本地/内网地址' });
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
        return res.status(500).json({ success: false, msg: '拉取源地址失败，请稍后重试' });
    }
});

// --- 系统维护接口 ---
app.post('/api/system/update-engine', (req, res) => {
    const platform = os.platform();
    const arch = os.arch();
    let file = '';
    
    // 💡 回归真理：官方从 v2.3.0 开始就是改名为了 cfst_xxx，且 Mac 换成了 .zip！
    if (platform === 'darwin' && arch === 'arm64') file = 'cfst_darwin_arm64.zip';
    else if (platform === 'darwin' && arch === 'x64') file = 'cfst_darwin_amd64.zip';
    else if (platform === 'linux' && (arch === 'arm64' || arch === 'aarch64')) file = 'cfst_linux_arm64.tar.gz';
    else if (platform === 'linux' && (arch === 'x64' || arch === 'amd64')) file = 'cfst_linux_amd64.tar.gz';
    else if (platform === 'win32' && (arch === 'x64' || arch === 'amd64')) file = 'cfst_windows_amd64.zip';
    
    if (!file) return res.json({ success: false, msg: `暂不支持自动更新该架构: ${platform}-${arch}` });
    
    // 多路备用节点，优先尝试最稳的几个代理，最后兜底 GitHub 直连
    const url1 = `https://mirror.ghproxy.com/https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/${file}`;
    const url2 = `https://gh-proxy.com/https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/${file}`;
    const url3 = `https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/${file}`;
    
    // 核心改进：加上 --connect-timeout 8，只要一个源卡住超过 8 秒立刻切换下一个
    const curlOpts = '--connect-timeout 8 -sSfL';
    
    let cmd = '';
    if (platform === 'win32') {
        const ps = `$ErrorActionPreference='Stop';` +
            `Set-Location -LiteralPath '${__dirname.replace(/'/g, "''")}';` +
            `if (Test-Path '.\\cfst.exe') { Remove-Item -Force '.\\cfst.exe' };` +
            `$u=@('${url1}','${url2}','${url3}');` +
            `$ok=$false;` +
            `foreach($x in $u){ try { Invoke-WebRequest -UseBasicParsing -Uri $x -OutFile '.\\tmp_cfst.zip' -TimeoutSec 20; $ok=$true; break } catch {} };` +
            `if(-not $ok){ throw '下载失败' };` +
            `Expand-Archive -Path '.\\tmp_cfst.zip' -DestinationPath '.' -Force;` +
            `Remove-Item -Force '.\\tmp_cfst.zip'`;
        cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"')}"`;
    } else if (file.endsWith('.zip')) {
        cmd = `rm -f cfst && (curl ${curlOpts} -o tmp_cfst.zip "${url1}" || curl ${curlOpts} -o tmp_cfst.zip "${url2}" || curl ${curlOpts} -o tmp_cfst.zip "${url3}") && unzip -o tmp_cfst.zip cfst && rm -f tmp_cfst.zip && chmod +x cfst`;
    } else {
        cmd = `rm -f cfst && (curl ${curlOpts} -o tmp_cfst.tar.gz "${url1}" || curl ${curlOpts} -o tmp_cfst.tar.gz "${url2}" || curl ${curlOpts} -o tmp_cfst.tar.gz "${url3}") && tar -zxf tmp_cfst.tar.gz cfst && rm -f tmp_cfst.tar.gz && chmod +x cfst`;
    }
    
    exec(cmd, { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            const realError = (stderr || error.message || '未知').replace(/\n/g, ' ').slice(-150).trim();
            return res.json({ success: false, msg: `失败原因: ${realError}` });
        }
        res.json({ success: true });
    });
});

app.post('/api/system/update-ips', async (req, res) => {
    try {
        const v4 = await fetch('https://www.cloudflare.com/ips-v4').then(r => r.text());
        const v6 = await fetch('https://www.cloudflare.com/ips-v6').then(r => r.text());
        if (v4 && v4.includes('.')) fs.writeFileSync(path.join(__dirname, 'ip.txt'), v4.trim());
        if (v6 && v6.includes(':')) fs.writeFileSync(path.join(__dirname, 'ipv6.txt'), v6.trim());
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, msg: '请求失败: ' + e.message });
    }
});

// --- 💾 数据库配置：JSON 持久化存储 ---
const DB_FILE = path.join(__dirname, 'database.json');
let dbData = { saved_ips: [], settings: {}, test_history: {}, last_targets: [] };
let dbSaveQueue = Promise.resolve();

function ensureLocalRuntimeReady() {
    const major = Number(String(process.versions.node || '').split('.')[0] || 0);
    if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) throw new Error(`Node.js 版本需 >= ${MIN_NODE_MAJOR}`);
    const cfstPath = path.join(__dirname, CFST_BIN_NAME);
    if (!fs.existsSync(cfstPath)) throw new Error('缺少 cfst 可执行文件');
    if (process.platform !== 'win32') {
        try { fs.accessSync(cfstPath, fs.constants.X_OK); } catch { throw new Error('cfst 未设置可执行权限'); }
    }
}

async function initDb() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = await fs.promises.readFile(DB_FILE, 'utf-8');
            dbData = JSON.parse(raw);
            if (!dbData.saved_ips) dbData.saved_ips = [];
            if (!dbData.settings) dbData.settings = {};
            if (!dbData.test_history || typeof dbData.test_history !== 'object') dbData.test_history = {};
            if (!Array.isArray(dbData.last_targets)) dbData.last_targets = [];
            dbData.saved_ips = dbData.saved_ips.map((item) => ({ ...item, tag: typeof item.tag === 'string' ? item.tag : '' }));
        } else {
            await fs.promises.writeFile(DB_FILE, JSON.stringify(dbData, null, 2));
        }
    } catch (e) {}
}

async function saveDb() {
    dbSaveQueue = dbSaveQueue.catch(() => {}).then(async () => {
        const tmpFile = `${DB_FILE}.tmp`;
        await fs.promises.writeFile(tmpFile, JSON.stringify(dbData, null, 2));
        await fs.promises.rename(tmpFile, DB_FILE);
    }).catch(() => {});
    await dbSaveQueue;
}

async function getSetting(key) { return dbData.settings[key] || null; }
async function setSetting(key, value) { dbData.settings[key] = value; await saveDb(); }

// --- CF API 与 DNS 设置 ---
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
    try { await setSetting('cf_api', JSON.stringify(req.body)); res.json({ success: true }); } 
    catch (e) { res.json({ success: false }); }
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

app.post('/api/cf/dns/add', async (req, res) => {
    try {
        const { ip } = req.body;
        const raw = await getSetting('cf_api');
        const { zoneId, domain } = raw ? JSON.parse(raw) : {};
        if (!zoneId || !domain) return res.json({ success: false, msg: '请先完成 CF 设置' });

        const result = await requestCF(`/zones/${zoneId}/dns_records`, 'POST', {
            type: 'A', name: domain, content: ip, proxied: false, ttl: 60
        });
        res.json({ success: result.success, msg: result.errors?.[0]?.message });
    } catch (e) { res.status(500).json({ success: false, msg: e.message }); }
});

app.delete('/api/cf/dns/:id', async (req, res) => {
    try {
        const recordId = req.params.id;
        const raw = await getSetting('cf_api');
        const { zoneId } = raw ? JSON.parse(raw) : {};
        const result = await requestCF(`/zones/${zoneId}/dns_records/${recordId}`, 'DELETE');
        res.json({ success: result.success });
    } catch (e) { res.status(500).json({ success: false, msg: e.message }); }
});

app.post('/api/cf/dns/sync', async (req, res) => {
    try {
        const { ips, clearOnly } = req.body;
        const raw = await getSetting('cf_api');
        const { zoneId, domain } = raw ? JSON.parse(raw) : {};
        if (!zoneId || !domain) return res.json({ success: false, msg: '未配置 CF 信息' });

        const curr = await requestCF(`/zones/${zoneId}/dns_records?type=A&name=${domain}`, 'GET');
        if (curr.success && curr.result) {
            for (const record of curr.result) await requestCF(`/zones/${zoneId}/dns_records/${record.id}`, 'DELETE');
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

// --- 设置获取 ---
function getOfficialRecommendedCfstConfig() {
    return {
        n: 200, t: 4, tp: 443, url: 'https://speed.cloudflare.com/__down?bytes=20000000',
        mode: 'tcp', httpingCode: 200, cfcolo: '', dt: 5, dn: 10, dnSingle: 1,
        tl: 9999, tll: 0, tlr: 1, sl: 0, disableDownload: false, allip: false,
        debug: false, topN: 50, parseTimeoutSec: 25, totalTimeoutSec: 900
    };
}

async function getCfstConfig() {
    const defaults = getOfficialRecommendedCfstConfig();
    const raw = await getSetting('cfst_config');
    if (!raw) return defaults;
    try {
        const parsed = JSON.parse(raw);
        const mode = parsed.mode === 'http' ? 'http' : 'tcp';
        const cfcoloNormalized = typeof parsed.cfcolo === 'string' ? parsed.cfcolo.trim() : '';
        const tlr = Number(parsed.tlr);
        const parseTimeoutSec = Number(parsed.parseTimeoutSec);
        const totalTimeoutSec = Number(parsed.totalTimeoutSec);
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
            topN: Number.isFinite(Number(parsed.topN)) ? Math.max(1, Math.min(200, Number(parsed.topN))) : defaults.topN,
            parseTimeoutSec: Number.isFinite(parseTimeoutSec) ? Math.max(1, parseTimeoutSec) : defaults.parseTimeoutSec,
            totalTimeoutSec: Number.isFinite(totalTimeoutSec) ? Math.max(1, totalTimeoutSec) : defaults.totalTimeoutSec
        };
    } catch { return defaults; }
}

// --- 数据相关逻辑 ---
app.get('/api/saved-ips', async (req, res) => {
    try {
        const rows = [...dbData.saved_ips].map(item => {
            const hist = dbData.test_history[item.ip] || [];
            const latest = hist.length > 0 ? hist[hist.length - 1] : {};
            const ping = item.ping !== undefined ? item.ping : (latest.ping || 0);
            const speed = item.speed !== undefined ? item.speed : (latest.speed || 0);
            return {
                ...item, ping, speed,
                ...computeDelta(item.ip, ping, speed)
            };
        }).sort((a, b) => b.created_at - a.created_at);
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/save-ips', async (req, res) => {
    const newIps = Array.isArray(req.body.ips) ? req.body.ips : [];
    let added = 0, updated = 0;
    try {
        for (const item of newIps) {
            if (!item || !item.ip) continue;
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
    // 北美洲
    'LAX': '🇺🇸 洛杉矶', 'SJC': '🇺🇸 圣何塞', 'SFO': '🇺🇸 旧金山', 'SEA': '🇺🇸 西雅图',
    'DFW': '🇺🇸 达拉斯', 'ORD': '🇺🇸 芝加哥', 'IAD': '🇺🇸 华盛顿', 'EWR': '🇺🇸 纽瓦克',
    'MIA': '🇺🇸 迈阿密', 'ATL': '🇺🇸 亚特兰大', 'JFK': '🇺🇸 纽约', 'PHX': '🇺🇸 凤凰城',
    'DEN': '🇺🇸 丹佛', 'LAS': '🇺🇸 拉斯维加斯', 'HNL': '🇺🇸 檀香山', 'SLC': '🇺🇸 盐湖城',
    'BOS': '🇺🇸 波士顿', 'DTW': '🇺🇸 底特律', 'PDX': '🇺🇸 波特兰', 'MSP': '🇺🇸 明尼阿波利斯',
    'MCI': '🇺🇸 堪萨斯城', 'MCO': '🇺🇸 奥兰多', 'CLT': '🇺🇸 夏洛特', 'TPA': '🇺🇸 坦帕',
    'AUS': '🇺🇸 奥斯汀', 'SAN': '🇺🇸 圣地亚哥', 'IAH': '🇺🇸 休斯顿',
    'YYZ': '🇨🇦 多伦多', 'YUL': '🇨🇦 蒙特利尔', 'YVR': '🇨🇦 温哥华', 'YYC': '🇨🇦 卡尔加里',
    // 亚洲
    'HKG': '🇭🇰 香港', 
    'TPE': '🇹🇼 台北', 'KHH': '🇹🇼 高雄',
    'NRT': '🇯🇵 东京', 'HND': '🇯🇵 东京', 'KIX': '🇯🇵 大阪', 'FUK': '🇯🇵 福冈', 'OKA': '🇯🇵 冲绳',
    'SGP': '🇸🇬 新加坡', 'SIN': '🇸🇬 新加坡',
    'ICN': '🇰🇷 首尔', 'PUS': '🇰🇷 釜山', 'GMP': '🇰🇷 首尔',
    'KUL': '🇲🇾 吉隆坡', 'JHB': '🇲🇾 柔佛',
    'BKK': '🇹🇭 曼谷',
    'MNL': '🇵🇭 马尼拉',
    'CGK': '🇮🇩 雅加达',
    'SGN': '🇻🇳 胡志明市', 'HAN': '🇻🇳 河内',
    'BOM': '🇮🇳 孟买', 'DEL': '🇮🇳 新德里', 'MAA': '🇮🇳 金奈', 'CCU': '🇮🇳 加尔各答', 'BLR': '🇮🇳 班加罗尔', 'HYD': '🇮🇳 海得拉巴',
    'KHI': '🇵🇰 卡拉奇', 'LHE': '🇵🇰 拉合尔', 'ISB': '🇵🇰 伊斯兰堡',
    'DAC': '🇧🇩 达卡',
    'CMB': '🇱🇰 科伦坡',
    'KTM': '🇳🇵 加德满都',
    'PNH': '🇰🇭 金边',
    'PEK': '🇨🇳 北京', 'SHA': '🇨🇳 上海', 'PVG': '🇨🇳 上海', 'CAN': '🇨🇳 广州', 'CTU': '🇨🇳 成都',
    // 欧洲
    'FRA': '🇩🇪 法兰克福', 'MUC': '🇩🇪 慕尼黑', 'BER': '🇩🇪 柏林', 'DUS': '🇩🇪 杜塞尔多夫', 'HAM': '🇩🇪 汉堡',
    'LHR': '🇬🇧 伦敦', 'MAN': '🇬🇧 曼彻斯特', 'EDI': '🇬🇧 爱丁堡',
    'CDG': '🇫🇷 巴黎', 'MRS': '🇫🇷 马赛',
    'AMS': '🇳🇱 阿姆斯特丹',
    'MAD': '🇪🇸 马德里', 'BCN': '🇪🇸 巴塞罗那',
    'MIL': '🇮🇹 米兰', 'MXP': '🇮🇹 米兰', 'FCO': '🇮🇹 罗马',
    'VIE': '🇦🇹 维也纳',
    'ZRH': '🇨🇭 苏黎世', 'GVA': '🇨🇭 日内瓦',
    'PRG': '🇨🇿 布拉格',
    'WAW': '🇵🇱 华沙',
    'BRU': '🇧🇪 布鲁塞尔',
    'CPH': '🇩🇰 哥本哈根',
    'DUB': '🇮🇪 都柏林',
    'ARN': '🇸🇪 斯德哥尔摩',
    'OSL': '🇳🇴 奥斯陆',
    'HEL': '🇫🇮 赫尔辛基',
    'LIS': '🇵🇹 里斯本',
    'OTP': '🇷🇴 布加勒斯特',
    'SOF': '🇧🇬 索非亚',
    'ATH': '🇬🇷 雅典',
    // 大洋洲
    'SYD': '🇦🇺 悉尼', 'MEL': '🇦🇺 墨尔本', 'BNE': '🇦🇺 布里斯班', 'PER': '🇦🇺 珀斯', 'ADL': '🇦🇺 阿德莱德',
    'AKL': '🇳🇿 奥克兰',
    // 南美洲 & 墨西哥
    'MEX': '🇲🇽 墨西哥城', 'QRO': '🇲🇽 克雷塔罗',
    'GRU': '🇧🇷 圣保罗', 'GIG': '🇧🇷 里约热内卢', 'CWB': '🇧🇷 库里蒂巴',
    'EZE': '🇦🇷 布宜诺斯艾利斯',
    'SCL': '🇨🇱 圣地亚哥',
    'BOG': '🇨🇴 波哥大',
    'LIM': '🇵🇪 利马',
    // 中东 & 非洲
    'DXB': '🇦🇪 迪拜', 'DOH': '🇶🇦 多哈', 'TLV': '🇮🇱 特拉维夫', 'AMM': '🇯🇴 安曼',
    'IST': '🇹🇷 伊斯坦布尔', 'JNB': '🇿🇦 约翰内斯堡', 'CPT': '🇿🇦 开普敦', 
    'LOS': '🇳🇬 拉各斯', 'NBO': '🇰🇪 内罗毕', 'CAI': '🇪🇬 开罗'
};

function getColo(ip) {
    return new Promise((resolve) => {
        const isV6 = ip.includes(':');
        const urlIp = isV6 ? `[${ip}]` : ip; 
        const headers = { 'Host': 'speed.cloudflare.com', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
        const probes = [
            { mod: http, url: `http://${urlIp}/cdn-cgi/trace`, opts: { timeout: 3000, headers } },
            { mod: https, url: `https://${urlIp}/cdn-cgi/trace`, opts: { timeout: 3500, headers, rejectUnauthorized: false, servername: 'speed.cloudflare.com' } }
        ];
        let idx = 0;
        const runProbe = () => {
            if (idx >= probes.length) return resolve('❓ 测速节点');
            const current = probes[idx++];
            const req = current.mod.get(current.url, current.opts, (res) => {
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

function computeDelta(ip, ping, speed) {
    const hist = dbData.test_history[ip] || [];
    if (hist.length === 0) return { deltaSpeed: null, deltaPing: null };
    const last = hist[hist.length - 1];
    return {
        deltaSpeed: last.speed === null || speed === null ? null : Number((speed - last.speed).toFixed(2)),
        deltaPing: last.ping === null || ping === null ? null : Number((ping - last.ping).toFixed(1))
    };
}

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
async function resolveTargets(targets, parseTimeoutMs = 25000) {
    const finalIps = new Set();
    const domains = [];
    const ipv4Str = '(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)';
    const ipv6Str = '(?:(?:[0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:))';
    const ipRegexExact = new RegExp(`^(?:${ipv4Str}|${ipv6Str})$`);

    targets.forEach(t => {
        const trimmed = String(t || '').trim();
        if (!trimmed) return;
        if (ipRegexExact.test(trimmed)) finalIps.add(trimmed);
        else domains.push(trimmed);
    });

    if (domains.length > 0) {
        const dnsTimeoutMs = Math.max(1000, Math.min(Number(parseTimeoutMs) || 25000, MAX_TIMER_MS));
        const resolveWithTimeout = async (resolver, domain, type, timeoutMs = dnsTimeoutMs) => {
            let timer = null;
            try {
                const prom = type === 'AAAA' ? resolver.resolve6(domain) : resolver.resolve4(domain);
                return await Promise.race([
                    prom.catch(() => []),
                    new Promise((resolve) => {
                        timer = setTimeout(() => { try { resolver.cancel(); } catch {} resolve([]); }, timeoutMs);
                    })
                ]);
            } finally { if (timer) clearTimeout(timer); }
        };

        const domainList = domains.slice(0, 120);
        const jobs = [];
        domainList.forEach((domain) => { cfGlobalDnsServers.forEach((servers) => jobs.push({ domain, servers })); });
        
        await mapWithConcurrency(jobs, 16, async ({ domain, servers }) => {
            const resolver = new dns.Resolver();
            resolver.setServers(servers);
            const [r4, r6] = await Promise.all([
                resolveWithTimeout(resolver, domain, 'A'),
                resolveWithTimeout(resolver, domain, 'AAAA')
            ]);
            [...r4, ...r6].forEach(ip => finalIps.add(ip));
        });
    }
    return Array.from(finalIps);
}

app.post('/api/start-test', upload.single('csvFile'), async (req, res) => {
    req.setTimeout(300000);
    const taskId = (req.body && req.body.taskId) || crypto.randomUUID();
    
    const ipv4Str = '(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)';
    const ipv6Str = '(?:(?:[0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:))';
    const mixedRegex = new RegExp(`(?:${ipv4Str})|(?:${ipv6Str})|(?:[a-zA-Z0-9][-a-zA-Z0-9]{0,62}\\.)+[a-zA-Z]{2,}`, 'g');
    const ipRegexExact = new RegExp(`^(?:${ipv4Str}|${ipv6Str})$`);

    const runtimeOptions = req.body?.runtimeOptions || {};
    const inputMode = String(req.body?.inputMode || 'ip').toLowerCase();
    const baseConfig = await getCfstConfig();
    const parseTimeoutSec = runtimeOptions.parseTimeoutSec ?? baseConfig.parseTimeoutSec;
    const totalTimeoutSec = runtimeOptions.totalTimeoutSec ?? baseConfig.totalTimeoutSec;
    const parseTimeoutMs = Math.max(1000, Math.min((Math.max(1, Number(parseTimeoutSec) || 25) * 1000), MAX_TIMER_MS));
    const totalTimeoutMs = Math.max(1000, Math.min((Math.max(1, Number(totalTimeoutSec) || 900) * 1000), MAX_TIMER_MS));
    const incremental = Boolean(runtimeOptions.incremental);
    const incrementalDownOnly = Boolean(runtimeOptions.incrementalDownOnly);
    sendProgress(taskId, { state: 'start', phase: '准备中', message: '测速任务初始化中...' });

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

    if (inputMode === 'ip') {
        const invalid = rawTargets.filter((item) => !ipRegexExact.test(item));
        if (invalid.length > 0) {
            sendProgress(taskId, { state: 'error', phase: '输入校验', message: `检测到 ${invalid.length} 个非 IP 内容` });
            closeProgress(taskId);
            return res.status(400).json({ success: false, msg: `当前为 IP 模式，请关闭 CNAME 或移除域名后重试` });
        }
    } else {
        const domainRegexExact = /^(?:[a-zA-Z0-9](?:[-a-zA-Z0-9]{0,62})\.)+[a-zA-Z]{2,}$/;
        const invalid = rawTargets.filter((item) => !ipRegexExact.test(item) && !domainRegexExact.test(item));
        if (invalid.length > 0) {
            sendProgress(taskId, { state: 'error', phase: '输入校验', message: `检测到 ${invalid.length} 个非法值` });
            closeProgress(taskId);
            return res.status(400).json({ success: false, msg: `当前为 CNAME 模式，检测到 ${invalid.length} 个非法值` });
        }
    }

    const cfstConfig = getAdaptiveConfig(baseConfig, runtimeOptions, rawTargets.length);
    const args = ['-n', String(cfstConfig.n), '-t', String(cfstConfig.t), '-tp', String(cfstConfig.tp), '-tl', String(cfstConfig.tl), '-tll', String(cfstConfig.tll), '-tlr', String(cfstConfig.tlr), '-sl', String(cfstConfig.sl)];
    if (cfstConfig.mode === 'http') { args.push('-httping', '-httping-code', String(cfstConfig.httpingCode)); if (cfstConfig.cfcolo) args.push('-cfcolo', cfstConfig.cfcolo); }
    if (cfstConfig.disableDownload) args.push('-dd');
    if (cfstConfig.allip) args.push('-allip');
    if (cfstConfig.debug) args.push('-debug');

    let inputIps = null;
    if (rawTargets.length > 0) {
        sendProgress(taskId, { state: 'running', phase: '解析目标', message: `解析 ${rawTargets.length} 个目标...` });
        let resolvedIps = await resolveTargets(rawTargets, parseTimeoutMs);
        if (!resolvedIps.length) {
            sendProgress(taskId, { state: 'error', phase: '解析失败', message: '未解析出有效 IP' });
            closeProgress(taskId); return res.json({ success: false, msg: '未解析出有效 IP' });
        }
        let finalIps = [...new Set(resolvedIps)];
        if (incrementalDownOnly) finalIps = finalIps.filter(ip => dbData.test_history[ip]?.length >= 2 && dbData.test_history[ip][dbData.test_history[ip].length-1].speed < dbData.test_history[ip][dbData.test_history[ip].length-2].speed - 3) || finalIps;
        inputIps = new Set(finalIps);
        // cfst 如果是 IPv6 会在命令行自动识别，但由于逗号分割可能解析异常，这里通过参数传递
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

    const child = spawn(process.platform === 'win32' ? '.\\cfst.exe' : './cfst', args, { cwd: __dirname });
    const watchdog = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} finish(500, '测速超时', '执行超时'); }, totalTimeoutMs);
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
        const server = app.listen(DEFAULT_PORT, () => { console.log(`\n🎉 测速中心已启动: http://localhost:${server.address().port}\n`); });
        server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') app.listen(DEFAULT_PORT + 1, () => console.log(`\n🎉 测速中心已启动: http://localhost:${DEFAULT_PORT + 1}\n`));
        });
    } catch (e) {
        console.error('启动失败:', e.message); process.exit(1);
    }
})();
