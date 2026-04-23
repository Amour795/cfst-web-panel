#!/usr/bin/env bash
set -Eeuo pipefail

# ==========================================
# CF-SpeedTest-Web 智能部署与管理脚本
# ==========================================

GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
BLUE='\033[1;34m'
CYAN='\033[1;36m'
PURPLE='\033[1;35m'
DIM='\033[2m'
NC='\033[0m'

REPO_URL="https://github.com/Amour795/cfst-web-panel.git"
PROJECT_DIR="cfst-web-panel"
MIN_NODE_VERSION=16
NODE_SETUP_MAJOR=18

OS="$(uname -s)"
ARCH="$(uname -m)"
IS_TERMUX=false

hr() { printf "%b\n" "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
title() { printf "%b\n" "${PURPLE}$1${NC}"; }
info() { printf "%b\n" "${CYAN}▶ $1${NC}"; }
step() { printf "%b\n" "${BLUE}• $1${NC}"; }
ok() { printf "%b\n" "${GREEN}✔ $1${NC}"; }
warn() { printf "%b\n" "${YELLOW}⚠ $1${NC}"; }
fail() { printf "%b\n" "${RED}✘ $1${NC}"; }
dim() { printf "%b\n" "${DIM}$1${NC}"; }

on_error() {
    local exit_code="$1"
    local line_no="$2"
    fail "脚本在第 ${line_no} 行中断（退出码：${exit_code}）"
    fail "请根据上方日志修复后重试。"
}
trap 'on_error $? $LINENO' ERR

detect_platform() {
    if [ -n "${TERMUX_VERSION:-}" ]; then
        OS="Android"
        IS_TERMUX=true
    fi

    if [ "$OS" = "Darwin" ] && [[ "$ARCH" == *"iPhone"* || "$ARCH" == *"iPad"* ]]; then
        fail "不支持在 iOS 本地直接运行，请部署在服务器或 Mac 上。"
        exit 1
    fi
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

run_as_root_or_sudo() {
    if [ "${EUID:-$(id -u)}" -eq 0 ]; then
        "$@"
    elif command_exists sudo; then
        sudo "$@"
    else
        fail "当前操作需要 root 或 sudo：$*"
        exit 1
    fi
}

download_file() {
    local url="$1"
    local output="$2"
    if command_exists curl; then
        curl -fL --retry 3 --connect-timeout 10 -o "$output" "$url"
        return
    fi
    if command_exists wget; then
        wget -q -O "$output" "$url"
        return
    fi
    fail "缺少下载工具：请安装 curl 或 wget"
    exit 1
}

install_base_tools() {
    info "检查基础依赖..."
    if $IS_TERMUX; then
        pkg update -y >/dev/null
        pkg install -y git wget curl tar unzip >/dev/null
        ok "Termux 依赖就绪"
        return
    fi

    if [ "$OS" = "Darwin" ]; then
        if ! command_exists brew; then
            fail "未检测到 Homebrew，请先安装后重试。"
            exit 1
        fi
        command_exists git || brew install git
        command_exists wget || brew install wget
        command_exists curl || brew install curl
        command_exists unzip || brew install unzip
        ok "macOS 依赖就绪"
        return
    fi

    if [ "$OS" = "Linux" ]; then
        if command_exists apt-get; then
            run_as_root_or_sudo apt-get update -y >/dev/null
            run_as_root_or_sudo apt-get install -y git wget curl tar unzip ca-certificates python3 make g++ >/dev/null
        elif command_exists dnf; then
            run_as_root_or_sudo dnf install -y git wget curl tar unzip ca-certificates python3 make gcc-c++ >/dev/null
        elif command_exists yum; then
            run_as_root_or_sudo yum install -y git wget curl tar unzip ca-certificates python3 make gcc-c++ >/dev/null
        elif command_exists pacman; then
            run_as_root_or_sudo pacman -Sy --noconfirm git wget curl tar unzip ca-certificates python make gcc >/dev/null
        else
            fail "未识别 Linux 包管理器（支持 apt/dnf/yum/pacman）。"
            exit 1
        fi
        ok "Linux 依赖就绪"
        return
    fi

    fail "暂不支持当前系统：$OS"
    exit 1
}

check_and_install_node() {
    info "检查 Node.js 运行环境..."

    if command_exists node; then
        local node_major
        node_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
        if [ -n "$node_major" ] && [ "$node_major" -ge "$MIN_NODE_VERSION" ]; then
            ok "Node.js 版本可用：v${node_major}.x"
            return
        fi
        warn "当前 Node.js 版本偏低（v${node_major}），将升级到 LTS。"
    else
        warn "未检测到 Node.js，将自动安装。"
    fi

    if $IS_TERMUX; then
        pkg install -y nodejs >/dev/null
        ok "Termux Node.js 安装完成"
        return
    fi

    if [ "$OS" = "Darwin" ]; then
        run_as_root_or_sudo true >/dev/null 2>&1 || true
        brew install node@${NODE_SETUP_MAJOR} >/dev/null || brew upgrade node@${NODE_SETUP_MAJOR} >/dev/null || true
        if ! command_exists node; then
            brew link --overwrite node@${NODE_SETUP_MAJOR} >/dev/null || true
        fi
        ok "macOS Node.js 已安装/升级"
        return
    fi

    if [ "$OS" = "Linux" ]; then
        if command_exists apt-get; then
            curl -fsSL "https://deb.nodesource.com/setup_${NODE_SETUP_MAJOR}.x" | run_as_root_or_sudo bash - >/dev/null
            run_as_root_or_sudo apt-get install -y nodejs >/dev/null
        elif command_exists dnf; then
            curl -fsSL "https://rpm.nodesource.com/setup_${NODE_SETUP_MAJOR}.x" | run_as_root_or_sudo bash - >/dev/null
            run_as_root_or_sudo dnf install -y nodejs >/dev/null
        elif command_exists yum; then
            curl -fsSL "https://rpm.nodesource.com/setup_${NODE_SETUP_MAJOR}.x" | run_as_root_or_sudo bash - >/dev/null
            run_as_root_or_sudo yum install -y nodejs >/dev/null
        elif command_exists pacman; then
            run_as_root_or_sudo pacman -Sy --noconfirm nodejs npm >/dev/null
        fi
        ok "Linux Node.js 已安装/升级"
        return
    fi

    fail "Node.js 安装失败：不支持的平台 $OS"
    exit 1
}

resolve_engine_url() {
    case "$OS-$ARCH" in
        Darwin-arm64)
            echo "https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_darwin_arm64.zip"
            ;;
        Darwin-x86_64)
            echo "https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_darwin_amd64.zip"
            ;;
        Android-aarch64|Linux-aarch64|Linux-arm64)
            echo "https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_linux_arm64.tar.gz"
            ;;
        Android-x86_64|Linux-x86_64|Linux-amd64)
            echo "https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_linux_amd64.tar.gz"
            ;;
        *)
            fail "暂不支持的架构：$OS/$ARCH"
            exit 1
            ;;
    esac
}

