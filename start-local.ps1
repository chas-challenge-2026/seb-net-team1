<#
.SYNOPSIS
    Starts the full stack locally: Postgres (Docker), the .NET API and the React dev server.

.DESCRIPTION
    Default (dev) mode:
      - PostgreSQL 16 in Docker on localhost:5433. The API creates the schema with its
        EF Core migrations and seeds the demo company on first start.
      - Mailpit (local mail catcher) on http://localhost:8025, shows notification e-mails
      - SebPortal.Api with `dotnet run` on http://localhost:5010 (Swagger at /swagger)
      - Vite dev server on http://localhost:3000, proxying /api to the API
    Ctrl+C stops everything. The database keeps its data until you use -ResetDb.

    -Docker runs the same build as stage/prod instead (infra/docker-compose.yml),
    with the React app served by the API on http://localhost:8081.

.PARAMETER Docker
    Build and run everything in Docker, like the deploy environment.

.PARAMETER ResetDb
    Delete the local database volume first, so the demo data is created again.

.EXAMPLE
    ./start-local.ps1
.EXAMPLE
    ./start-local.ps1 -ResetDb
.EXAMPLE
    ./start-local.ps1 -Docker
#>
param(
    [switch]$Docker,
    [switch]$ResetDb
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$onWindows = $env:OS -eq "Windows_NT"
$composeArgs = @(
    "compose",
    "-f", (Join-Path $root "infra/docker-compose.yml"),
    "-f", (Join-Path $root "infra/docker-compose.override.yml")
)

function Write-Step([string]$message) {
    Write-Host "==> $message" -ForegroundColor Cyan
}

# Native tools write progress and warnings to stderr. Windows PowerShell 5.1 turns
# that into errors when output is redirected, so native calls run with "Continue"
# and are checked through $LASTEXITCODE instead.
function Invoke-Native([string]$exe, [string[]]$arguments) {
    $ErrorActionPreference = "Continue"
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "$exe $($arguments -join ' ') failed." }
}

function Invoke-Compose {
    Invoke-Native "docker" ($composeArgs + $args)
}

# For calls whose failure is not fatal. Returns stdout, drops stderr.
function Invoke-ComposeQuiet {
    $ErrorActionPreference = "Continue"
    & docker @composeArgs @args 2> $null
}

function Assert-Command([string]$name, [string]$hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "'$name' was not found. $hint"
    }
}

function Test-DockerRunning {
    $ErrorActionPreference = "Continue"
    & docker info *> $null
    return $LASTEXITCODE -eq 0
}

function Start-DockerIfNeeded {
    if (Test-DockerRunning) { return }

    $dockerDesktop = Join-Path $env:ProgramFiles "Docker/Docker/Docker Desktop.exe"
    if ($onWindows -and (Test-Path $dockerDesktop)) {
        Write-Step "Starting Docker Desktop..."
        Start-Process $dockerDesktop
    } else {
        throw "Docker is not running. Start Docker and try again."
    }

    $deadline = (Get-Date).AddSeconds(120)
    while (-not (Test-DockerRunning)) {
        if ((Get-Date) -gt $deadline) { throw "Docker did not start within 2 minutes." }
        Start-Sleep -Seconds 2
    }
}

function Get-PortOwner([int]$port) {
    # Get-NetTCPConnection (Windows) sees listeners on every address, including ::1,
    # where Node servers bound to "localhost" usually listen.
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $listener) { return $null }
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        if ($process) { return "$($process.ProcessName) (PID $($process.Id))" }
        return "PID $($listener.OwningProcess)"
    }

    # Elsewhere: try to connect on both IPv4 and IPv6 loopback.
    foreach ($address in "127.0.0.1", "::1") {
        $ip = [System.Net.IPAddress]::Parse($address)
        $client = New-Object System.Net.Sockets.TcpClient($ip.AddressFamily)
        try {
            if ($client.ConnectAsync($ip, $port).Wait(500)) { return "another process" }
        } catch {
            # Connection refused: nothing listens on this address.
        } finally {
            $client.Dispose()
        }
    }
    return $null
}

function Assert-PortFree([int]$port, [string]$what) {
    $owner = Get-PortOwner $port
    if ($owner) {
        throw "Port $port ($what) is already in use by $owner. Stop it (for example Stop-Process -Id <PID>) and try again."
    }
}

function Wait-ForUrl([string]$url, [int]$timeoutSeconds, [System.Diagnostics.Process[]]$watch = @()) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        foreach ($process in $watch) {
            if ($process.HasExited) { throw "A process exited while waiting for $url. See the output above." }
        }
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop | Out-Null
            return
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    throw "Timed out waiting for $url."
}

