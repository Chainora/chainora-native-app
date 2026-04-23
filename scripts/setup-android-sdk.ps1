param(
  [string]$SdkPath
)

$candidates = @(
  $SdkPath,
  $env:ANDROID_SDK_ROOT,
  $env:ANDROID_HOME,
  (Join-Path $env:LOCALAPPDATA 'Android\Sdk'),
  "C:\Android\Sdk"
) | Where-Object { $_ -and $_.Trim() -ne '' }

$resolvedPath = $null
foreach ($candidate in $candidates) {
  if (Test-Path $candidate) {
    $resolvedPath = (Resolve-Path $candidate).Path
    break
  }
}

if (-not $resolvedPath) {
  throw "Android SDK path not found. Set ANDROID_SDK_ROOT or ANDROID_HOME, or pass -SdkPath explicitly."
}

$normalizedPath = $resolvedPath -replace '\\', '/'
$localPropertiesPath = Join-Path $PSScriptRoot '..\android\local.properties'

Set-Content -Path $localPropertiesPath -Value "sdk.dir=$normalizedPath"
Write-Host "android/local.properties created with sdk.dir=$normalizedPath"
