#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Sets up Modsmith to run natively on Windows Server, without WSL or Docker.

.DESCRIPTION
    Installs the prerequisites it can (Node 22, pnpm, PostgreSQL 16, Memurai, NSSM), creates the
    database, writes .env with generated secrets, installs packages, migrates and seeds, and
    optionally registers Windows services. Safe to re-run: existing secrets and data are preserved.

.PARAMETER Port
    Port the site listens on. Default 3000.

.PARAMETER InstallServices
    Register modsmith-web and modsmith-worker as Windows services with NSSM and open the firewall.

.PARAMETER SkipPrereqs
    Do not install anything; assume Node, pnpm, PostgreSQL and Redis are already present.

.PARAMETER PostgresPassword
    Password for the PostgreSQL superuser, used once to create the modsmith role and databases.

.EXAMPLE
    .\scripts\setup-windows.ps1
    .\scripts\setup-windows.ps1 -InstallServices -Port 8080
#>
[CmdletBinding()]
param(
    [int]$Port = 3000,
    [switch]$InstallServices,
    [switch]$SkipPrereqs,
    [switch]$NoSeed,
    [string]$PostgresPassword,
    [string]$DatabaseUrl,
    [string]$RedisUrl = "redis://localhost:6379"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# Windows PowerShell 5.1 on Server 2019/2022 still defaults to TLS 1.0, which every download below
# refuses. Without this, Invoke-WebRequest fails with "could not create SSL/TLS secure channel".
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Step($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Green }
function Info($m) { Write-Host "    $m" -ForegroundColor DarkGray }
function Warn($m) { Write-Host "    warning: $m" -ForegroundColor Yellow }
function Die($m, $hint) {
    Write-Host ""
    Write-Host "error: $m" -ForegroundColor Red
    if ($hint) { Write-Host "       $hint" -ForegroundColor Red }
    exit 1
}
function Have($name) { $null -ne (Get-Command $name -ErrorAction SilentlyContinue) }

# Refreshes PATH in this session so freshly installed tools are visible without reopening PowerShell.
function Sync-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Install-Chocolatey {
    if (Have choco) { return $true }
    Info "installing Chocolatey (winget is not available on this Windows version)"
    try {
        Set-ExecutionPolicy Bypass -Scope Process -Force
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString("https://community.chocolatey.org/install.ps1"))
        Sync-Path
        if (-not (Have choco)) { $env:Path += ";$env:ProgramData\chocolatey\bin" }
    } catch {
        Warn "Chocolatey could not be installed: $($_.Exception.Message)"
    }
    return (Have choco)
}

function Install-Package($wingetId, $chocoId, $chocoParams) {
    if ($script:UseWinget) {
        winget install --id $wingetId --silent --accept-package-agreements --accept-source-agreements | Out-Null
        return $true
    }
    if (Install-Chocolatey) {
        $cargs = @("install", $chocoId, "-y", "--no-progress")
        if ($chocoParams) { $cargs += @("--params", $chocoParams) }
        & choco @cargs | Out-Null
        Sync-Path
        return $true
    }
    return $false
}

