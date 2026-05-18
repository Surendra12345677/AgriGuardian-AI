<#
.SYNOPSIS
  PowerShell equivalent of scripts/eval_experiment.py - seeds the live
  backend with recommendations from evals/golden_dataset.jsonl so the
  EvalQualityCard histogram + sparkline have real data for the demo video.

.PARAMETER BaseUrl
  Backend base URL. Default = live Cloud Run.

.PARAMETER Limit
  Max rows to run (0 = all). Default 12.

.EXAMPLE
  ./scripts/seed-evals.ps1
  ./scripts/seed-evals.ps1 -BaseUrl http://localhost:8080 -Limit 5
#>
param(
  [string]$BaseUrl = "https://agriguardian-ai-zqafbkccaa-uc.a.run.app",
  [int]$Limit      = 12,
  [string]$Label   = "baseline"
)

$ErrorActionPreference = "Stop"
$root      = Split-Path -Parent $PSScriptRoot
$dataset   = Join-Path $root "evals\golden_dataset.jsonl"
$resultDir = Join-Path $root "evals\results"
if (-not (Test-Path $resultDir)) { New-Item -ItemType Directory -Path $resultDir | Out-Null }

if (-not (Test-Path $dataset)) {
  Write-Error "Golden dataset missing at $dataset"
  exit 2
}

$rows = Get-Content $dataset | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json }
if ($Limit -gt 0) { $rows = $rows | Select-Object -First $Limit }

Write-Host ">> Seeding $($rows.Count) rows against $BaseUrl" -ForegroundColor Cyan
Write-Host ""

$results  = @()
$started  = Get-Date
$hits     = 0
$failures = 0

for ($i = 0; $i -lt $rows.Count; $i++) {
  $row     = $rows[$i]
  $idx     = "{0,2}/{1}" -f ($i + 1), $rows.Count
  $payload = @{
    farmId        = $row.farmId
    latitude      = $row.latitude
    longitude     = $row.longitude
    preferredCrop = $null
    language      = if ($row.language) { $row.language } else { "en" }
    scenario      = if ($row.scenario) { $row.scenario } else { "BASELINE" }
    forceLive     = $true
  } | ConvertTo-Json -Compress

  $t0 = Get-Date
  try {
    $resp = Invoke-RestMethod `
      -Uri "$BaseUrl/api/v1/recommendations" `
      -Method Post `
      -ContentType "application/json" `
      -Body $payload `
      -TimeoutSec 90
    $latency = [int]((Get-Date) - $t0).TotalMilliseconds

    # Extract crop from reasoning JSON if present
    $crop = ""
    if ($resp.reasoning) {
      $s = $resp.reasoning.Trim()
      $start = $s.IndexOf("{"); $end = $s.LastIndexOf("}")
      if ($start -ge 0 -and $end -gt $start) {
        try {
          $inner = ($s.Substring($start, $end - $start + 1)) | ConvertFrom-Json
          if ($inner.crop) { $crop = $inner.crop.ToLower() }
        } catch { }
      }
    }
    if (-not $crop -and $resp.crop) { $crop = $resp.crop.ToLower() }

    $expected = @($row.expectedCrops | ForEach-Object { $_.ToLower() })
    $hit      = $expected -contains $crop
    if ($hit) { $hits++; $marker = "OK" } else { $marker = "--" }

    $line = "  [{0}] {1,-28} {2} crop={3,-14} ({4}ms)" -f $idx, $row.id, $marker, $crop, $latency
    if ($hit) { Write-Host $line -ForegroundColor Green } else { Write-Host $line }

    $results += [pscustomobject]@{
      id           = $row.id
      crop         = $crop
      expectedCrops = $expected
      inShortlist  = $hit
      latencyMs    = $latency
      traceId      = $resp.traceId
    }
  } catch {
    $failures++
    Write-Host "  [$idx] $($row.id) ERR: $($_.Exception.Message)" -ForegroundColor Red
    $results += [pscustomobject]@{ id = $row.id; error = $_.Exception.Message }
  }

  Start-Sleep -Milliseconds 500  # be nice to Cloud Run cold-starts
}

$elapsed = [int](((Get-Date) - $started).TotalSeconds)
$validN  = ($results | Where-Object { -not $_.error }).Count
$hitRate = if ($validN -gt 0) { [math]::Round($hits / $validN, 3) } else { 0 }

Write-Host ""
Write-Host "-------- SEED SUMMARY --------"  -ForegroundColor Cyan
Write-Host "  rows         $($rows.Count)"
Write-Host "  succeeded    $validN"
Write-Host "  failed       $failures"
Write-Host "  shortlistHit $hitRate"
Write-Host "  elapsedSec   $elapsed"
Write-Host "------------------------------"  -ForegroundColor Cyan

$outPath = Join-Path $resultDir "$Label.json"
@{
  summary = @{
    label             = $Label
    rows              = $rows.Count
    validRows         = $validN
    failures          = $failures
    shortlistHitRate  = $hitRate
    elapsedSec        = $elapsed
  }
  results = $results
} | ConvertTo-Json -Depth 8 | Out-File -Encoding utf8 $outPath
Write-Host "Wrote evals/results/$Label.json"

# Pull the agent's own quality trend so you can see the EvalQualityCard data
try {
  $trend = Invoke-RestMethod -Uri "$BaseUrl/api/v1/eval/quality-trend?limit=50" -TimeoutSec 30
  $trendPath = Join-Path $resultDir "$Label.trend.json"
  $trend | ConvertTo-Json -Depth 8 | Out-File -Encoding utf8 $trendPath
  Write-Host "Wrote evals/results/$Label.trend.json (avg=$($trend.averageScore))"
} catch {
  Write-Host "  (skipped quality-trend fetch: $($_.Exception.Message))" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Now refresh the live app - the EvalQualityCard should show" -ForegroundColor Green
Write-Host "a populated histogram + sparkline." -ForegroundColor Green

