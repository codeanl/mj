[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "status",

    [switch]$StopInfrastructure
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RuntimeRoot = Join-Path $ProjectRoot ".data\runtime"
$LogRoot = Join-Path $ProjectRoot ".artifacts\runtime"
$ApiRoot = Join-Path $ProjectRoot "services\api"
$ApiExecutable = Join-Path $RuntimeRoot "nova-api.exe"

$Services = @{
    api = @{
        Port = 8080
        Url = "http://127.0.0.1:8080/api/v1/health/live"
        PidFile = Join-Path $RuntimeRoot "api.pid"
    }
    web = @{
        Port = 5173
        Url = "http://127.0.0.1:5173"
        PidFile = Join-Path $RuntimeRoot "web.pid"
    }
    admin = @{
        Port = 5174
        Url = "http://127.0.0.1:5174"
        PidFile = Join-Path $RuntimeRoot "admin.pid"
    }
}

function Import-DotEnv {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
            continue
        }
        $name, $value = $trimmed.Split("=", 2)
        $name = $name.Trim()
        $value = $value.Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        if ($name -match '^[A-Za-z_][A-Za-z0-9_]*$') {
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

function Set-DefaultEnvironment {
    $defaults = @{
        APP_ENV = "development"
        HTTP_ADDR = ":8080"
        WEB_ORIGIN = "http://localhost:5173"
        ADMIN_ORIGIN = "http://localhost:5174"
        DATABASE_URL = "postgres://nova:nova@localhost:55432/nova?sslmode=disable"
        REDIS_ADDR = "localhost:6379"
    }
    foreach ($entry in $defaults.GetEnumerator()) {
        if (-not [Environment]::GetEnvironmentVariable($entry.Key, "Process")) {
            [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
        }
    }
}

function Resolve-NodeExecutable {
    $candidates = @()
    if ($env:NOVA_NODE_EXE) {
        $candidates += $env:NOVA_NODE_EXE
    }
    $candidates += @(
        "D:\sf\nvmEnv\v24.14.0\node.exe",
        "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
    )
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        $candidates += $nodeCommand.Source
    }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not (Test-Path -LiteralPath $candidate)) {
            continue
        }
        $version = (& $candidate --version 2>$null).TrimStart("v")
        $major = 0
        if ([int]::TryParse(($version -split '\.')[0], [ref]$major) -and $major -ge 22) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    throw "Node.js 22 or newer is required. Set NOVA_NODE_EXE to a compatible node.exe."
}

function Read-ServiceProcessId {
    param([string]$Name)

    $pidFile = $Services[$Name].PidFile
    if (-not (Test-Path -LiteralPath $pidFile)) {
        return $null
    }
    $raw = (Get-Content -LiteralPath $pidFile -Raw).Trim()
    $serviceProcessId = 0
    if (-not [int]::TryParse($raw, [ref]$serviceProcessId)) {
        return $null
    }
    return $serviceProcessId
}

function Test-ProcessRunning {
    param([Nullable[int]]$ProcessId)

    return $null -ne $ProcessId -and $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Assert-PortAvailable {
    param([int]$Port)

    $owners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    if ($owners) {
        throw "Port $Port is already in use by process $($owners -join ', '). Run status and stop the existing service first."
    }
}

function Start-ManagedProcess {
    param(
        [string]$Name,
        [string]$FilePath,
        [AllowEmptyCollection()]
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory
    )

    $existingProcessId = Read-ServiceProcessId $Name
    if (Test-ProcessRunning $existingProcessId) {
        Write-Host "$Name is already running (PID $existingProcessId)."
        return
    }
    Assert-PortAvailable $Services[$Name].Port
    $stdout = Join-Path $LogRoot "$Name.out.log"
    $stderr = Join-Path $LogRoot "$Name.err.log"
    $startParameters = @{
        FilePath = $FilePath
        WorkingDirectory = $WorkingDirectory
        WindowStyle = "Hidden"
        RedirectStandardOutput = $stdout
        RedirectStandardError = $stderr
        PassThru = $true
    }
    if ($ArgumentList.Count -gt 0) {
        $startParameters.ArgumentList = $ArgumentList
    }
    $process = Start-Process @startParameters
    Set-Content -LiteralPath $Services[$Name].PidFile -Value $process.Id -Encoding ASCII
    Write-Host "Started $name on port $($Services[$Name].Port) (PID $($process.Id))."
}

function Get-DescendantProcessIds {
    param([int]$ProcessId)

    $result = @()
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        $result += Get-DescendantProcessIds -ProcessId $child.ProcessId
        $result += [int]$child.ProcessId
    }
    return $result
}

function Stop-ManagedProcess {
    param([string]$Name)

    $serviceProcessId = Read-ServiceProcessId $Name
    if (-not (Test-ProcessRunning $serviceProcessId)) {
        Remove-Item -LiteralPath $Services[$Name].PidFile -ErrorAction SilentlyContinue
        Write-Host "$Name is not running."
        return
    }
    $descendants = Get-DescendantProcessIds -ProcessId $serviceProcessId
    foreach ($descendantId in $descendants) {
        Stop-Process -Id $descendantId -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $serviceProcessId -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $Services[$Name].PidFile -ErrorAction SilentlyContinue
    Write-Host "Stopped $name (PID $serviceProcessId)."
}

function Get-HttpState {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        return "HTTP $($response.StatusCode)"
    } catch {
        return "not ready"
    }
}

function Show-Status {
    $rows = foreach ($name in @("api", "web", "admin")) {
        $serviceProcessId = Read-ServiceProcessId $name
        $running = Test-ProcessRunning $serviceProcessId
        [pscustomobject]@{
            Service = $name
            Port = $Services[$name].Port
            ProcessId = if ($running) { $serviceProcessId } else { "-" }
            Process = if ($running) { "running" } else { "stopped" }
            Endpoint = if ($running) { Get-HttpState $Services[$name].Url } else { "-" }
        }
    }
    $rows | Format-Table -AutoSize
    Write-Host "Logs: $LogRoot"
}

function Start-Stack {
    New-Item -ItemType Directory -Force -Path $RuntimeRoot, $LogRoot | Out-Null
    Import-DotEnv (Join-Path $ProjectRoot ".env")
    Import-DotEnv (Join-Path $ProjectRoot ".env.local")
    Set-DefaultEnvironment

    $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
    if (-not $docker) {
        throw "Docker is required to start PostgreSQL and Redis."
    }
    Push-Location $ProjectRoot
    try {
        & $docker.Source compose up -d postgres redis
        if ($LASTEXITCODE -ne 0) {
            throw "Docker dependencies failed to start."
        }
    } finally {
        Pop-Location
    }

    $go = Get-Command go.exe -ErrorAction SilentlyContinue
    if (-not $go) {
        throw "Go is required to build the API."
    }
    Push-Location $ApiRoot
    try {
        & $go.Source build -o $ApiExecutable ./cmd/api
        if ($LASTEXITCODE -ne 0) {
            throw "API build failed."
        }
    } finally {
        Pop-Location
    }

    $node = Resolve-NodeExecutable
    Start-ManagedProcess -Name "api" -FilePath $ApiExecutable -ArgumentList @() -WorkingDirectory $ApiRoot
    Start-ManagedProcess -Name "web" -FilePath $node -ArgumentList @((Join-Path $ProjectRoot "apps\web\node_modules\vite\bin\vite.js"), "--host", "0.0.0.0", "--port", "5173") -WorkingDirectory (Join-Path $ProjectRoot "apps\web")
    Start-ManagedProcess -Name "admin" -FilePath $node -ArgumentList @((Join-Path $ProjectRoot "apps\admin\node_modules\vite\bin\vite.js"), "--host", "0.0.0.0", "--port", "5174") -WorkingDirectory (Join-Path $ProjectRoot "apps\admin")
    Show-Status
}

function Stop-Stack {
    foreach ($name in @("admin", "web", "api")) {
        Stop-ManagedProcess $name
    }
    if ($StopInfrastructure) {
        Push-Location $ProjectRoot
        try {
            & docker.exe compose stop postgres redis
        } finally {
            Pop-Location
        }
    }
}

switch ($Action) {
    "start" { Start-Stack }
    "stop" { Stop-Stack }
    "restart" { Stop-Stack; Start-Stack }
    "status" { Show-Status }
}