download_engine() {
    info "同步 CloudflareSpeedTest 引擎..."
    local engine_url archive_name
    engine_url="$(resolve_engine_url)"
    archive_name="$(basename "$engine_url")"

    rm -f "$archive_name"
    download_file "$engine_url" "$archive_name"

    if [[ "$archive_name" == *.zip ]]; then
        unzip -q -o "$archive_name" cfst ip.txt ipv6.txt
    else
        tar -zxf "$archive_name" cfst ip.txt ipv6.txt
    fi
    rm -f "$archive_name"
    chmod +x cfst
    ok "测速引擎更新完成"
}

install_dependencies() {
    info "安装/更新 Node 依赖..."
    npm install --no-fund --no-audit
    ok "依赖安装完成"
}

update_code() {
    info "拉取最新代码..."
    git fetch --all --prune
    git pull --ff-only origin main
    ok "代码更新完成"
}

start_server() {
    hr
    title "🚀 启动服务"
    if $IS_TERMUX; then
        printf "%b\n" "访问地址: ${GREEN}http://127.0.0.1:3088${NC}"
    else
        printf "%b\n" "访问地址: ${GREEN}http://localhost:3088${NC}"
    fi
    dim "提示：Ctrl + C 可停止服务；建议生产环境使用 pm2 托管。"
    hr
    node server.js
}

menu_existing_project() {
    warn "检测到已安装项目：${PROJECT_DIR}"
    printf "%b\n" "  ${GREEN}1.${NC} 直接启动"
    printf "%b\n" "  ${GREEN}2.${NC} 更新代码并启动"
    printf "%b\n" "  ${GREEN}3.${NC} 更新引擎并启动"
    printf "%b\n" "  ${GREEN}4.${NC} 全量更新（代码+引擎+依赖）并启动"
    printf "%b\n" "  ${RED}0.${NC} 退出"
    echo
    read -r -p "请输入序号 [0-4]: " choice

    cd "$PROJECT_DIR"
    install_base_tools
    check_and_install_node

    case "$choice" in
        1) start_server ;;
        2) update_code; install_dependencies; start_server ;;
        3) download_engine; start_server ;;
        4) update_code; download_engine; install_dependencies; start_server ;;
        0) warn "已退出"; exit 0 ;;
        *) warn "输入无效，按“直接启动”处理"; start_server ;;
    esac
}

fresh_install() {
    warn "未检测到项目，开始全新安装..."
    install_base_tools
    check_and_install_node

    info "克隆仓库..."
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"

    download_engine
    install_dependencies

    hr
    ok "全新安装完成"
    dim "项目目录: $(pwd)"
    hr
    start_server
}

main() {
    detect_platform
    hr
    title "⚡ CFST Web Panel 安装向导 v3.0"
    dim "平台: ${OS} | 架构: ${ARCH} | Node >= ${MIN_NODE_VERSION}"
    hr

    if [ -d "$PROJECT_DIR" ]; then
        menu_existing_project
    else
        fresh_install
    fi
}

main "$@"