# Node is installed straight from nodejs.org so the version matches what the project is tested on,
# rather than whatever an LTS package alias currently points at.
function Install-NodeFromMsi {
    Info "resolving the latest Node 22 release"
    $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing -TimeoutSec 30
    $rel = $index | Where-Object { $_.version -like "v22.*" } | Select-Object -First 1
    if (-not $rel) { return $false }
    $url = "https://nodejs.org/dist/$($rel.version)/node-$($rel.version)-x64.msi"
    $msi = Join-Path $env:TEMP "node-$($rel.version)-x64.msi"
    Info "downloading $($rel.version)"
    Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing -TimeoutSec 600
    Info "installing (this takes a minute)"
    $p = Start-Process msiexec.exe -ArgumentList @("/i", "`"$msi`"", "/qn", "/norestart") -Wait -PassThru
    Remove-Item $msi -ErrorAction SilentlyContinue
    Sync-Path
    if (-not (Have node)) { $env:Path += ";$env:ProgramFiles\nodejs" }
    return (Have node)
}

Step "Checking prerequisites"
$script:UseWinget = (Have winget) -and (-not $SkipPrereqs)
if (-not $SkipPrereqs) {
    if ($script:UseWinget) { Info "using winget" }
    else { Info "winget not found; will use Chocolatey, which supports Windows Server 2019 and 2022" }
}

# ── Node ─────────────────────────────────────────────────────────────────────
$nodeOk = $false
if (Have node) {
    $nodeMajor = [int]((node -v).TrimStart("v").Split(".")[0])
    $nodeOk = $nodeMajor -ge 22
    if ($nodeOk) { Info "node $(node -v)" } else { Warn "node $(node -v) is too old, need 22 or newer" }
}
if (-not $nodeOk) {
    if ($SkipPrereqs) { Die "Node 22 or newer is required." "https://nodejs.org/en/download" }
    if (-not (Install-NodeFromMsi)) { Die "Node could not be installed automatically." "Install it from https://nodejs.org/en/download, then re-run this script." }
    if (-not (Have node)) { Die "Node installed but is not on PATH." "Close this window, open a new Administrator PowerShell and re-run." }
    Info "node $(node -v)"
}

# ── pnpm ─────────────────────────────────────────────────────────────────────
if (-not (Have pnpm)) {
    Info "enabling pnpm through corepack"
    cmd /c "corepack enable" 2>&1 | Out-Null
    cmd /c "corepack prepare pnpm@10.33.0 --activate" 2>&1 | Out-Null
    Sync-Path
}
if (-not (Have pnpm)) {
    cmd /c "npm install -g pnpm@10.33.0" 2>&1 | Out-Null
    Sync-Path
}
if (-not (Have pnpm)) { Die "pnpm is not available." "Run: npm install -g pnpm@10.33.0" }
Info "pnpm $(pnpm -v)"

# ── PostgreSQL ───────────────────────────────────────────────────────────────
function Find-Psql {
    if (Have psql) { return $true }
    $c = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
         Sort-Object FullName -Descending | Select-Object -First 1
    if ($c) { $env:Path += ";$($c.Directory.FullName)" }
    return (Have psql)
}
if (-not (Find-Psql) -and -not $SkipPrereqs) {
    if (-not $PostgresPassword) { $PostgresPassword = "Pg_" + [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray()).Substring(0, 16).Replace("/", "x").Replace("+", "y") }
    Info "installing PostgreSQL 16"
    if (-not (Install-Package "PostgreSQL.PostgreSQL.16" "postgresql16" "/Password:$PostgresPassword")) {
        Die "PostgreSQL could not be installed automatically." "Install it from https://www.postgresql.org/download/windows/ then re-run with -SkipPrereqs"
    }
    Find-Psql | Out-Null
}
if (-not (Find-Psql)) { Die "PostgreSQL is not installed or psql is not on PATH." "https://www.postgresql.org/download/windows/" }
Info "psql $((psql --version) -replace '^psql \(PostgreSQL\) ', '')"

# ── Redis, via Memurai ───────────────────────────────────────────────────────
function Test-Redis {
    try {
        $probe = New-Object System.Net.Sockets.TcpClient
        $probe.Connect("localhost", 6379)
        $connected = $probe.Connected
        $probe.Close()
        return $connected
    } catch { return $false }
}

if (-not (Test-Redis)) {
    if ($SkipPrereqs) { Die "Nothing is listening on localhost:6379." "Start Memurai, or pass -RedisUrl pointing at your Redis." }
    Warn "Redis has no official Windows build. Installing Memurai Developer, which is Redis-compatible."
    Warn "Memurai Developer is free but NOT licensed for production and stops after 10 days of uptime."
    Warn "For production you need Memurai Enterprise: https://www.memurai.com/get-memurai"
    if (-not (Install-Package "Memurai.MemuraiDeveloper" "memurai-developer.install" $null)) {
        Die "Memurai could not be installed automatically." "Install it from https://www.memurai.com/get-memurai then re-run with -SkipPrereqs"
    }
    Start-Service Memurai -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 30; $i++) { if (Test-Redis) { break }; Start-Sleep -Seconds 2 }
}
if (-not (Test-Redis)) { Die "Nothing is listening on localhost:6379." "Check the service: Get-Service Memurai ; Start-Service Memurai" }
Info "Redis-compatible server responding on localhost:6379"

# ── database and role ────────────────────────────────────────────────────────
Step "Creating the database"
if (-not $DatabaseUrl) {
    if (-not $PostgresPassword) {
        $secure = Read-Host "PostgreSQL superuser (postgres) password" -AsSecureString
        $PostgresPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    }
    $env:PGPASSWORD = $PostgresPassword
    $exists = (psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_roles WHERE rolname='modsmith'" 2>$null)
    if ($exists -ne "1") { psql -U postgres -h localhost -c "CREATE USER modsmith WITH PASSWORD 'modsmith'" | Out-Null }
    foreach ($db in @("modsmith", "modsmith_test")) {
        $dbExists = (psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>$null)
        if ($dbExists -ne "1") { psql -U postgres -h localhost -c "CREATE DATABASE $db OWNER modsmith" | Out-Null }
    }
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    $DatabaseUrl = "postgresql://modsmith:modsmith@localhost:5432/modsmith?schema=public"
    Info "role modsmith and databases modsmith / modsmith_test are ready"
} else {
    Info "using the database URL you supplied"
}

# ── project setup ────────────────────────────────────────────────────────────
Step "Configuring and building the project"
Push-Location $root
try {
    $setupArgs = @("scripts/setup-local.mjs", "--no-docker", "--database-url", $DatabaseUrl, "--redis-url", $RedisUrl, "--port", "$Port")
    if ($NoSeed) { $setupArgs += "--no-seed" }
    & node @setupArgs
    if ($LASTEXITCODE -ne 0) { Die "project setup failed (see the output above)." }
} finally { Pop-Location }

# ── services ─────────────────────────────────────────────────────────────────
if ($InstallServices) {
    Step "Registering Windows services"
    if (-not (Have nssm)) {
        if ($SkipPrereqs) { Die "NSSM is not installed." "Install it from https://nssm.cc and put nssm.exe on PATH." }
        Install-Package "NSSM.NSSM" "nssm" $null | Out-Null
    }
    if (-not (Have nssm)) { Die "NSSM is not on PATH." "Install it from https://nssm.cc and re-run." }

    $pnpmCmd = (Get-Command pnpm).Source
    foreach ($svc in @(@{ Name = "modsmith-web"; Filter = "@modsmith/web" }, @{ Name = "modsmith-worker"; Filter = "@modsmith/worker" })) {
        if (Get-Service $svc.Name -ErrorAction SilentlyContinue) {
            nssm stop $svc.Name 2>&1 | Out-Null
            nssm remove $svc.Name confirm 2>&1 | Out-Null
        }
        nssm install $svc.Name $pnpmCmd "--filter $($svc.Filter) start" | Out-Null
        nssm set $svc.Name AppDirectory $root | Out-Null
        nssm set $svc.Name AppStdout (Join-Path $root "logs\$($svc.Name).log") | Out-Null
        nssm set $svc.Name AppStderr (Join-Path $root "logs\$($svc.Name).log") | Out-Null
        nssm set $svc.Name AppRotateFiles 1 | Out-Null
        nssm set $svc.Name Start SERVICE_AUTO_START | Out-Null
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $root "logs") | Out-Null
    nssm start modsmith-web | Out-Null
    nssm start modsmith-worker | Out-Null
    Info "modsmith-web and modsmith-worker installed and started"

    if (-not (Get-NetFirewallRule -DisplayName "Modsmith" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName "Modsmith" -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow | Out-Null
        Info "opened inbound TCP $Port"
    }

    Step "Waiting for the site to answer"
    $healthy = $false
    for ($i = 0; $i -lt 60 -and -not $healthy; $i++) {
        try {
            $r = Invoke-WebRequest "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 5
            $healthy = $r.StatusCode -eq 200
        } catch { Start-Sleep -Seconds 2 }
    }
    if ($healthy) { Info "healthy" } else { Warn "the site did not answer yet; check logs\modsmith-web.log" }
}

Write-Host ""
Write-Host "Modsmith is set up." -ForegroundColor Green
Write-Host ""
if ($InstallServices) {
    Write-Host "  Running as Windows services. Manage them with:"
    Write-Host "    nssm restart modsmith-web ; nssm restart modsmith-worker" -ForegroundColor DarkGray
    Write-Host "    Get-Content logs\modsmith-web.log -Wait" -ForegroundColor DarkGray
} else {
    Write-Host "  Start it in two PowerShell windows, both from $root"
    Write-Host "    pnpm dev:web        # the site on http://localhost:$Port" -ForegroundColor DarkGray
    Write-Host "    pnpm dev:worker     # builds exports; without it jobs stay queued" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Re-run with -InstallServices to keep it running after you log out."
}
Write-Host ""
Write-Host "  Open      http://localhost:$Port"
Write-Host "  Verify    node scripts\smoke-test.mjs"
Write-Host "  Emails    none are sent; verification links are printed in the web output"
Write-Host ""
