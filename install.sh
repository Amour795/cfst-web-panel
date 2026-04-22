#!/bin/bash

# ==========================================
# CF-SpeedTest-Web 全平台智能一键部署脚本
# ==========================================

GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
BLUE='\033[1;34m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}  🚀 欢迎使用 CF-SpeedTest 全平台智能部署中枢  ${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# 1. 核心模块：智能系统与 CPU 架构探针
OS="$(uname -s)"
ARCH="$(uname -m)"
IS_TERMUX=false

echo -e "${YELLOW}[1/5] 正在执行系统环境级嗅探...${NC}"

if [ -n "$TERMUX_VERSION" ]; then
    OS="Android"
    IS_TERMUX=true
    echo -e "✅ 识别到设备: ${GREEN}Android 手机 (Termux 极客环境)${NC}"
elif [ "$OS" == "Darwin" ]; then
    # 区分 Mac 和 iOS 终端 (如 a-Shell)
    if [[ "$ARCH" == *"iPhone"* || "$ARCH" == *"iPad"* ]]; then
        echo -e "❌ 识别到设备: ${RED}Apple iOS / iPadOS${NC}"
        echo -e "${YELLOW}⚠️ 架构受限：苹果沙盒机制严禁运行底层并发网络引擎和本地 Node 服务器。${NC}"
        echo -e "${YELLOW}💡 解决方案：请将本系统部署在 Mac 或云服务器上，用 iPhone 浏览器访问即可。${NC}"
        exit 1
    else
        echo -e "✅ 识别到设备: ${GREEN}Apple macOS 桌面级系统${NC}"
    fi
elif [ "$OS" == "Linux" ]; then
    echo -e "✅ 识别到设备: ${GREEN}Linux 服务器/主机${NC}"
else
    echo -e "${RED}❌ 未知或不支持的操作系统: $OS${NC}"
    exit 1
fi

echo -e "✅ 识别到 CPU 架构: ${GREEN}$ARCH${NC}"

# 2. 环境依赖安装
echo -e "\n${YELLOW}[2/5] 正在配置系统级依赖...${NC}"
if $IS_TERMUX; then
    pkg update -y && pkg install nodejs git wget tar -y
elif [ "$OS" == "Darwin" ]; then
    if ! command -v brew &> /dev/null; then
        echo -e "${RED}未检测到 Homebrew，请先安装 Homebrew！${NC}"
        exit 1
    fi
    brew install node wget
elif [ "$OS" == "Linux" ]; then
    # 兼容 Ubuntu/Debian 和 CentOS
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y nodejs npm git wget tar
    elif command -v yum &> /dev/null; then
        sudo yum install -y nodejs npm git wget tar
    fi
fi

# 3. 拉取项目代码
echo -e "\n${YELLOW}[3/5] 正在拉取核心控制台代码...${NC}"
REPO_URL="https://github.com/你的用户名/你的仓库名.git"
PROJECT_DIR="cfst-web-panel"

if [ -d "$PROJECT_DIR" ]; then
    rm -rf "$PROJECT_DIR"
fi
git clone "$REPO_URL" "$PROJECT_DIR"
cd "$PROJECT_DIR" || exit

# 4. 智能匹配底层 C++ 引擎
echo -e "\n${YELLOW}[4/5] 正在根据 CPU 架构下载匹配的测速引擎...${NC}"
if [ "$OS" == "Darwin" ]; then
    if [ "$ARCH" == "arm64" ]; then
        # M1/M2/M3 芯片 Mac
        ENGINE_URL="https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_darwin_arm64.zip"
        wget -N "$ENGINE_URL" && unzip -o cfst_darwin_arm64.zip cfst ip.txt ipv6.txt && rm cfst_darwin_arm64.zip
    else
        # Intel 芯片 Mac
        ENGINE_URL="https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_darwin_amd64.zip"
        wget -N "$ENGINE_URL" && unzip -o cfst_darwin_amd64.zip cfst ip.txt ipv6.txt && rm cfst_darwin_amd64.zip
    fi
elif [ "$OS" == "Android" ] || [ "$OS" == "Linux" ]; then
    if [[ "$ARCH" == *"aarch64"* || "$ARCH" == *"arm64"* ]]; then
        # 手机 ARM 或 ARM 服务器
        ENGINE_URL="https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_linux_arm64.tar.gz"
    else
        # 普通 Linux 服务器
        ENGINE_URL="https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_linux_amd64.tar.gz"
    fi
    wget -N "$ENGINE_URL" && tar -zxf $(basename "$ENGINE_URL") cfst ip.txt ipv6.txt && rm $(basename "$ENGINE_URL")
fi

chmod +x cfst

# 5. Node 依赖与启动
echo -e "\n${YELLOW}[5/5] 正在编译后端中枢节点...${NC}"
npm install express cors multer

echo -e "\n${GREEN}🎉 全平台统一部署完成！正在启动中枢...${NC}"
echo -e "${BLUE}================================================${NC}"
if $IS_TERMUX; then
    echo -e "👉 请在手机浏览器访问: ${GREEN}http://127.0.0.1:3088${NC}"
else
    echo -e "👉 请在浏览器访问: ${GREEN}http://localhost:3088${NC}"
fi
echo -e "${BLUE}================================================${NC}"

node server.js