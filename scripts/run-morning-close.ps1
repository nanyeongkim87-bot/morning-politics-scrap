param(
  [ValidateSet('collect', 'saturday-close', 'verify', 'saturday-refresh')]
  [string]$Mode = 'collect'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$lockPath = Join-Path ([System.IO.Path]::GetTempPath()) 'morning-politics-close.lock'
$lock = $null

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command exited with code $LASTEXITCODE"
  }
}

function Test-LiveToday {
  & npm.cmd run check:daily -- --live-only --require-live --json
  return $LASTEXITCODE -eq 0
}

try {
  try {
    $lock = [System.IO.File]::Open($lockPath, 'CreateNew', 'Write', 'None')
  } catch [System.IO.IOException] {
    Write-Host 'Another morning close is already running; leaving without creating duplicate work.'
    exit 0
  }

  Set-Location -LiteralPath $repoRoot

  if ($Mode -eq 'verify') {
    if (Test-LiveToday) {
      Write-Host 'The live page already exposes a valid health manifest for today.'
      exit 0
    }

    $todayOnMain = & node -e "const a=require('./src/scraps.json'); const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-',''); process.exit(a[d] ? 0 : 1)"
    if ($LASTEXITCODE -ne 0) {
      throw 'The 06:35 verification found no valid live page and no local archive to redeploy.'
    }

    $trackedChanges = & git status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0 -or $trackedChanges) {
      throw 'The live page is stale, but tracked user changes prevent a safe emergency redeployment.'
    }
    Invoke-Native git pull --ff-only origin main
    Invoke-Native git commit --allow-empty -m "Trigger emergency Pages redeployment"
    Invoke-Native git push origin main
    Invoke-Native npm.cmd run check:daily -- --require-live --wait-seconds 240 --json
    exit 0
  }

  if ($Mode -ne 'saturday-refresh' -and (Test-LiveToday)) {
    Write-Host 'Today is already published; no collection is needed.'
    exit 0
  }

  $trackedChanges = & git status --porcelain --untracked-files=no
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect the working tree.'
  }
  if ($trackedChanges) {
    throw 'Tracked user changes are present; refusing to mix them into an unattended publication.'
  }

  Invoke-Native git pull --ff-only origin main

  $env:REQUIRE_TODAY = '1'
  $env:EXTERNAL_STATIC = '1'
  Remove-Item Env:SKIP_SCRAPE -ErrorAction SilentlyContinue
  if ($Mode -in @('saturday-close', 'saturday-refresh')) {
    $env:ALLOW_PARTIAL_SATURDAY = '1'
  } else {
    Remove-Item Env:ALLOW_PARTIAL_SATURDAY -ErrorAction SilentlyContinue
  }

  Invoke-Native npm.cmd run build
  Invoke-Native npm.cmd run verify:static
  Invoke-Native npm.cmd run test:health
  $bundledPython = 'C:\Users\Nan Kim\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
  $python = if (Test-Path -LiteralPath $bundledPython) { $bundledPython } else { (Get-Command python.exe).Source }
  Invoke-Native $python -m unittest scripts.test_naver_morning_politics_scrap

  Invoke-Native git add -- src/scraps.json
  & git diff --cached --quiet
  if ($LASTEXITCODE -eq 1) {
    Invoke-Native git commit -m "Update morning politics data"
    Invoke-Native git push origin main
  } elseif ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect the staged daily archive.'
  } elseif (-not (Test-LiveToday)) {
    Invoke-Native git commit --allow-empty -m "Trigger emergency Pages redeployment"
    Invoke-Native git push origin main
  }

  Invoke-Native npm.cmd run check:daily -- --require-live --wait-seconds 300 --json
} finally {
  Remove-Item Env:REQUIRE_TODAY -ErrorAction SilentlyContinue
  Remove-Item Env:EXTERNAL_STATIC -ErrorAction SilentlyContinue
  Remove-Item Env:ALLOW_PARTIAL_SATURDAY -ErrorAction SilentlyContinue
  Remove-Item Env:SKIP_SCRAPE -ErrorAction SilentlyContinue
  if ($lock) {
    $lock.Dispose()
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
  }
}
