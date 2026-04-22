# cfst-web-panel

一个轻量的 Cloudflare 节点测速 Web 面板。后端通过调用 CloudflareSpeedTest（`cfst`）执行测速并解析 `result.csv`，前端提供结果展示与收藏管理，支持批量输入 IP/域名进行测试，并提供实时进度条与设置页。

## 功能特性

- 一键测速：运行 `./cfst`，解析 `result.csv` 并按下载速度排序返回 TopN
- 自定义目标：支持输入 IPv4 或域名；域名会通过多组公共 DNS 并发解析为 IPv4 后参与测速
- 实时进度条：后端使用 `spawn` 实时捕获引擎输出，通过 SSE 推送到前端展示阶段与进度（Ping / Download）
- 节点地区识别：优先使用 CSV 的 `colo` 字段，缺失时通过 `http://<ip>/cdn-cgi/trace` 推断机房
- 收藏夹：支持批量收藏/删除，服务端使用 SQLite 单文件数据库持久化（`database.sqlite`）
- 设置页：支持配置 cfst 相关参数（下载测速 URL / dt / dn / TopN）并持久化
- 黑夜模式：支持跟随系统/手动切换并记住选择
- 纯静态前端：无需构建，后端直接托管 `public/`

## 预览

启动后访问：

- <http://localhost:3088>

## 快速开始

### 方式一：一键部署（推荐）

运行脚本：

```bash
bash install.sh
```

脚本会自动完成：环境检查、拉取代码、下载匹配架构的 `cfst`、安装依赖并启动服务。启动后可在页面顶部进入「⚙️ 设置」进行外观与引擎参数配置。

### 方式二：手动运行

1. 准备环境：Node.js >= 16
2. 准备测速引擎：将 `cfst` 放到项目根目录并赋权

```bash
chmod +x cfst
```

3. 安装依赖并启动

```bash
npm install
node server.js
```

默认端口为 `3088`。

## API

- `POST /api/start-test`
  - 说明：启动测速（支持 JSON 或文件上传）
  - JSON Body：`{ "targetIps": ["ip_or_domain", "..."] }`
- 返回：`{ success: true, data: topN[] }`
- `GET /api/progress/:taskId`
  - 说明：订阅实时进度（SSE）
- `GET /api/saved-ips`
  - 说明：获取收藏列表
- `POST /api/save-ips`
  - 说明：批量收藏（自动去重）
  - Body：`{ ips: [{ ip, region, ping, speed }, ...] }`
- `POST /api/delete-ips`
  - 说明：批量删除收藏
  - Body：`{ ips: ["1.1.1.1", ...] }`
- `GET /api/settings/cfst`
  - 说明：读取 cfst 配置
- `POST /api/settings/cfst`
  - 说明：保存 cfst 配置

## 目录结构

```text
.
├── public/
│   └── index.html        # 前端页面
├── server.js             # 后端服务入口（Express）
├── install.sh            # 一键部署脚本
├── cfst                  # CloudflareSpeedTest 可执行文件（运行时需要）
├── result.csv            # cfst 输出结果（运行时生成）
├── database.sqlite       # SQLite 数据库（运行时生成）
└── saved_ips.json        # 旧版收藏数据（可选，存在时会自动迁移）
```

## 注意事项

- `cfst` 运行时会在项目目录生成 `result.csv`，请确保进程具备写入权限
- 收藏/设置数据写入 `database.sqlite`，同样需要写入权限
- 端口默认固定为 `3088`，需要修改请调整 `server.js` 中的 `PORT`
