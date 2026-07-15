param(
  [switch]$SkipPlaytest
)

$ErrorActionPreference = 'Stop'

$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $sourceRoot '..'))
$deployRoot = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'anemia111.github.io'))
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'F1 Race Simulator.url'
$expectedRepository = 'anemia111/anemia111.github.io'
$productionUrl = 'https://anemia111.github.io/'
$releaseId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$publishedAt = (Get-Date).ToUniversalTime().ToString('o')
$previousReleaseId = $env:VITE_APP_RELEASE_ID

function Invoke-Npm {
  param(
    [string[]]$NpmArguments,
    [string]$FailureMessage
  )

  & npm.cmd @NpmArguments
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }
}

if (
  (Split-Path -Parent $deployRoot) -ne $workspaceRoot -or
  (Split-Path -Leaf $deployRoot) -ne 'anemia111.github.io'
) {
  throw "Refusing to publish outside the expected deployment directory: $deployRoot"
}

$sourceCommit = (& git -C $sourceRoot rev-parse --short HEAD).Trim()
$sourceHasChanges = -not [string]::IsNullOrWhiteSpace(
  ((& git -C $sourceRoot status --porcelain) -join "`n")
)
$sourceRevision = if ($sourceHasChanges) { "$sourceCommit-working" } else { $sourceCommit }

Push-Location $sourceRoot
try {
  $env:VITE_APP_RELEASE_ID = $releaseId

  Invoke-Npm -NpmArguments @('run', 'lint') -FailureMessage 'Lint failed.'
  Invoke-Npm -NpmArguments @('test') -FailureMessage 'Tests failed.'
  Invoke-Npm -NpmArguments @('run', 'build') -FailureMessage 'Build failed.'

  if (-not $SkipPlaytest) {
    Invoke-Npm -NpmArguments @('run', 'playtest') -FailureMessage 'Playtest failed.'
  }
}
finally {
  if ($null -eq $previousReleaseId) {
    Remove-Item Env:VITE_APP_RELEASE_ID -ErrorAction SilentlyContinue
  }
  else {
    $env:VITE_APP_RELEASE_ID = $previousReleaseId
  }
  Pop-Location
}

if (-not (Test-Path -LiteralPath (Join-Path $deployRoot '.git'))) {
  & gh repo clone $expectedRepository $deployRoot
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not clone the deployment repository.'
  }
}

$remote = (& git -C $deployRoot remote get-url origin).Trim()
if ($remote -notmatch 'anemia111/anemia111\.github\.io(?:\.git)?$') {
  throw "Unexpected deployment remote: $remote"
}

$deployChanges = ((& git -C $deployRoot status --porcelain) -join "`n")
if (-not [string]::IsNullOrWhiteSpace($deployChanges)) {
  throw "Deployment repository contains uncommitted changes. Inspect before publishing:`n$deployChanges"
}

& git -C $deployRoot fetch origin master
if ($LASTEXITCODE -ne 0) {
  throw 'Could not fetch the current published branch.'
}

& git -C $deployRoot merge --ff-only origin/master
if ($LASTEXITCODE -ne 0) {
  throw 'Deployment history diverged from origin/master.'
}

Get-ChildItem -LiteralPath $deployRoot -Force |
  Where-Object { $_.Name -ne '.git' } |
  Remove-Item -Recurse -Force

Copy-Item -Path (Join-Path $sourceRoot 'dist\*') -Destination $deployRoot -Recurse
New-Item -ItemType File -Path (Join-Path $deployRoot '.nojekyll') -Force | Out-Null

$releaseManifest = [ordered]@{
  releaseId = $releaseId
  sourceRevision = $sourceRevision
  publishedAt = $publishedAt
} | ConvertTo-Json
[IO.File]::WriteAllText(
  (Join-Path $deployRoot 'release.json'),
  "$releaseManifest`n",
  [Text.UTF8Encoding]::new($false)
)

& git -C $deployRoot add --all
& git -C $deployRoot diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  & git -C $deployRoot commit -m "Deploy F1 Race Simulator $releaseId"
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not commit the deployment.'
  }

  & git -C $deployRoot push origin HEAD:master
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not push the deployment.'
  }
}

$deploymentCommit = (& git -C $deployRoot rev-parse --short HEAD).Trim()
$shortcutContent = "[InternetShortcut]`r`nURL=$productionUrl`?release=$deploymentCommit`r`n"
[IO.File]::WriteAllText(
  $desktopShortcut,
  $shortcutContent,
  [Text.Encoding]::ASCII
)

$publishDeadline = (Get-Date).AddMinutes(3)
$publishedReleaseId = $null

while ((Get-Date) -lt $publishDeadline) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "${productionUrl}release.json?check=$releaseId" -TimeoutSec 10
    $publishedReleaseId = ($response.Content | ConvertFrom-Json).releaseId

    if ($publishedReleaseId -eq $releaseId) {
      break
    }
  }
  catch {
    $publishedReleaseId = $null
  }

  Start-Sleep -Seconds 3
}

if ($publishedReleaseId -ne $releaseId) {
  throw "GitHub accepted the deployment, but Pages did not expose release $releaseId within three minutes."
}

Write-Output "Published $productionUrl"
Write-Output "Release: $releaseId ($deploymentCommit, source $sourceRevision)"
Write-Output "Desktop shortcut updated: $desktopShortcut"
