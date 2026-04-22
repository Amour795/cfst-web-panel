const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const dns = require('dns').promises;

const app = express();
const PORT = 3088; 

// 📦 核心更新 1：引入 JSON 解析中间件（为了接收前端的收藏数据）
app.use(express.json());
app.use(cors());
app.use(express.static('public'));
const upload = multer({ storage: multer.memoryStorage() });

// --- 💾 数据库配置：持久化存储文件 ---
const DB_FILE = path.join(__dirname, 'saved_ips.json');

// 辅助函数：读取和写入 JSON 数据库
function getSavedIps() {
    if (!fs.existsSync(DB_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); } catch(e) { return []; }
}
function saveIpsToFile(ips) {
    fs.writeFileSync(DB_FILE, JSON.stringify(ips, null, 2));
}

// 📌 新增 API 1：获取所有收藏的 IP
app.get('/api/saved-ips', (req, res) => {
    res.json({ success: true, data: getSavedIps() });
});

// 📌 新增 API 2：保存优选 IP（支持批量，自动去重）
app.post('/api/save-ips', (req, res) => {
    const newIps = req.body.ips || [];
    let currentIps = getSavedIps();
    const existingIpSet = new Set(currentIps.map(item => item.ip));

    let addedCount = 0;
    newIps.forEach(item => {
        if (!existingIpSet.has(item.ip)) {
            currentIps.push(item);
            existingIpSet.add(item.ip);
            addedCount++;
        }
    });

    saveIpsToFile(currentIps);
    res.json({ success: true, added: addedCount });
});

// 📌 新增 API 3：删除收藏的 IP（支持批量）
app.post('/api/delete-ips', (req, res) => {
    const ipsToDelete = new Set(req.body.ips || []);
    let currentIps = getSavedIps();
    
    currentIps = currentIps.filter(item => !ipsToDelete.has(item.ip));
    saveIpsToFile(currentIps);
    res.json({ success: true });
});

// --- 以下为原有的测速与解析逻辑（保持不变） ---
const coloMap = {
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
                if (match && match[1]) resolve(coloMap[match[1]] || `🌐 ${match[1]}`);
                else resolve('❓ 未知');
            });
        }).on('error', () => resolve('❓ 测速节点'))
          .on('timeout', () => { req.destroy(); resolve('⏳ 超时'); });
    });
}

const globalDnsServers = [
    ['8.8.8.8', '8.8.4.4'], ['1.1.1.1', '1.0.0.1'], ['208.67.222.222', '208.67.220.220'],
    ['9.9.9.9', '149.112.112.112'], ['119.29.29.29', '223.5.5.5']
];

async function resolveTargets(targets) {
    const finalIps = new Set();
    const domains = [];
    const ipRegex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

    targets.forEach(t => { if (ipRegex.test(t)) finalIps.add(t); else domains.push(t); });

    if (domains.length > 0) {
        const promises = [];
        domains.forEach(domain => {
            globalDnsServers.forEach(servers => {
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
    const mixedRegex = /(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-zA-Z0-9][-a-zA-Z0-9]{0,62}\.)+[a-zA-Z]{2,}/g;

    if (req.file) {
        const content = req.file.buffer.toString('utf-8');
        rawTargets = [...new Set(content.match(mixedRegex) || [])];
    } else if (req.body.targetIps) {
        try { rawTargets = JSON.parse(req.body.targetIps); } catch(e) {}
    }

    let command = './cfst';
    let tempIpFile = '';

    if (rawTargets && rawTargets.length > 0) {
        const resolvedIps = await resolveTargets(rawTargets);
        if (resolvedIps.length === 0) return res.json({ success: false, msg: '输入的目标无法解析出有效 IPv4' });
        tempIpFile = path.join(__dirname, 'temp_custom_ips.txt');
        fs.writeFileSync(tempIpFile, resolvedIps.join('\n'));
        command = `./cfst -f temp_custom_ips.txt`;
    }

    exec(command, async (error) => {
        if (tempIpFile && fs.existsSync(tempIpFile)) fs.unlinkSync(tempIpFile);
        if (error) return res.status(500).json({ success: false, msg: '底层引擎执行失败' });

        const csvPath = path.join(__dirname, 'result.csv');
        if (fs.existsSync(csvPath)) {
            const csvData = fs.readFileSync(csvPath, 'utf-8');
            const lines = csvData.trim().split('\n');
            let results = [];
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i]) continue;
                const values = lines[i].split(',');
                results.push({
                    ip: values[0], loss: parseFloat(values[3]), ping: parseFloat(values[4]),
                    speed: parseFloat(values[5]), csvColo: values[6] ? values[6].replace('\r', '').trim() : null
                });
            }
            results.sort((a, b) => b.speed - a.speed);
            const topResults = results.slice(0, 50);

            const promises = topResults.map(async (item) => {
                if (item.csvColo && item.csvColo !== '' && item.csvColo !== '0.00' && item.csvColo !== '未知') {
                    item.region = coloMap[item.csvColo] || `🌐 ${item.csvColo}`;
                } else {
                    item.region = await getColo(item.ip);
                }
                return item;
            });
            await Promise.all(promises);
            res.json({ success: true, data: topResults });
        } else {
            res.status(500).json({ success: false, msg: '未找到结果文件' });
        }
    });
});

process.on('uncaughtException', (err) => console.error('\n🔥 致命错误:', err.message, '\n'));
app.listen(PORT, () => console.log(`\n🎉 全栈测速中枢 (带持久化存储) 已启动！👉 访问: http://localhost:${PORT}\n`));