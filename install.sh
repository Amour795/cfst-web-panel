#!/bin/bash

# ==========================================
# CF-SpeedTest-Web 全平台智能部署与管理中枢
# ==========================================

GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
BLUE='\033[1;34m'
CYAN='\033[1;36m'
NC='\033[0m'

# ⚠️ 请务必修改为你自己的 Git 仓库地址
REPO_URL="https://github.com/Amour795/cfst-web-panel.git"
PROJECT_DIR="cfst-web-panel"
MIN_NODE_VERSION=16

echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}  🚀 CF-SpeedTest 智能控制台 v2.1  ${NC}"
echo -e "${BLUE}================================================${NC}"

# --- 1. 核心模块：环境与架构嗅探 ---
OS="$(uname -s)"
ARCH="$(uname -m)"
IS_TERMUX=false

if [ -n "$TERMUX_VERSION" ]; then
    OS="Android"
    IS_TERMUX=true
elif [ "$OS" == "Darwin" ]; then
    if [[ "$ARCH" == *"iPhone"* || "$ARCH" == *"iPad"* ]]; then
        echo -e "${RED}❌ 不支持在 iOS 本地直接运行，请部署在服务器或 Mac 上。${NC}"
        exit 1
    fi
fi

# --- 函数：智能检查并安装 Node.js ---
check_and_install_node() {
    echo -e "\n${CYAN}>>> 正在检查运行环境...${NC}"
    
    # 安装基础工具包 (git, wget, tar)
    if $IS_TERMUX; then
        pkg update -y > /dev/null 2>&1
        pkg install git wget tar -y > /dev/null 2>&1
    elif [ "$OS" == "Darwin" ]; then
        if ! command -v brew &> /dev/null; then echo -e "${RED}请先安装 Homebrew${NC}"; exit 1; fi
        if ! command -v wget &> /dev/null; then brew install wget; fi
    elif [ "$OS" == "Linux" ]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get update > /dev/null 2>&1 && sudo apt-get install -y git wget tar > /dev/null 2>&1
        elif command -v yum &> /dev/null; then
            sudo yum install -y git wget tar > /dev/null 2>&1
        fi
    fi

    # 智能判断 Node.js 环境
    if command -v node >/dev/null 2>&1; then
        # 提取 Node 的大版本号
        NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
        if [ -n "$NODE_VERSION" ] && [ "$NODE_VERSION" -ge "$MIN_NODE_VERSION" ]; then
            echo -e "${GREEN}✅ 检测到合格的 Node.js (v$NODE_VERSION.x) 环境，跳过重复安装。${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️ 当前 Node.js 版本 (v$NODE_VERSION) 偏低 (需 >= v$MIN_NODE_VERSION)，准备执行更新...${NC}"
        fi
    else
        echo -e "${YELLOW}>>> 未检测到 Node.js，准备开始安装...${NC}"
    fi

    # 执行 Node.js 安装
    if $IS_TERMUX; then
        pkg install nodejs -y
    elif [ "$OS" == "Darwin" ]; then
        brew install node
    elif [ "$OS" == "Linux" ]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get install -y nodejs npm
        elif command -v yum &> /dev/null; then
            sudo yum install -y nodejs npm
        fi
    fi
}

# --- 函数：更新/下载底层测速引擎 ---
download_engine() {
    echo -e "\n${CYAN}>>> 正在同步最新版 CloudflareST 底层引擎...${NC}"
    if [ "$OS" == "Darwin" ]; then
        if [ "$ARCH" == "arm64" ]; then
            ENGINE_URL="https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_darwin_arm64.zip"
            wget -q -N "$ENGINE_URL" && unzip -q -o cfst_darwin_arm64.zip cfst ip.txt ipv6.txt && rm cfst_darwin_arm64.zip
        else
            ENGINE_URL="https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_darwin_amd64.zip"
            wget -q -N "$ENGINE_URL" && unzip -q -o cfst_darwin_amd64.zip cfst ip.txt ipv6.txt && rm cfst_darwin_amd64.zip
        fi
    elif [ "$OS" == "Android" ] || [ "$OS" == "Linux" ]; then
        if [[ "$ARCH" == *"aarch64"* || "$ARCH" == *"arm64"* ]]; then
            ENGINE_URL="https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_linux_arm64.tar.gz"
        else
            ENGINE_URL="https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_linux_amd64.tar.gz"
        fi
        wget -q -N "$ENGINE_URL" && tar -zxf $(basename "$ENGINE_URL") cfst ip.txt ipv6.txt && rm $(basename "$ENGINE_URL")
    fi
    chmod +x cfst
    echo -e "${GREEN}✅ 底层引擎更新完毕！${NC}"
}

# --- 函数：更新面板代码 ---
update_code() {
    echo -e "\n${CYAN}>>> 正在从 GitHub 拉取最新面板代码...${NC}"
    git pull origin main
    echo -e "${CYAN}>>> 正在检查并更新 Node.js 依赖...${NC}"
    npm install
    echo -e "${GREEN}✅ 代码与依赖更新完毕！${NC}"
}

# --- 函数：启动服务 ---
start_server() {
    echo -e "\n${GREEN}🎉 准备就绪！正在启动中枢节点...${NC}"
    echo -e "${BLUE}================================================${NC}"
    if $IS_TERMUX; then
        echo -e "👉 请在手机浏览器访问: ${GREEN}http://127.0.0.1:3088${NC}"
    else
        echo -e "👉 请在浏览器访问: ${GREEN}http://localhost:3088${NC}"
    fi
    echo -e "${BLUE}================================================${NC}"
    node server.js
}

# --- 2. 交互式主逻辑 ---

if [ -d "$PROJECT_DIR" ]; then
    # 已安装，进入管理菜单
    echo -e "${YELLOW}检测到本地已部署 ${PROJECT_DIR} 项目。${NC}\n"
    echo -e "请选择你需要执行的操作："
    echo -e "  ${GREEN}1.${NC} 启动测速面板 (直接运行)"
    echo -e "  ${GREEN}2.${NC} 仅更新 Web 面板代码 (Git Pull)"
    echo -e "  ${GREEN}3.${NC} 仅更新底层 C++ 测速引擎 (从官方源下载最新版)"
    echo -e "  ${GREEN}4.${NC} 全面更新 (更新代码 + 引擎) 并启动"
    echo -e "  ${RED}0.${NC} 退出脚本"
    echo ""
    read -p "请输入序号 [0-4]: " choice

    cd "$PROJECT_DIR" || exit
    # 每次跑菜单也顺便检查一下 Node 环境是不是被别人卸载了
    check_and_install_node

    case $choice in
        1)
            start_server
            ;;
        2)
            update_code
            start_server
            ;;
        3)
            download_engine
            start_server
            ;;
        4)
            update_code
            download_engine
            start_server
            ;;
        0)
            echo -e "${YELLOW}已退出。${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}输入无效，默认直接启动面板...${NC}"
            start_server
            ;;
    esac

else
    # 未安装，执行全新安装逻辑
    echo -e "${YELLOW}未检测到本地项目，准备开始全新安装...${NC}"
    
    # 智能环境配置
    check_and_install_node

    echo -e "\n${CYAN}>>> 正在拉取项目代码...${NC}"
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR" || exit

    download_engine

    echo -e "\n${CYAN}>>> 正在安装 Node.js 依赖...${NC}"
    npm install express cors multer

    start_server
fi