function Stop-ProcessTree([System.Diagnostics.Process]$process) {
    if ($null -eq $process -or $process.HasExited) { return }
    if ($onWindows) {
        $ErrorActionPreference = "Continue"
        & taskkill /PID $process.Id /T /F *> $null
    } else {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
}

function Assert-DatabaseStarts {
    try {
        Invoke-Compose up -d --wait db mailpit
    } catch {
        Write-Host ""
        Write-Warning ("The database container did not start. If your local volume was created by an older " +
            "version (PostgreSQL 12 / v1 seed.sql), run ./start-local.ps1 -ResetDb once.")
        throw
    }

    # v1 databases (created by seed.sql) have the old tables but no EF migration history.
    # quote_ident avoids double quotes, which Windows PowerShell 5.1 mangles in native arguments.
    $legacyCheck = "SELECT to_regclass('public.users') IS NOT NULL AND to_regclass('public.' || quote_ident('__EFMigrationsHistory')) IS NULL;"
    $isLegacy = "$(Invoke-ComposeQuiet exec -T db psql -U seb -d seb -tAc $legacyCheck)".Trim()
    if ($isLegacy -eq "t") {
        throw "The local database still has the v1 schema. Run ./start-local.ps1 -ResetDb once to rebuild it."
    }
}

function Write-Logins {
    Write-Host ""
    Write-Host "  Test users (password: password123)"
    Write-Host "    lisa@malmobygg.se    initiator"
    Write-Host "    johan@malmobygg.se   attestant"
    Write-Host "    sara@malmobygg.se    admin"
    Write-Host "    erik@malmobygg.se    attestant"
    Write-Host ""
}

Assert-Command "docker" "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
Start-DockerIfNeeded

if ($ResetDb) {
    Write-Step "Removing the local database volume..."
    Invoke-Compose down -v
}

# --- Docker mode: the same image as stage/prod ------------------------------
if ($Docker) {
    Assert-PortFree 8081 "app"
    Write-Step "Building and starting all containers (this takes a few minutes the first time)..."
    Assert-DatabaseStarts
    Invoke-Compose up --build -d app

    try {
        Wait-ForUrl "http://localhost:8081/health" 240
        Write-Host ""
        Write-Host "  App:     http://localhost:8081" -ForegroundColor Green
        Write-Host "  E-post:  http://localhost:8025 (Mailpit)"
        Write-Logins
        Write-Host "  Showing app logs. Press Ctrl+C to stop."
        Start-Process "http://localhost:8081"
        Invoke-Native "docker" ($composeArgs + @("logs", "-f", "app"))
    } finally {
        Write-Step "Stopping containers..."
        Invoke-ComposeQuiet stop | Out-Null
    }
    return
}

# --- Dev mode: Postgres in Docker, API and frontend on the host -------------
Assert-Command "dotnet" "Install the .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0"
Assert-Command "node" "Install Node.js 20 or newer: https://nodejs.org/"
Assert-PortFree 5010 "API"
Assert-PortFree 3000 "frontend"

Write-Step "Starting PostgreSQL on localhost:5433 and Mailpit on localhost:8025..."
Assert-DatabaseStarts

$frontend = Join-Path $root "frontend"
$lockFile = Join-Path $frontend "package-lock.json"
$installedLock = Join-Path $frontend "node_modules/.package-lock.json"
if (-not (Test-Path $installedLock) -or (Get-Item $lockFile).LastWriteTime -gt (Get-Item $installedLock).LastWriteTime) {
    Write-Step "Installing frontend dependencies..."
    Push-Location $frontend
    try {
        Invoke-Native "npm" @("ci")
    } finally {
        Pop-Location
    }
}

$api = $null
$web = $null
try {
    Write-Step "Starting the API on http://localhost:5010 (migrations and demo data run on first start)..."
    $api = Start-Process dotnet -ArgumentList "run", "--launch-profile", "http" `
        -WorkingDirectory (Join-Path $root "backend/SebPortal.Api") -NoNewWindow -PassThru
    Wait-ForUrl "http://localhost:5010/health" 180 @($api)

    # Only now start the frontend, so an open browser tab never hits the proxy
    # before the API is listening.
    Write-Step "Starting the frontend on http://localhost:3000..."
    # Run Vite through node directly: npm.cmd on Windows would ask "Terminate batch job?" on Ctrl+C.
    $web = Start-Process node -ArgumentList "node_modules/vite/bin/vite.js", "--port", "3000", "--strictPort" `
        -WorkingDirectory $frontend -NoNewWindow -PassThru
    Wait-ForUrl "http://localhost:3000/" 60 @($api, $web)

    Write-Host ""
    Write-Host "  App:      http://localhost:3000" -ForegroundColor Green
    Write-Host "  Swagger:  http://localhost:5010/swagger"
    Write-Host "  E-post:   http://localhost:8025  (Mailpit, notifieringsmejl)"
    Write-Host "  Postgres: localhost:5433  (db seb, user seb)"
    Write-Logins
    Write-Host "  Press Ctrl+C to stop everything."
    Start-Process "http://localhost:3000"

    while (-not $api.HasExited -and -not $web.HasExited) {
        Start-Sleep -Seconds 1
    }
    Write-Warning "A process exited unexpectedly. See the output above."
} finally {
    Write-Step "Stopping..."
    Stop-ProcessTree $web
    Stop-ProcessTree $api
    Invoke-ComposeQuiet stop db mailpit | Out-Null
}
