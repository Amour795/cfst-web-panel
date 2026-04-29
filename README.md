# cfst-web-panel

一个面向本地与云端场景的极简、高颜值宽带优选与测速面板。\
后端基于 `Node.js + Express` 驱动 `cfst` 测速引擎，前端采用极致轻量的原生 JS + 毛玻璃（Glassmorphism）响应式 UI 设计，提供极致流畅的测速、节点管理及腾讯 DNSPod 优选 IP 同步体验。

项目地址：<https://github.com/Amour795/cfst-web-panel>

## 界面预览

![CFST Web Panel 界面预览](./docs/ui-preview.png "CFST Web Panel 界面预览")

## 上游项目与致谢

- `cfst`（CloudflareSpeedTest）原项目地址：<https://github.com/XIU2/CloudflareSpeedTest>
- 本项目**不是**测速引擎本体，而是基于 `cfst` 打造的“现代化 Web 管理控制台”。核心的`延迟/下载测速`、`结果 CSV 生成` 等底层能力均源自上游 `cfst`。
- 本项目主要提供上层能力的跨越式提升：**可视化参数配置**、**高性能节点清洗提取**、**实时任务进度（SSE 双通道）**、**本地化收藏库**、**腾讯 DNSPod 批量同步**及**全端响应式 UI**。
- 感谢上游作者与开源社区的持续维护。本项目定位为“本地/私有云运维场景的增强控制台”，是对上游命令行工具的生态补充。

## 项目背景与重构亮点

原始命令行工具虽然强大，但在日常调参、批量测试和跨设备管理时门槛较高。为了解决这些痛点，本项目进行了深度的重构与打磨：

- ✨ **极简唯美 UI**：引入 macOS 级别的高斯模糊（毛玻璃）卡片设计，配合小清新渐变色板与平滑微交互，告别枯燥的纯文本控制台。
- 📱 **H5 移动端原生级适配**：完美解决移动端与 PC 端的选择器样式冲突，支持视口边缘动态计算（防越界），无论大屏还是手机，操作都如丝般顺滑。
- 🚀 **十万级高性能清洗引擎**：重构了底层的目标提取系统，采用极严苛的脏数据清洗策略（完美过滤带端口的乱码域名），支持 10 万级目标节点的秒级无卡顿处理与流式累加。
- 🌐 **腾讯 DNSPod 无缝对接**：针对国内使用场景，将测速结果快速一键同步为腾讯 DNSPod 的 A/AAAA 解析记录。

## 核心功能

- `智能测速大厅`：支持直接粘贴、CSV 导入、远程多源拉取（支持累加防覆盖）。内置极速正则引擎，秒级提取 IPv4/IPv6。
- `全景输入模式`：支持纯 `IP` 模式与 `CNAME` 智能解析模式（自动拦截并清洗脏域名）。
- `实时进度展示`：采用 SSE + 轮询双通道架构，精确展示“解析 -> Ping -> 下载测试 -> 数据组装”全流程细节。
- `精准引擎控制`：可视化配置测速线程、丢包容忍度、上下限等进阶参数，支持一键强制终止测速任务。
- `持久化收藏夹`：支持对优质节点进行收藏、打标签、批量复测、一键复制及多维度数据对比。
- `腾讯 DNS 同步`：在线读取 DNSPod 记录，支持新增、修改 TTL/线路，以及一键全量覆盖同步优选 IP。
- `本地数据持久化`：所有设置项与收藏节点均保存在本地 `database.json` 中，断电重启不丢失配置。
- `全自动化维护`：支持在 Web 面板中一键触发 `cfst` 二进制引擎更新与官方 IP 段（IPv4/IPv6）下载同步。

## 技术架构

- **后端**：`Express 4`、`multer`、`child_process.spawn`、原生 `fetch`
- **前端**：`public/index.html + public/app.js`（零前端框架依赖，极致轻量加载）
- **存储**：基于本地 `database.json` 的轻量级数据隔离
- **引擎**：挂载项目根目录中的 `cfst` 核心二进制文件
- **UI 规范**：Apple SF Pro / PingFang 字体栈，CSS Variables 主题引擎

## 环境要求

- Node.js `>= 18`
- 操作系统：`Linux / macOS / Windows / Termux(Android)`
- 目录权限：确保项目根目录具备写权限（需要读写 `database.json` 及 `result.csv`）
- 测速组件：
  - 非 Windows 环境：确保 `./cfst` 文件存在并具有可执行权限 (`chmod +x cfst`)
  - Windows 环境：确保 `.\cfst.exe` 文件存在

