[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$ApiOrigin = "http://127.0.0.1:8080",

    [string]$NodeExe = $env:NOVA_NODE_EXE
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Resolve-Node {
    $candidates = @()
    if ($NodeExe) {
        $candidates += $NodeExe
    }

    $nodeCommands = Get-Command node.exe -All -ErrorAction SilentlyContinue
    foreach ($nodeCommand in $nodeCommands) {
        $candidates += $nodeCommand.Source
    }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not (Test-Path -LiteralPath $candidate)) {
            continue
        }
        $versionText = (& $candidate --version 2>$null).TrimStart("v")
        $major = 0
        if ([int]::TryParse(($versionText -split '\.')[0], [ref]$major) -and $major -ge 22) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw "Node.js 22 or newer is required. Set -NodeExe or NOVA_NODE_EXE to a compatible node.exe."
}

function Resolve-PnpmEntry {
    $pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if (-not $pnpmCommand) {
        $pnpmCommand = Get-Command pnpm.exe -ErrorAction SilentlyContinue
    }
    if (-not $pnpmCommand) {
        throw "pnpm is required. Install pnpm 11 or run this script from a shell where pnpm is on PATH."
    }
    $pnpmRoot = Split-Path -Parent $pnpmCommand.Source
    $pnpmEntry = Join-Path $pnpmRoot "node_modules\pnpm\bin\pnpm.cjs"
    if (-not (Test-Path -LiteralPath $pnpmEntry)) {
        throw "pnpm entry script was not found next to $($pnpmCommand.Source)."
    }
    return (Resolve-Path -LiteralPath $pnpmEntry).Path
}

function Normalize-ApiOrigin {
    try {
        $parsed = [Uri]$ApiOrigin.Trim()
    } catch {
        throw "-ApiOrigin must be a valid HTTP(S) origin, for example https://api.example.com."
    }

    if ($parsed.Scheme -notin @("http", "https") -or $parsed.UserInfo -or $parsed.AbsolutePath -notin @("", "/") -or $parsed.Query -or $parsed.Fragment) {
        throw "-ApiOrigin must be an HTTP(S) origin without credentials, path, query, or fragment."
    }
    return $parsed.GetLeftPart([System.UriPartial]::Authority)
}

$node = Resolve-Node
$pnpm = Resolve-PnpmEntry
$normalizedOrigin = Normalize-ApiOrigin
$env:Path = "$(Split-Path -Parent $node);$env:Path"

Write-Host "Using Node: $node"
Write-Host "API origin: $normalizedOrigin"
Write-Host "Building Windows installer and portable EXE..."

$env:NOVA_NODE_EXE = $node
Push-Location $ProjectRoot
try {
    & $node $pnpm "package:desktop" "--" "--api-origin" $normalizedOrigin
    if ($LASTEXITCODE -ne 0) {
        throw "Desktop packaging failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

Write-Host "Desktop packages are available under $ProjectRoot\dist\desktop"
