# cfst-web-panel

一个轻量、可自托管的 Cloudflare 节点测速面板。  
后端调用 `cfst` 做延迟/下载测速，前端提供实时进度、收藏管理、标签和设置管理。

## 功能概览

- 一键测速：执行 `./cfst`，解析 `result.csv` 后按速度返回结果
- 目标输入：支持批量粘贴/CSV 导入，支持 `IP` 与 `CNAME` 两种输入模式
- 实时进度：后端 `spawn` + SSE 推送，前端显示阶段（解析/Ping/下载）与百分比
- 收藏管理：支持批量收藏、删除、测速选中、标签管理
- 节点复制：收藏页支持按 `ip#地区|标签` 格式复制
- 地区识别：优先使用 `csvColo`，缺失时调用 `cdn-cgi/trace` 补齐
- 参数持久化：设置项持久化到 `database.json`
- 深色模式：支持系统/手动切换
- 纯静态前端：后端直接托管 `public/`，无需前端构建

## 在线地址

- 本地启动后访问：<http://localhost:3088>
- Termux 通常访问：<http://127.0.0.1:3088>

## 快速开始

### 方式一：一键脚本（推荐）

```bash
bash install.sh
```

脚本会自动处理：

- 环境检查（OS、架构、Node）
- 基础依赖安装
- 拉取最新代码
- 下载匹配架构的 `cfst`
- 安装依赖并启动服务

### 方式二：手动启动

1. Node.js 版本要求：`>= 16`
2. 将 `cfst` 放在项目根目录并赋权

```bash
chmod +x cfst
```

3. 安装并启动

```bash
npm install
node server.js
```

## 使用教程（建议第一次先看）

### 1. 先准备目标

- 在测速大厅粘贴 IP，或点击 `导入 CSV 提取IP`
- 默认为 IP 模式：会自动清理非 IP 内容
- 勾选 `CNAME 解析` 后可保留域名并由后端解析

### 2. 开始测速

- 点击底部 `开始测速`
- 状态面板会显示阶段、`x/y` 文案和百分比
- 结束后表格展示延迟、速度、地区、健康分、趋势

### 3. 收藏与标签

- 在测速结果中勾选节点后点击 `💾 收藏`
- 进入 `我的收藏` 可：
  - `测速选中`（对收藏 IP 重新测速并回写）
  - `🏷️ 标签`（批量设置/清空标签）
  - `🗑️ 删除`（批量删除）
  - `📋 复制`（格式：`ip#地区|标签`）

### 4. 设置推荐

- URL 预设：可直接选择官方/备用测速 URL
- 常用参数建议（手机）：
  - `n`: 48~80
  - `t`: 2
  - `dt`: 2~3
  - `dn`: 3~5
  - `TopN`: 15~20
- `恢复官方推荐`：一键恢复推荐参数并保存

## API（核心）

- `POST /api/start-test`：启动测速
- `GET /api/progress/:taskId`：SSE 进度流
- `GET /api/progress-state/:taskId`：轮询进度兜底
- `POST /api/regions`：批量补全地区
- `GET /api/saved-ips`：读取收藏
- `POST /api/save-ips`：新增/更新收藏（支持 `tag`）
- `POST /api/delete-ips`：删除收藏
- `GET /api/settings/cfst`：读取设置
- `POST /api/settings/cfst`：保存设置
- `POST /api/settings/cfst/reset`：恢复官方推荐

## 目录结构

```text
.
├── public/
│   ├── index.html
│   ├── app.js
│   └── min.js
├── server.js
├── install.sh
├── database.json         # 运行时数据（收藏/设置）
├── result.csv            # cfst 输出（运行时）
├── cfst                  # 引擎二进制（运行时）
└── saved_ips.json        # 旧版迁移源（可选）
```

## 常见问题

### 1) `git pull` 提示本地文件会被覆盖

- 常见于运行时文件（如 `database.json` / `result.csv`）被跟踪
- 已建议加入 `.gitignore` 并从 Git 索引移除：

```bash
git rm --cached database.json result.csv saved_ips.json database.sqlite 2>/dev/null || true
git add .gitignore
git commit -m "chore: ignore runtime data files"
```

### 2) 安卓/Termux 偶发后台中断

- 建议使用 `pm2` 托管并关闭系统电池优化
- 前台调试可直接 `node server.js`

### 3) 进度文案与百分比不一致

- 新版以前端 `current/total` 作为优先百分比来源
- 若后端异常退出，会显示更明确的超时/退出原因

## 注意事项

- 运行目录需有写权限（`database.json`、`result.csv`）
- 端口默认 `3088`，如需修改请调整 `server.js` 中 `PORT`
- 本项目依赖 `cfst` 可执行文件，缺失会导致测速失败