## 安装与部署

### 推荐安装方式

#### Linux / macOS / Termux (一键部署)

```bash
bash -c "$(curl -fsSL [https://raw.githubusercontent.com/Amour795/cfst-web-panel/main/install.sh](https://raw.githubusercontent.com/Amour795/cfst-web-panel/main/install.sh))"
```

#### Windows 手动安装

```powershell
git clone [https://github.com/Amour795/cfst-web-panel.git](https://github.com/Amour795/cfst-web-panel.git)
cd cfst-web-panel
npm install
npm run build:min
# 下载并解压上游提供的 cfst_windows_amd64.zip，将 cfst.exe 放置到本项目根目录
node .\server.js
```

### 启动访问

- 默认监听端口：`3088`
- 若该端口被占用，服务会自动探测并尝试 `3089` 及顺延端口。
- 请在浏览器中访问终端输出的实际地址（如 `http://localhost:3088`）。

### 进程守护 (进阶)

推荐使用 `pm2` 让服务在后台长期静默运行：

```bash
npm install -g pm2
pm2 start server.js --name cfst-web-panel
pm2 save
```

## 使用说明

1. **准备测速目标**：
   在【测速】页的输入框粘贴 IP/域名，或使用面板底部的“拉取源预设”获取外部的高质量 IP 节点（勾选“累加”可合并多个源）。
2. **执行测速任务**：
   点击底部的“开始测速”。进度面板会实时滚动当前所处阶段及并发进度。结束后，列表将按最优策略返回 TopN 节点。
3. **节点筛选与收藏**：
   测速完成后，勾选速度达标的节点，点击“收藏”。在【收藏】页面可对这些长期节点打标签、做归类、或定期发起“批量复测”。
4. **同步至腾讯 DNSPod**：
   在【设置】中配置你的 `腾讯 DNSPod 域名` 及 `Token`。前往【DNS】页面，即可直观管理现有解析，或将优选出的 IP 一键发布到线上。
5. **主题与参数偏好**：
   在【设置】页中，你可以自由切换“浅色/深色/跟随系统”模式，并修改所有的测速核心参数（如下载测速大小、线程数、丢包限制等）。

## 目录结构

```text
.
├── public/
│   ├── index.html         # 前端核心页面 (响应式 UI)
│   ├── app.js             # 前端交互与通信逻辑
│   └── min.js             # 压缩后的生产级前端代码
├── server.js              # Node.js 核心后端服务
├── install.sh             # 快捷部署脚本
├── package.json
├── database.json          # 面板运行时的持久化数据库
├── result.csv             # 引擎测速完成后生成的原始结果表
├── cfst                   # Linux / macOS 核心测速组件
└── cfst.exe               # Windows 核心测速组件
```

## 运维与排障指南

- **服务启动失败 / 报错**：请检查 Node.js 版本是否达标（`>= 18`），并确认 `cfst` 文件是否存在且有运行权限。
- **测速过慢或频繁超时**：
  在设置中调大 `任务总超时(秒)` 与 `解析超时(秒)`。若路由器性能瓶颈导致断流，请适当降低 `延迟测速线程(-n)`。
- **拉取源提取出乱码 / 误判**：
  本项目已采用严格清洗模式。如果遇到无法提取的特定格式文本，请确认未误勾选 `CNAME 解析`（勾选后将放宽正则以匹配域名）。

## 开发与构建

- 开发环境启动：`node server.js`
- 生产环境构建：`npm run build:min`
- 开发模式下页面默认加载 `public/app.js`，便于断点调试。`public/min.js` 为构建压缩产物。

## 免责声明

- 本项目仅用于个人网络环境的质量测试、学习研究及本地运维自用，请严格遵守当地相关法律法规及服务条款。
- 用户应自行妥善保管 DNS API Token 等敏感凭证，因信息泄露导致的任何风险由使用者自行承担。
- 任何基于本工具发起的测速、解析变更、流量调度等行为，造成的网络波动或后果由操作人自行负责。
- 项目按“现状”开源提供，不对特定软硬件环境下的可用性、稳定性作任何形式的担保。

## 许可协议

默认遵循仓库中的许可证文件（如有补充 `LICENSE`，以该文件为准）。
