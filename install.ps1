$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Info($msg) { Write-Host "▶ $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "✔ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "⚠ $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "✘ $msg" -ForegroundColor Red }

$RepoUrl = "https://github.com/Amour795/cfst-web-panel.git"
$RepoZipUrl = "https://github.com/Amour795/cfst-web-panel/archive/refs/heads/main.zip"
$ProjectDir = "cfst-web-panel"
$ProjectExtractedDir = "cfst-web-panel-main"
$MinNodeMajor = 18
$HasGit = $false

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Ensure-Git {
    if (Test-Command "git") {
        $script:HasGit = $true
        Write-Ok "检测到 git，使用 git 模式安装/更新"
    } else {
        $script:HasGit = $false
        Write-Warn "未检测到 git，将自动切换为 ZIP 安装模式（可正常安装，但后续更新能力较弱）"
    }
}

function Ensure-Node {
    if (-not (Test-Command "node")) {
        Write-Fail "未检测到 Node.js，请先安装 Node.js >= 18 后重试。"
        Write-Host "下载地址: https://nodejs.org/" -ForegroundColor DarkYellow
        exit 1
    }
    $v = (node -v).Trim()
    if ($v -notmatch "^v(\d+)") {
        Write-Fail "无法识别 Node.js 版本: $v"
        exit 1
    }
    $major = [int]$Matches[1]
    if ($major -lt $MinNodeMajor) {
        Write-Fail "Node.js 版本过低: $v，要求 >= $MinNodeMajor"
        exit 1
    }
    Write-Ok "Node.js 版本可用: $v"
}

function Update-Code {
    if ($script:HasGit) {
        if (Test-Path $ProjectDir) {
            Write-Info "检测到已存在目录，执行更新..."
            Push-Location $ProjectDir
            git fetch --all --prune | Out-Null
            git pull --ff-only origin main
            Pop-Location
            Write-Ok "代码更新完成"
        } else {
            Write-Info "克隆项目..."
            git clone $RepoUrl $ProjectDir
            Write-Ok "代码克隆完成"
        }
    } else {
        if (Test-Path $ProjectDir) {
            Write-Warn "检测到已存在目录：$ProjectDir"
            Write-Warn "ZIP 模式不会自动合并更新，保留现有目录继续安装依赖与引擎。"
            return
        }
        Write-Info "下载项目 ZIP 包..."
        if (Test-Path ".\tmp_repo.zip") { Remove-Item -Force ".\tmp_repo.zip" }
        if (Test-Path ".\$ProjectExtractedDir") { Remove-Item -Recurse -Force ".\$ProjectExtractedDir" }
        Invoke-WebRequest -UseBasicParsing -Uri $RepoZipUrl -OutFile ".\tmp_repo.zip" -TimeoutSec 30
        Expand-Archive -Path ".\tmp_repo.zip" -DestinationPath "." -Force
        Remove-Item -Force ".\tmp_repo.zip"
        if (-not (Test-Path ".\$ProjectExtractedDir")) {
            Write-Fail "ZIP 解压失败，未找到目录：$ProjectExtractedDir"
            exit 1
        }
        Rename-Item -Path ".\$ProjectExtractedDir" -NewName $ProjectDir
        Write-Ok "ZIP 模式项目下载完成"
    }
}

function Download-Engine {
    $urls = @(
        "https://mirror.ghproxy.com/https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_windows_amd64.zip",
        "https://gh-proxy.com/https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_windows_amd64.zip",
        "https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download/cfst_windows_amd64.zip"
    )
    Push-Location $ProjectDir
    if (Test-Path ".\cfst.exe") { Remove-Item -Force ".\cfst.exe" }
    $ok = $false
    foreach ($u in $urls) {
        try {
            Write-Info "尝试下载测速引擎: $u"
            Invoke-WebRequest -UseBasicParsing -Uri $u -OutFile ".\tmp_cfst.zip" -TimeoutSec 30
            $ok = $true
            break
        } catch {
            Write-Warn "下载失败，切换下一个下载源"
        }
    }
    if (-not $ok) {
        Pop-Location
        Write-Fail "引擎下载失败，请检查网络后重试。"
        exit 1
    }
    Expand-Archive -Path ".\tmp_cfst.zip" -DestinationPath "." -Force
    Remove-Item -Force ".\tmp_cfst.zip"
    if (-not (Test-Path ".\cfst.exe")) {
        Pop-Location
        Write-Fail "解压后未找到 cfst.exe，请手动检查压缩包内容。"
        exit 1
    }
    Pop-Location
    Write-Ok "测速引擎更新完成"
}

function Install-Dependencies {
    Push-Location $ProjectDir
    Write-Info "安装 Node 依赖..."
    npm install --no-fund --no-audit
    Write-Info "构建前端压缩文件..."
    npm run build:min
    Pop-Location
    Write-Ok "依赖安装与构建完成"
}

function Start-Server {
    Push-Location $ProjectDir
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
    Write-Host "启动服务中..." -ForegroundColor Magenta
    Write-Host "默认访问: http://localhost:3088" -ForegroundColor Green
    Write-Host "若端口被占用，请以终端实际输出为准" -ForegroundColor DarkGray
    Write-Host "按 Ctrl + C 可停止服务" -ForegroundColor DarkGray
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
    node .\server.js
    Pop-Location
}

Write-Host "⚡ CFST Web Panel Windows 安装向导" -ForegroundColor Magenta
Ensure-Git
Ensure-Node
Update-Code
Download-Engine
Install-Dependencies
Start-Server
