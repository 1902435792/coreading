[CmdletBinding(SupportsShouldProcess = $true, DefaultParameterSetName = "Status")]
param(
  [Parameter(ParameterSetName = "Enable")]
  [switch]$Enable,

  [Parameter(ParameterSetName = "Disable")]
  [switch]$Disable,

  [Parameter(ParameterSetName = "Status")]
  [switch]$Status,

  [string]$Name = "VCP CoReading Sidecar",
  [string]$PluginDir = ""
)

$ErrorActionPreference = "Stop"

function Resolve-PluginDir {
  param([string]$Path)
  $resolved = Resolve-Path -LiteralPath $Path
  return $resolved.Path
}

function Get-NpmCommand {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npm) { return $npm.Source }
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if ($npm) { return $npm.Source }
  throw "npm was not found on PATH."
}

function New-AutostartCommand {
  param(
    [string]$NpmPath,
    [string]$WorkingDir
  )
  $escapedNpm = $NpmPath.Replace("'", "''")
  $escapedDir = $WorkingDir.Replace("'", "''")
  $command = "Set-Location -LiteralPath '$escapedDir'; & '$escapedNpm' run sidecar:pm2:start"
  return "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ""$command"""
}

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
if (-not $PluginDir) {
  $scriptPath = $PSCommandPath
  if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }
  $PluginDir = Split-Path -Parent (Split-Path -Parent $scriptPath)
}
$pluginRoot = Resolve-PluginDir -Path $PluginDir
$npmPath = Get-NpmCommand
$desiredCommand = New-AutostartCommand -NpmPath $npmPath -WorkingDir $pluginRoot
$current = (Get-ItemProperty -Path $runKey -Name $Name -ErrorAction SilentlyContinue).$Name

if ($Enable) {
  if ($PSCmdlet.ShouldProcess("$runKey\$Name", "Set CoReading sidecar autostart")) {
    New-ItemProperty -Path $runKey -Name $Name -Value $desiredCommand -PropertyType String -Force | Out-Null
  }
  [pscustomobject]@{
    Action = "enable"
    Name = $Name
    RunKey = $runKey
    Command = $desiredCommand
    PluginDir = $pluginRoot
    Npm = $npmPath
  } | ConvertTo-Json -Depth 3
  exit 0
}

if ($Disable) {
  if ($current -and $PSCmdlet.ShouldProcess("$runKey\$Name", "Remove CoReading sidecar autostart")) {
    Remove-ItemProperty -Path $runKey -Name $Name -ErrorAction SilentlyContinue
  }
  [pscustomobject]@{
    Action = "disable"
    Name = $Name
    RunKey = $runKey
    Removed = [bool]$current
    PreviousCommand = $current
  } | ConvertTo-Json -Depth 3
  exit 0
}

[pscustomobject]@{
  Action = "status"
  Name = $Name
  RunKey = $runKey
  Enabled = [bool]$current
  CurrentCommand = $current
  DesiredCommand = $desiredCommand
  PluginDir = $pluginRoot
  Npm = $npmPath
} | ConvertTo-Json -Depth 3
