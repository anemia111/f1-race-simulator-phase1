$ErrorActionPreference = 'Stop'

$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $sourceRoot '..'))
$deployRoot = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'anemia111.github.io'))
$expectedRepository = 'anemia111/anemia111.github.io'

if (
  (Split-Path -Parent $deployRoot) -ne $workspaceRoot -or
  (Split-Path -Leaf $deployRoot) -ne 'anemia111.github.io'
) {
  throw "Refusing to publish outside the expected deployment directory: $deployRoot"
}

Push-Location $sourceRoot
try {
  & npm.cmd run lint
  if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }

  & npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }

  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
}
finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath (Join-Path $deployRoot '.git'))) {
  & gh repo clone $expectedRepository $deployRoot
  if ($LASTEXITCODE -ne 0) { throw 'Could not clone the deployment repository.' }
}

$remote = (& git -C $deployRoot remote get-url origin).Trim()
if ($remote -notmatch 'anemia111/anemia111\.github\.io(?:\.git)?$') {
  throw "Unexpected deployment remote: $remote"
}

Get-ChildItem -LiteralPath $deployRoot -Force |
  Where-Object { $_.Name -ne '.git' } |
  Remove-Item -Recurse -Force

Copy-Item -Path (Join-Path $sourceRoot 'dist\*') -Destination $deployRoot -Recurse
New-Item -ItemType File -Path (Join-Path $deployRoot '.nojekyll') -Force | Out-Null

& git -C $deployRoot add --all
& git -C $deployRoot diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Output 'Deployment is already current.'
  return
}

& git -C $deployRoot commit -m 'Deploy F1 Race Simulator'
if ($LASTEXITCODE -ne 0) { throw 'Could not commit the deployment.' }

& git -C $deployRoot push origin HEAD:master
if ($LASTEXITCODE -ne 0) { throw 'Could not push the deployment.' }

Write-Output 'Published https://anemia111.github.io/'
