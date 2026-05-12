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
    
    const payload = { state: 'running', message: cleanLine.replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim() };
    
    // 提取 IP 地址
    const ipv4Regex = /(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)/;
    const ipv6Regex = /(?:(?:[0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:))/;
    const ipMatch = cleanLine.match(ipv4Regex) || cleanLine.match(ipv6Regex);
    if (ipMatch) {
        payload.currentIp = ipMatch[0];
    }
    
    // 提取速度信息（支持多种单位）
    const speedRegex = /(\d+(?:\.\d+)?)\s*(MB\/s|MBps|MB\/s|kb\/s|KBps|KB\/s|mb\/s|Mbps)/i;
    const speedMatch = cleanLine.match(speedRegex);
    if (speedMatch) {
        let speed = Number(speedMatch[1]);
        const unit = speedMatch[2].toLowerCase();
        // 统一转换为 MB/s
        if (unit.includes('kb') || unit.includes('kbps')) {
            speed = speed / 1024;
        }
        payload.currentSpeed = speed.toFixed(2);
    }
    
    // 提取平均速度
    const avgSpeedRegex = /平均.*?(\d+(?:\.\d+)?)\s*(MB\/s|MBps|MB\/s|kb\/s|KBps|KB\/s|mb\/s|Mbps)/i;
    const avgSpeedMatch = cleanLine.match(avgSpeedRegex);
    if (avgSpeedMatch) {
        let avgSpeed = Number(avgSpeedMatch[1]);
        const unit = avgSpeedMatch[2].toLowerCase();
        if (unit.includes('kb') || unit.includes('kbps')) {
            avgSpeed = avgSpeed / 1024;
        }
        payload.avgSpeed = avgSpeed.toFixed(2);
    }
    
    // 提取进度比
    const ratioMatch = cleanLine.match(/(\d+)\s*\/\s*(\d+)/);
    const lower = cleanLine.toLowerCase();
    let phase = '测速中';
    if (lower.includes('ping')) phase = 'Ping 测试';
    else if (lower.includes('download') || cleanLine.includes('下载')) phase = '下载测速';
    else if (lower.includes('ip')) phase = '目标扫描';
    
    payload.phase = phase;
    
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

app.post('/api/system/fetch-bestcf', async (req, res) => {
    try {
        // 使用预定义的可靠源，不依赖页面解析
        const predefinedSources = [
            { group: 'Gslege (早中晚更新)', title: '带测速', url: 'https://bestcf.pages.dev/gslege/Cfxyz.txt' },
            { group: 'Gslege (早中晚更新)', title: '新加坡 SG', url: 'https://bestcf.pages.dev/gslege/SG.txt' },
            { group: 'Gslege (早中晚更新)', title: '德国 DE', url: 'https://bestcf.pages.dev/gslege/DE.txt' },
            { group: 'Gslege (早中晚更新)', title: '美国 US', url: 'https://bestcf.pages.dev/gslege/US.txt' },
            { group: 'Gslege (早中晚更新)', title: '荷兰 NL', url: 'https://bestcf.pages.dev/gslege/NL.txt' },
            { group: 'Gslege (早中晚更新)', title: '日本 JP', url: 'https://bestcf.pages.dev/gslege/JP.txt' },
            { group: '天诚 (多地区)', title: '多地区全量版', url: 'https://bestcf.pages.dev/tiancheng/all.txt' },
            { group: '天诚 (多地区)', title: '多地区迷你版', url: 'https://bestcf.pages.dev/tiancheng/mini.txt' },
            { group: '天诚 (多地区)', title: '中国香港 HK', url: 'https://bestcf.pages.dev/tiancheng/hk.txt' },
            { group: '天诚 (多地区)', title: '新加坡 SG', url: 'https://bestcf.pages.dev/tiancheng/sg.txt' },
            { group: '天诚 (多地区)', title: '日本 JP', url: 'https://bestcf.pages.dev/tiancheng/jp.txt' },
            { group: '天诚 (多地区)', title: '中国台湾 TW', url: 'https://bestcf.pages.dev/tiancheng/tw.txt' },
            { group: '天诚 (多地区)', title: '韩国 KR', url: 'https://bestcf.pages.dev/tiancheng/kr.txt' },
            { group: '天诚 (多地区)', title: '美国 US', url: 'https://bestcf.pages.dev/tiancheng/us.txt' },
            { group: '天诚 2 (多地区)', title: '多地区全量版', url: 'https://bestcf.pages.dev/tiancheng2/all.txt' },
            { group: '天诚 2 (多地区)', title: '多地区迷你版', url: 'https://bestcf.pages.dev/tiancheng2/mini.txt' },
            { group: '天诚 2 (多地区)', title: '中国香港 HK', url: 'https://bestcf.pages.dev/tiancheng2/hk.txt' },
            { group: '天诚 2 (多地区)', title: '新加坡 SG', url: 'https://bestcf.pages.dev/tiancheng2/sg.txt' },
            { group: '天诚 2 (多地区)', title: '美国 US', url: 'https://bestcf.pages.dev/tiancheng2/us.txt' },
            { group: 'Mia (每半小时更新)', title: '老链接不变', url: 'https://bestcf.pages.dev/xinyitang3/ipv4.txt' },
            { group: 'Mia (每半小时更新)', title: '备用链接', url: 'https://raw.githubusercontent.com/xinyitang3/extract_ips/refs/heads/master/ip.txt' },
            { group: 'WeTest (每半小时更新)', title: '分三网', url: 'https://bestcf.pages.dev/wetest/ipv4.txt' },
            { group: 'V2SSR (每半小时更新)', title: '三网带测速', url: 'https://bestcf.pages.dev/v2rayssr/all.txt' },
            { group: 'MoistR (每日更新)', title: 'MIX', url: 'https://bestcf.pages.dev/moistr/all.txt' },
            { group: 'vvHan (每小时更新)', title: 'IPv4', url: 'https://bestcf.pages.dev/vvhan/ipv4.txt' },
            { group: 'NiREvil (每天更新)', title: 'IPv4', url: 'https://bestcf.pages.dev/nirevil/ipv4.txt' },
            { group: 'MingYu (每半小时更新)', title: 'IPv4', url: 'https://bestcf.pages.dev/mingyu/ipv4.txt' },
            { group: 'MingYu (每半小时更新)', title: 'IPv4 单IP', url: 'https://bestcf.pages.dev/mingyu/ipv4-onlyip.txt' },
            { group: 'ZhiXuan (每半小时更新)', title: 'IPv4 单IP', url: 'https://bestcf.pages.dev/zhixuanwang/ipv4-onlyip.txt' },
            { group: 'CM (实时更新)', title: '三网 200', url: 'https://090227.pages.dev/bestcf?isp=all&ips=200' },
            { group: 'CM (实时更新)', title: '电信 200', url: 'https://090227.pages.dev/bestcf?isp=ct&ips=200' },
            { group: 'CM (实时更新)', title: '联通 200', url: 'https://090227.pages.dev/bestcf?isp=cu&ips=200' },
            { group: 'CM (实时更新)', title: '移动 200', url: 'https://090227.pages.dev/bestcf?isp=cmcc&ips=200' }
        ];
        
        // 去重
        const seen = new Set();
        const groupsMap = new Map();
        for (const item of predefinedSources) {
            const key = item.url.trim();
            if (seen.has(key)) continue;
            seen.add(key);
            const g = item.group || '未分组';
            if (!groupsMap.has(g)) groupsMap.set(g, []);
            groupsMap.get(g).push({ title: item.title, url: item.url });
        }
        const grouped = Array.from(groupsMap.entries()).map(([group, items]) => ({ group, items }));

        await setSetting('bestcf_sources', JSON.stringify(grouped));
        res.json({ success: true, count: predefinedSources.length, data: grouped });
    } catch (e) {
        res.json({ success: false, msg: '同步失败: ' + e.message });
    }
});

app.get('/api/settings/bestcf-sources', async (req, res) => {
    try {
        const raw = await getSetting('bestcf_sources');
        let data = raw ? JSON.parse(raw) : [];
        res.json({ success: true, data: Array.isArray(data) ? data : [] });
    } catch (e) {
        res.json({ success: false, data: [] });
    }
});

app.post('/api/system/fetch-bestcf-all', async (req, res) => {
    try {
        // 先同步最新的源列表
        const syncUrl = `http://127.0.0.1:${process.env.PORT || DEFAULT_PORT}/api/system/fetch-bestcf`;
        await fetch(syncUrl, { method: 'POST' }).then(r => r.json()).catch(() => null);
        
        // 从数据库获取最新源
        const raw = await getSetting('bestcf_sources');
        const groups = raw ? JSON.parse(raw) : [];
        const urls = [];
        groups.forEach(g => (g.items || []).forEach(it => { if (it?.url && it.url.startsWith('http')) urls.push(it.url); }));
        const uniq = Array.from(new Set(urls));
        if (!uniq.length) return res.json({ success: false, msg: '无可用源' });

        // 默认只返回 IPv4，不需要 IPv6
        const v4Only = true;

        const results = [];
        const errors = [];
        const limit = 40; // 增加并发数以获取更多 IP
        let idx = 0;
        async function worker() {
            while (idx < uniq.length) {
                const current = uniq[idx++];
                try {
                    const r = await fetch(current, { headers: { 'User-Agent': 'cfst-web-panel/1.0' }, signal: AbortSignal.timeout(20000) });
                    if (!r.ok) { errors.push(current); continue; }
                    const text = (await r.text()).slice(0, 2 * 1024 * 1024);
                    results.push(text);
                } catch { errors.push(current); }
            }
        }
        await Promise.all(Array.from({ length: Math.min(limit, uniq.length) }).map(worker));
        
        const lines = new Set();
        const ipv4Exact = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
        
        // 更强大的 IP 提取逻辑
        const ipRegex = /((?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)/g;
        
        results.join('\n').split(/\r?\n/).forEach(l => { 
            let s = String(l || '').trim(); 
            if (!s) return;
            
            // 从整行中提取所有可能的 IPv4 地址
            const matches = s.match(ipRegex);
            if (matches) {
                matches.forEach(ip => {
                    if (ipv4Exact.test(ip)) {
                        lines.add(ip);
                    }
                });
            }
        });
        const merged = Array.from(lines).join('\n');
        res.json({ success: true, sources: uniq.length, ok: results.length, failed: errors.length, data: merged, lines: lines.size, v4Only });
    } catch (e) {
        res.json({ success: false, msg: '聚合失败: ' + e.message });
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

// --- 腾讯 DNSPod 设置 ---
const DNSPOD_LINE_MAP = {
    default: '默认',
    telecom: '电信',
    unicom: '联通',
    mobile: '移动'
};

function normalizeDnsLine(line) {
    const v = String(line || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(DNSPOD_LINE_MAP, v) ? v : 'default';
}

function lineLabelToKey(lineLabel) {
    const label = String(lineLabel || '').trim();
    if (label === '电信') return 'telecom';
    if (label === '联通') return 'unicom';
    if (label === '移动') return 'mobile';
    return 'default';
}

function normalizeDnsToken(token) {
    // 兼容中文逗号和空格: 12345，abcdef -> 12345,abcdef
    return String(token || '').trim().replace(/，/g, ',').replace(/\s+/g, '');
}

function composeDnsToken(tokenId, tokenKey, rawToken) {
    const raw = normalizeDnsToken(rawToken);
    if (raw.includes(',')) return raw;
    const idRaw = normalizeDnsToken(tokenId);
    if (idRaw.includes(',')) return idRaw;
    const key = normalizeDnsToken(tokenKey);
    if (key.includes(',')) return key;
    const id = idRaw;
    if (id && key) return normalizeDnsToken(`${id},${key}`);
    return raw || key || id;
}

function isTencentCloudSecretCredential(cfg) {
    return String(cfg?.tokenId || '').startsWith('AKID') && String(cfg?.tokenKey || '').length >= 16;
}

function tc3Sign(secretKey, date, service, strToSign) {
    const secretDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest();
    const secretService = crypto.createHmac('sha256', secretDate).update(service).digest();
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
    return crypto.createHmac('sha256', secretSigning).update(strToSign).digest('hex');
}

function parseDnsTarget(fullDomain) {
    const value = String(fullDomain || '').trim().replace(/\.+$/, '').toLowerCase();
    if (!value) return null;
    const parts = value.split('.').filter(Boolean);
    if (parts.length < 2) return null;
    return {
        domain: parts.slice(-2).join('.'),
        subDomain: parts.slice(0, -2).join('.') || '@',
        fullDomain: value
    };
}

async function resolveDnsTargetSmart(fullDomain) {
    const value = String(fullDomain || '').trim().replace(/\.+$/, '').toLowerCase();
    const parts = value.split('.').filter(Boolean);
    if (parts.length < 2) throw new Error('域名格式无效，请输入完整子域名');

    // 从 i=0 开始，支持直接填写根域（如 sikt.club => domain=sikt.club, sub=@）
    // 同时兼容多级后缀（如 a.b.example.com.cn）。
    for (let i = 0; i <= parts.length - 2; i++) {
        const domain = parts.slice(i).join('.');
        if (domain.split('.').length < 2) continue;
        const subDomain = parts.slice(0, i).join('.') || '@';
        try {
            const list = await requestDnsPod('Record.List', {
                domain,
                sub_domain: subDomain,
                length: 1
            });
            if (isDnsPodSuccess(list)) return { domain, subDomain, fullDomain: value };
        } catch (_) {}
    }
    throw new Error('无法识别主域名：请确认完整子域名填写正确，且 Token 对该主域有读写权限');
}

async function getDnsApiConfig() {
    const raw = await getSetting('dns_api');
    if (raw) {
        const parsed = JSON.parse(raw);
        const tokenId = String(parsed.tokenId || '').trim();
        const tokenKey = String(parsed.tokenKey || '').trim();
        const mergedToken = composeDnsToken(tokenId, tokenKey, parsed.token);
        let tcId = tokenId;
        let tcKey = tokenKey;
        if ((!tcId || !tcKey) && mergedToken.includes(',')) {
            const [a, b] = mergedToken.split(',');
            if (String(a || '').startsWith('AKID') && b) {
                tcId = tcId || String(a).trim();
                tcKey = tcKey || String(b).trim();
            }
        }
        return {
            provider: 'dnspod',
            domain: String(parsed.domain || '').trim(),
            tokenId: tcId,
            tokenKey: tcKey,
            token: mergedToken,
            line: normalizeDnsLine(parsed.line)
        };
    }
    const legacyRaw = await getSetting('cf_api');
    if (!legacyRaw) return null;
    const legacy = JSON.parse(legacyRaw);
    return {
        provider: 'dnspod',
        domain: String(legacy.domain || '').trim(),
        tokenId: '',
        tokenKey: '',
        token: normalizeDnsToken(legacy.token),
        line: 'default'
    };
}

async function resolveDnsTarget(cfg) {
    const value = String(cfg?.domain || '').trim().replace(/\.+$/, '').toLowerCase();
    const parts = value.split('.').filter(Boolean);
    if (parts.length < 2) throw new Error('域名格式无效，请输入完整子域名');

    // 常见中国二级后缀，避免把 example.com.cn 错判为 com.cn
    const cn2ld = new Set(['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn']);
    const tail2 = parts.slice(-2).join('.');
    const useLast3 = cn2ld.has(tail2) && parts.length >= 3;
    const domain = useLast3 ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
    const subDomain = useLast3 ? (parts.slice(0, -3).join('.') || '@') : (parts.slice(0, -2).join('.') || '@');
    return { domain, subDomain, fullDomain: value };
}

async function requestDnsPod(action, params = {}) {
    const cfg = await getDnsApiConfig();
    if (isTencentCloudSecretCredential(cfg)) {
        const host = 'dnspod.tencentcloudapi.com';
        const service = 'dnspod';
        const version = '2021-03-23';
        const actionMap = {
            'Record.List': 'DescribeRecordList',
            'Record.Create': 'CreateRecord',
            'Record.Remove': 'DeleteRecord',
            'Record.Modify': 'ModifyRecord'
        };
        const tcAction = actionMap[action];
        if (!tcAction) throw new Error(`不支持的 DNS 动作: ${action}`);

        let payload = {};
        if (tcAction === 'DescribeRecordList') {
            payload = {
                Domain: String(params.domain || ''),
                Subdomain: String(params.sub_domain || '@'),
                Limit: Math.min(3000, Math.max(1, Number(params.length) || 100))
            };
        } else if (tcAction === 'CreateRecord') {
            payload = {
                Domain: String(params.domain || ''),
                SubDomain: String(params.sub_domain || '@'),
                RecordType: String(params.record_type || 'A'),
                RecordLine: String(params.record_line || '默认'),
                Value: String(params.value || ''),
                TTL: Number(params.ttl || 600)
            };
        } else if (tcAction === 'DeleteRecord') {
            payload = {
                Domain: String(params.domain || ''),
                RecordId: Number(params.record_id)
            };
        } else if (tcAction === 'ModifyRecord') {
            payload = {
                Domain: String(params.domain || ''),
                RecordId: Number(params.record_id),
                SubDomain: String(params.sub_domain || '@'),
                RecordType: String(params.record_type || 'A'),
                RecordLine: String(params.record_line || '默认'),
                Value: String(params.value || ''),
                TTL: Number(params.ttl || 600)
            };
        }

        const timestamp = Math.floor(Date.now() / 1000);
        const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
        const requestPayload = JSON.stringify(payload);
        const hashedRequestPayload = crypto.createHash('sha256').update(requestPayload).digest('hex');
        const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${tcAction.toLowerCase()}\n`;
        const signedHeaders = 'content-type;host;x-tc-action';
        const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;
        const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
        const credentialScope = `${date}/${service}/tc3_request`;
        const strToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
        const signature = tc3Sign(cfg.tokenKey, date, service, strToSign);
        const authorization = `TC3-HMAC-SHA256 Credential=${cfg.tokenId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        const res = await fetch(`https://${host}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                Host: host,
                Authorization: authorization,
                'X-TC-Action': tcAction,
                'X-TC-Version': version,
                'X-TC-Timestamp': String(timestamp)
            },
            body: requestPayload
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`腾讯云 DNS HTTP ${res.status}`);
        let data = null;
        try { data = JSON.parse(text); } catch (_) { throw new Error('腾讯云 DNS 返回非 JSON 数据'); }
        if (data?.Response?.Error) throw new Error(data.Response.Error.Message || data.Response.Error.Code || '腾讯云 DNS 请求失败');

        if (tcAction === 'DescribeRecordList') {
            const list = Array.isArray(data?.Response?.RecordList) ? data.Response.RecordList : [];
            return {
                status: { code: '1' },
                records: list.map(r => ({ id: r.RecordId, value: r.Value, type: r.Type, line: r.Line, ttl: r.TTL }))
            };
        }
        return { status: { code: '1' } };
    }

    if (!cfg?.token) throw new Error('未配置腾讯 DNS Token');
    const body = new URLSearchParams({
        login_token: cfg.token,
        format: 'json',
        lang: 'cn',
        error_on_empty: 'no'
    });
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) body.set(key, String(value));
    }
    const res = await fetch(`https://dnsapi.cn/${action}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'cfst-web-panel/1.0'
        },
        body
    });
    const text = await res.text();
    if (!res.ok) {
        if (res.status === 401) throw new Error('DNSPod HTTP 401（Token 无效或格式错误，请检查 Token ID/Token）');
        throw new Error(`DNSPod HTTP ${res.status}`);
    }
    let data = null;
    try {
        data = JSON.parse(text);
    } catch (_) {
        throw new Error('DNSPod 返回非 JSON 数据');
    }
    return data;
}

function isDnsPodSuccess(data) {
    return String(data?.status?.code || '') === '1';
}

app.get('/api/settings/cf', async (req, res) => {
    try {
        const cfg = await getDnsApiConfig();
        res.json({ success: true, data: cfg || {} });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/settings/cf', async (req, res) => {
    try {
        const old = await getDnsApiConfig();
        const tokenId = String(req.body?.tokenId || '').trim();
        const tokenKey = String(req.body?.tokenKey || '').trim();
        const mergedToken = composeDnsToken(tokenId, tokenKey, req.body?.token);
        const payload = {
            provider: 'dnspod',
            domain: String(req.body?.domain || '').trim(),
            tokenId,
            tokenKey,
            token: mergedToken,
            line: normalizeDnsLine(req.body?.line || old?.line || 'default')
        };
        await setSetting('dns_api', JSON.stringify(payload));
        res.json({ success: true, data: payload });
    }
    catch (e) { res.json({ success: false }); }
});

app.get('/api/cf/dns', async (req, res) => {
    try {
        const cfg = await getDnsApiConfig();
        if (!cfg?.domain || !cfg?.token) {
            return res.json({ success: true, data: [], msg: '未配置腾讯 DNS，先到设置页保存即可' });
        }
        let target = null;
        try {
            target = await resolveDnsTarget(cfg);
        } catch (e) {
            return res.json({ success: true, data: [], msg: e.message || '主域识别失败，请先到设置页完善' });
        }

        const data = await requestDnsPod('Record.List', {
            domain: target.domain,
            sub_domain: target.subDomain,
            length: 3000
        });
        if (!isDnsPodSuccess(data)) {
            return res.json({ success: false, msg: `腾讯 DNS 请求失败: ${data?.status?.message || '未知错误'}` });
        }
        const records = (data.records || [])
            .filter(r => r.type === 'A' || r.type === 'AAAA')
            .map(r => ({
                id: r.id,
                content: r.value,
                type: r.type,
                line: r.line,
                ttl: r.ttl
            }));
        res.json({ success: true, data: records });
    } catch (e) { res.status(500).json({ success: false, msg: `腾讯 DNS 请求失败: ${e.message}` }); }
});

app.post('/api/cf/dns/add', async (req, res) => {
    try {
        const { ip } = req.body;
        const cfg = await getDnsApiConfig();
        if (!cfg?.domain || !cfg?.token) return res.json({ success: false, msg: '请先完成腾讯 DNS 设置' });
        const target = await resolveDnsTarget(cfg);
        const type = String(ip || '').includes(':') ? 'AAAA' : 'A';
        const line = normalizeDnsLine(req.body?.line || cfg.line);
        const result = await requestDnsPod('Record.Create', {
            domain: target.domain,
            sub_domain: target.subDomain,
            record_type: type,
            record_line: DNSPOD_LINE_MAP[line],
            value: String(ip || '').trim(),
            ttl: 600
        });
        res.json({ success: isDnsPodSuccess(result), msg: result?.status?.message });
    } catch (e) { res.status(500).json({ success: false, msg: e.message }); }
});

app.delete('/api/cf/dns/:id', async (req, res) => {
    try {
        const recordId = req.params.id;
        const cfg = await getDnsApiConfig();
        if (!cfg?.domain || !cfg?.token) return res.json({ success: false, msg: '请先完成腾讯 DNS 设置' });
        const target = await resolveDnsTarget(cfg);
        const result = await requestDnsPod('Record.Remove', {
            domain: target.domain,
            record_id: recordId
        });
        res.json({ success: isDnsPodSuccess(result), msg: result?.status?.message });
    } catch (e) { res.status(500).json({ success: false, msg: e.message }); }
});

app.post('/api/cf/dns/:id/update', async (req, res) => {
    try {
        const recordId = req.params.id;
        const cfg = await getDnsApiConfig();
        if (!cfg?.domain || !cfg?.token) return res.json({ success: false, msg: '请先完成腾讯 DNS 设置' });
        const target = await resolveDnsTarget(cfg);

        const value = String(req.body?.ip || '').trim();
        if (!value) return res.json({ success: false, msg: 'IP 不能为空' });
        const lineKey = normalizeDnsLine(req.body?.line || cfg.line);
        const type = value.includes(':') ? 'AAAA' : 'A';
        const result = await requestDnsPod('Record.Modify', {
            domain: target.domain,
            record_id: recordId,
            sub_domain: target.subDomain,
            record_type: type,
            record_line: DNSPOD_LINE_MAP[lineKey],
            value,
            ttl: 600
        });
        res.json({ success: isDnsPodSuccess(result), msg: result?.status?.message });
    } catch (e) {
        res.status(500).json({ success: false, msg: e.message });
    }
});

app.post('/api/cf/dns/sync', async (req, res) => {
    try {
        const { ips, line, records, replaceAll } = req.body || {};
        const cfg = await getDnsApiConfig();
        if (!cfg?.domain || !cfg?.token) return res.json({ success: false, msg: '未配置腾讯 DNS 信息' });
        const target = await resolveDnsTarget(cfg);

        const curr = await requestDnsPod('Record.List', {
            domain: target.domain,
            sub_domain: target.subDomain,
            length: 3000
        });
        if (!isDnsPodSuccess(curr)) {
            return res.json({ success: false, msg: curr?.status?.message || '读取现有记录失败' });
        }
        
        const existingRecords = (curr.records || []).filter(r => r.type === 'A' || r.type === 'AAAA');
        const existing = new Set(existingRecords.map(r => `${String(r.value || '').trim()}|${String(r.type || 'A')}|${lineLabelToKey(r.line)}`));

        let added = 0;
        let skipped = 0;
        const baseLine = normalizeDnsLine(line || cfg.line);
        const normalizedRecords = Array.isArray(records)
            ? records.map(item => {
                const value = String(item?.value || item?.ip || '').trim();
                const type = String(item?.type || (value.includes(':') ? 'AAAA' : 'A')).toUpperCase() === 'AAAA' ? 'AAAA' : 'A';
                const lineKey = normalizeDnsLine(item?.line || baseLine);
                return { value, type, lineKey, ttl: Number(item?.ttl) || 600 };
            }).filter(r => r.value)
            : (Array.isArray(ips) ? ips.map(ip => {
                const value = String(ip || '').trim();
                const type = value.includes(':') ? 'AAAA' : 'A';
                return { value, type, lineKey: baseLine, ttl: 600 };
            }).filter(r => r.value) : []);

        let deleted = 0;

        if (replaceAll) {
            // 先处理更新和新增
            for (const rec of normalizedRecords) {
                const { value, type, lineKey, ttl } = rec;
                const existingMatch = existingRecords.find(er => 
                    er.value === value && 
                    er.type === type && 
                    lineLabelToKey(er.line) === lineKey
                );
                
                if (existingMatch) {
                    if (Number(existingMatch.ttl) !== Number(ttl)) {
                        try {
                            await requestDnsPod('Record.Modify', {
                                domain: target.domain,
                                record_id: existingMatch.id,
                                sub_domain: target.subDomain,
                                record_type: type,
                                record_line: DNSPOD_LINE_MAP[lineKey],
                                value,
                                ttl
                            });
                            added++; // 算作更新成功
                        } catch(e) {}
                    } else {
                        skipped++;
                    }
                } else {
                    try {
                        const addRes = await requestDnsPod('Record.Create', {
                            domain: target.domain,
                            sub_domain: target.subDomain,
                            record_type: type,
                            record_line: DNSPOD_LINE_MAP[lineKey],
                            value,
                            ttl
                        });
                        if (isDnsPodSuccess(addRes)) added++;
                    } catch(e) {}
                }
            }

            // 处理删除：线上存在，但不在当前提交列表中的记录
            for (const er of existingRecords) {
                const erLineKey = lineLabelToKey(er.line);
                const stillExists = normalizedRecords.find(r => 
                    r.value === er.value && 
                    r.type === er.type && 
                    r.lineKey === erLineKey
                );
                
                if (!stillExists) {
                    try {
                        const delRes = await requestDnsPod('Record.Remove', {
                            domain: target.domain,
                            record_id: er.id
                        });
                        if (isDnsPodSuccess(delRes)) deleted++;
                    } catch(e) {}
                }
            }
        } else {
            // 原有的追加逻辑
            for (const rec of normalizedRecords) {
                const { value, type, lineKey, ttl } = rec;
                const key = `${value}|${type}|${lineKey}`;
                if (existing.has(key)) {
                    skipped++;
                    continue;
                }
                const addRes = await requestDnsPod('Record.Create', {
                    domain: target.domain,
                    sub_domain: target.subDomain,
                    record_type: type,
                    record_line: DNSPOD_LINE_MAP[lineKey],
                    value,
                    ttl
                });
                if (isDnsPodSuccess(addRes)) {
                    added++;
                    existing.add(key);
                }
            }
        }
        
        res.json({ success: true, added, skipped, deleted });
    } catch (e) { res.status(500).json({ success: false, msg: `同步解析失败: ${e.message}` }); }
});

// --- DNS 候选 IP 暂存（由测速/收藏页提交，DNS 页手动发布） ---
    app.get('/api/dns/staging', async (req, res) => {
        try {
            const raw = await getSetting('dns_staging');
            let records = [];
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    if (parsed.length && typeof parsed[0] === 'string') {
                        records = parsed.map(v => {
                            const value = String(v || '').trim();
                            return { type: value.includes(':') ? 'AAAA' : 'A', line: 'default', value, ttl: 600 };
                        }).filter(r => r.value);
                    } else {
                        records = parsed.map(item => {
                            const value = String(item?.value || item?.ip || '').trim();
                            const type = String(item?.type || (value.includes(':') ? 'AAAA' : 'A')).toUpperCase() === 'AAAA' ? 'AAAA' : 'A';
                            const line = normalizeDnsLine(item?.line);
                            return { type, line, value, ttl: Number(item?.ttl) || 600 };
                        }).filter(r => r.value);
                    }
                }
            }
            const uniq = [];
            const seen = new Set();
            for (const r of records) {
                const k = `${r.type}|${r.line}|${r.value}`;
                if (seen.has(k)) continue;
                seen.add(k);
                uniq.push(r);
            }
            res.json({ success: true, data: uniq });
        } catch (e) {
            res.json({ success: false, msg: '读取候选记录失败' });
        }
    });

    app.post('/api/dns/staging', async (req, res) => {
        try {
            const incomingRecords = Array.isArray(req.body?.records) ? req.body.records : [];
            const incomingIps = Array.isArray(req.body?.ips) ? req.body.ips : [];
            const normalized = [];
            for (const item of incomingRecords) {
                const value = String(item?.value || item?.ip || '').trim();
                if (!value) continue;
                const type = String(item?.type || (value.includes(':') ? 'AAAA' : 'A')).toUpperCase() === 'AAAA' ? 'AAAA' : 'A';
                const line = normalizeDnsLine(item?.line);
                normalized.push({ type, line, value, ttl: Number(item?.ttl) || 600 });
            }
            for (const ip of incomingIps) {
                const value = String(ip || '').trim();
                if (!value) continue;
                normalized.push({ type: value.includes(':') ? 'AAAA' : 'A', line: normalizeDnsLine(req.body?.line), value, ttl: 600 });
            }
            if (!normalized.length) return res.json({ success: false, msg: '没有可暂存的记录' });
    
            const oldRaw = await getSetting('dns_staging');
            let old = [];
            if (oldRaw) {
                try {
                    const parsed = JSON.parse(oldRaw);
                    if (Array.isArray(parsed)) {
                        old = parsed.map(item => {
                            const value = String(item?.value || item?.ip || item || '').trim();
                            if (!value) return null;
                            const type = String(item?.type || (value.includes(':') ? 'AAAA' : 'A')).toUpperCase() === 'AAAA' ? 'AAAA' : 'A';
                            const line = normalizeDnsLine(item?.line);
                            return { type, line, value, ttl: Number(item?.ttl) || 600 };
                        }).filter(Boolean);
                    }
                } catch (_) {}
            }
            const merged = [];
            const seen = new Set();
            for (const r of [...old, ...normalized]) {
                const k = `${r.type}|${r.line}|${r.value}`;
                if (seen.has(k)) continue;
                seen.add(k);
                merged.push(r);
            }
            await setSetting('dns_staging', JSON.stringify(merged));
            res.json({ success: true, data: merged, added: normalized.length, total: merged.length });
        } catch (e) {
            res.json({ success: false, msg: '暂存失败' });
        }
    });

    app.put('/api/dns/staging', async (req, res) => {
        try {
            const incoming = Array.isArray(req.body?.records) ? req.body.records : [];
            const normalized = incoming.map(item => {
                const value = String(item?.value || item?.ip || '').trim();
                if (!value) return null;
                const type = String(item?.type || (value.includes(':') ? 'AAAA' : 'A')).toUpperCase() === 'AAAA' ? 'AAAA' : 'A';
                const line = normalizeDnsLine(item?.line);
                return { type, line, value, ttl: Number(item?.ttl) || 600 };
            }).filter(Boolean);
            await setSetting('dns_staging', JSON.stringify(normalized));
            res.json({ success: true, data: normalized });
        } catch (e) {
            res.json({ success: false, msg: '保存候选记录失败' });
        }
    });

app.delete('/api/dns/staging', async (req, res) => {
    try {
        await setSetting('dns_staging', JSON.stringify([]));
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, msg: '清空候选失败' });
    }
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
        
        const getNum = (val, min, max, def) => {
            if (val === null || val === undefined || val === '') return def;
            const n = Number(val);
            if (!Number.isFinite(n)) return def;
            return Math.max(min, Math.min(max, n));
        };

        return {
            n: getNum(parsed.n, 1, 1000, defaults.n),
            t: getNum(parsed.t, 1, 20, defaults.t),
            tp: getNum(parsed.tp, 1, 65535, defaults.tp),
            url: typeof parsed.url === 'string' && parsed.url.trim() ? parsed.url.trim() : defaults.url,
            mode,
            httpingCode: getNum(parsed.httpingCode, 100, 599, defaults.httpingCode),
            cfcolo: cfcoloNormalized,
            dt: getNum(parsed.dt, 1, 30, defaults.dt),
            dn: getNum(parsed.dn, 1, 50, defaults.dn),
            dnSingle: getNum(parsed.dnSingle, 1, 10, defaults.dnSingle),
            tl: getNum(parsed.tl, 0, 9999, defaults.tl),
            tll: getNum(parsed.tll, 0, 9999, defaults.tll),
            tlr: getNum(parsed.tlr, 0, 1, defaults.tlr),
            sl: getNum(parsed.sl, 0, 9999, defaults.sl),
            disableDownload: Boolean(parsed.disableDownload),
            allip: Boolean(parsed.allip),
            debug: Boolean(parsed.debug),
            topN: getNum(parsed.topN, 1, 200, defaults.topN),
            parseTimeoutSec: getNum(parsed.parseTimeoutSec, 1, 300, defaults.parseTimeoutSec),
            totalTimeoutSec: getNum(parsed.totalTimeoutSec, 1, 3600, defaults.totalTimeoutSec)
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
        
        let resolved = false;
        let pending = 2;
        
        const done = (result) => {
            if (resolved) return;
            if (result) {
                resolved = true;
                resolve(result);
            } else {
                pending--;
                if (pending === 0) resolve('❓ 超时/失败');
            }
        };

        const makeReq = (mod, url, opts) => {
            const req = mod.get(url, opts, (res) => {
                let data = ''; 
                res.on('data', (c) => data += c);
                res.on('end', () => {
                    const match = data.match(/colo=([A-Z]+)/);
                    if (match && match[1]) done(cfColoMap[match[1]] || `🌐 ${match[1]}`); 
                    else done(null);
                });
            });
            req.on('error', () => done(null));
            req.on('timeout', () => { try { req.destroy(); } catch {} done(null); });
        };

        makeReq(http, `http://${urlIp}/cdn-cgi/trace`, { timeout: 2000, headers });
        makeReq(https, `https://${urlIp}/cdn-cgi/trace`, { timeout: 2500, headers, rejectUnauthorized: false, servername: 'speed.cloudflare.com' });
    });
}

async function getColoCached(ip) {
    const key = String(ip || '').trim();
    if (!key) return '❓ 未知';
    const cache = coloCache.get(key);
    const now = Date.now();
    if (cache && cache.expireAt > now) return cache.region;
    const region = await getColo(key);
    coloCache.set(key, { region, expireAt: now + (region.includes('超时') || region.includes('失败') || region.includes('未知') ? 60000 : 86400000) });
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

    args.push('-o', `result_${taskId}.csv`);

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
        // cfst 如果是 IPv6 会在命令行自动识别，但由于逗号分割可能解析异常，并且 Android Termux 下参数长度受限容易导致 E2BIG 错误，这里改用文件传递
        fs.writeFileSync(path.join(__dirname, `ip_${taskId}.txt`), finalIps.join('\n'), 'utf-8');
        args.push('-f', `ip_${taskId}.txt`, '-url', cfstConfig.url, '-dt', String(cfstConfig.dt), '-dn', String(finalIps.length <= 1 ? cfstConfig.dnSingle : cfstConfig.dn));
    } else {
        args.push('-url', cfstConfig.url, '-dt', String(cfstConfig.dt), '-dn', String(cfstConfig.dn));
    }

    let replied = false;
    const finish = (code, msg, phase, data = null) => {
        if (replied) return; replied = true;
        try { fs.unlinkSync(path.join(__dirname, `ip_${taskId}.txt`)); } catch (e) {}
        try { fs.unlinkSync(path.join(__dirname, `result_${taskId}.csv`)); } catch (e) {}
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

        const csvPath = path.join(__dirname, `result_${taskId}.csv`);
        if (!fs.existsSync(csvPath)) return finish(500, '未找到结果文件', '解析失败');
        
        sendProgress(taskId, { state: 'running', phase: '结果解析', message: '正在解析...' });
        const results = fs.readFileSync(csvPath, 'utf-8').trim().split('\n').slice(1).map(l => {
            const v = l.split(','); return { ip: v[0], loss: parseFloat(v[3]), ping: parseFloat(v[4]), speed: parseFloat(v[5]), csvColo: v[6]?.replace('\r','').trim() };
        }).filter(r => !inputIps || inputIps.has(r.ip));
        
        if (cfstConfig.disableDownload) results.sort((a,b) => (a.ping||999) - (b.ping||999)); else results.sort((a,b) => (b.speed||-1) - (a.speed||-1));
        
        const top = results.slice(0, cfstConfig.topN).map(item => ({ ...item, ...computeDelta(item.ip, item.ping, item.speed) }));
        
        const pending = [];
        top.forEach(i => { if (i.csvColo && i.csvColo !== '0.00' && i.csvColo !== 'N/A') i.region = cfColoMap[i.csvColo] || `🌐 ${i.csvColo}`; else { i.region = '⏳'; pending.push(i.ip); } });
        
        if (pending.length > 0) {
            sendProgress(taskId, { state: 'running', phase: '地区识别', message: `正在补充获取 ${pending.length} 个节点的地区...` });
            await mapWithConcurrency([...new Set(pending)], 20, async ip => {
                const region = await getColoCached(ip);
                top.forEach(item => {
                    if (item.ip === ip) item.region = region;
                });
            });
        }
        
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
