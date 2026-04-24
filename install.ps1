$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "[ OK ] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red }

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
        Write-Ok "Git detected, using git mode."
    } else {
        $script:HasGit = $false
        Write-Warn "Git not found, fallback to ZIP mode."
    }
}

function Ensure-Node {
    if (-not (Test-Command "node")) {
        Write-Fail "Node.js not found. Please install Node.js >= 18 first."
        Write-Host "Download: https://nodejs.org/" -ForegroundColor DarkYellow
        exit 1
    }
    $v = (node -v).Trim()
    if ($v -notmatch "^v(\d+)") {
        Write-Fail "Cannot parse Node.js version: $v"
        exit 1
    }
    $major = [int]$Matches[1]
    if ($major -lt $MinNodeMajor) {
        Write-Fail "Node.js version too low: $v, need >= $MinNodeMajor"
        exit 1
    }
    Write-Ok "Node.js version ok: $v"
}

function Update-Code {
    if ($script:HasGit) {
        if (Test-Path $ProjectDir) {
            Write-Info "Project exists, updating..."
            Push-Location $ProjectDir
            git fetch --all --prune | Out-Null
            git pull --ff-only origin main
            Pop-Location
            Write-Ok "Code updated."
        } else {
            Write-Info "Cloning project..."
            git clone $RepoUrl $ProjectDir
            Write-Ok "Project cloned."
        }
    } else {
        if (Test-Path $ProjectDir) {
            Write-Warn "Project directory already exists: $ProjectDir"
            Write-Warn "ZIP mode keeps current files and continues."
            return
        }
        Write-Info "Downloading project ZIP..."
        if (Test-Path ".\tmp_repo.zip") { Remove-Item -Force ".\tmp_repo.zip" }
        if (Test-Path ".\$ProjectExtractedDir") { Remove-Item -Recurse -Force ".\$ProjectExtractedDir" }
        Invoke-WebRequest -UseBasicParsing -Uri $RepoZipUrl -OutFile ".\tmp_repo.zip" -TimeoutSec 30
        Expand-Archive -Path ".\tmp_repo.zip" -DestinationPath "." -Force
        Remove-Item -Force ".\tmp_repo.zip"
        if (-not (Test-Path ".\$ProjectExtractedDir")) {
            Write-Fail "ZIP extract failed, missing folder: $ProjectExtractedDir"
            exit 1
        }
        Rename-Item -Path ".\$ProjectExtractedDir" -NewName $ProjectDir
        Write-Ok "ZIP download completed."
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
            Write-Info "Downloading engine from: $u"
            Invoke-WebRequest -UseBasicParsing -Uri $u -OutFile ".\tmp_cfst.zip" -TimeoutSec 30
            $ok = $true
            break
        } catch {
            Write-Warn "Download failed, trying next mirror..."
        }
    }
    if (-not $ok) {
        Pop-Location
        Write-Fail "Engine download failed."
        exit 1
    }
    Expand-Archive -Path ".\tmp_cfst.zip" -DestinationPath "." -Force
    Remove-Item -Force ".\tmp_cfst.zip"
    if (-not (Test-Path ".\cfst.exe")) {
        Pop-Location
        Write-Fail "cfst.exe not found after extract."
        exit 1
    }
    Pop-Location
    Write-Ok "Engine ready."
}

function Install-Dependencies {
    Push-Location $ProjectDir
    Write-Info "Installing npm dependencies..."
    npm install --no-fund --no-audit
    Write-Info "Building min.js..."
    npm run build:min
    Pop-Location
    Write-Ok "Dependencies installed and build done."
}

function Start-Server {
    Push-Location $ProjectDir
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host "Starting server..." -ForegroundColor Magenta
    Write-Host "Default URL: http://localhost:3088" -ForegroundColor Green
    Write-Host "Press Ctrl + C to stop." -ForegroundColor DarkGray
    Write-Host "========================================" -ForegroundColor Blue
    node .\server.js
    Pop-Location
}

Write-Host "CFST Web Panel Windows Installer" -ForegroundColor Magenta
Ensure-Git
Ensure-Node
Update-Code
Download-Engine
Install-Dependencies
Start-Server
