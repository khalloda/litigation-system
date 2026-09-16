param(
  [Parameter(Mandatory = $true)][string]$Output,
  [Parameter(Mandatory = $true)][string]$Phase
)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dataRoot = 'D:\Projects\LitigationData'
$accepted = Join-Path $dataRoot 'task45-a1-accepted-20260916T103752Z'
$originalEvidence = Join-Path $dataRoot 'review-evidence\tasks46-47-combined-20260916T152647Z'

function Get-Record([string]$Root, [string]$Path) {
  $item = Get-Item -LiteralPath $Path
  $hash = $null
  $readObservation = 'readable'
  try {
    $hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  } catch {
    $readObservation = 'locked or unreadable; metadata only'
  }
  [ordered]@{
    path = [IO.Path]::GetRelativePath($Root, $item.FullName).Replace('\', '/')
    bytes = $item.Length
    sha256 = $hash
    readObservation = $readObservation
    lastWriteUtc = $item.LastWriteTimeUtc.ToString('o')
  }
}

function Get-Inventory([string]$Root) {
  @(Get-ChildItem -LiteralPath $Root -Recurse -File | Sort-Object FullName | ForEach-Object {
      Get-Record $Root $_.FullName
    })
}

$configuration = @(
  '.env', '.env.example', 'docker-compose.yml', 'next.config.ts'
  | ForEach-Object { Get-Record $workspace (Join-Path $workspace $_) }
)
$acceptedFiles = @(
  '.next\BUILD_ID', '.next\required-server-files.json', 'package.json',
  'accepted-runtime-1789555482667.log', 'accepted-runtime-1789555482667.error.log'
  | ForEach-Object {
      $path = Join-Path $accepted $_
      if (Test-Path -LiteralPath $path) { Get-Record $accepted $path }
    }
)
$body = [ordered]@{
  schema = 'tasks46-47-owner-resources-v1'
  phase = $Phase
  capturedAt = (Get-Date).ToUniversalTime().ToString('o')
  mode = 'read-only hashes and metadata; no file bodies emitted'
  configuration = $configuration
  acceptedArtifact = [ordered]@{ path = $accepted; files = $acceptedFiles }
  clientLogos = [ordered]@{
    path = (Join-Path $dataRoot 'client-logos')
    files = Get-Inventory (Join-Path $dataRoot 'client-logos')
  }
  originalTasks46_47Evidence = [ordered]@{
    path = $originalEvidence
    files = Get-Inventory $originalEvidence
  }
}
$parent = Split-Path -Parent $Output
if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
$body | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Output -Encoding utf8NoBOM
Write-Output "PASS owner resource observation $Phase -> $Output"
