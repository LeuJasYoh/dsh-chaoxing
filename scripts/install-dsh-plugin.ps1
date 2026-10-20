#requires -Version 5.1
<#
.SYNOPSIS
  dsh-xuexi-next 的 DSH 插件安装/检查脚本。

.DESCRIPTION
  兼容 Windows PowerShell 5.1 与 PowerShell 7。
  默认只检查状态；安装和卸载必须显式指定 -Action。
  安装前会备份 profile 的 package.json 和 pnpm-lock.yaml，并默认要求
  DeepSeek Harness 已关闭。

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dsh-plugin.ps1 -Action Status
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dsh-plugin.ps1 -Action Install -DryRun
#>

[CmdletBinding()]
param(
    [ValidateSet('Status', 'Install', 'Uninstall')]
    [string]$Action = 'Status',

    [string]$PluginPath = '',

    [string]$ProfileDir = '',

    [switch]$DryRun,

    [switch]$Force
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch {
}

function Write-Info {
    param([string]$Message)
    Write-Host "[信息] $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[成功] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[注意] $Message" -ForegroundColor Yellow
}

function Fail {
    param([string]$Message)
    Write-Host "[失败] $Message" -ForegroundColor Red
    exit 1
}

function Read-Json {
    param([string]$Path)
    try {
        return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
    } catch {
        throw "无法读取或解析 JSON：$Path；$($_.Exception.Message)"
    }
}

function Write-Json {
    param(
        [string]$Path,
        [object]$Value
    )
    $json = $Value | ConvertTo-Json -Depth 20
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, $utf8NoBom)
}

function Get-PropertyValue {
    param(
        [object]$Object,
        [string]$Name
    )
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Set-ObjectProperty {
    param(
        [object]$Object,
        [string]$Name,
        [object]$Value
    )
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force
}

function Resolve-DshProfile {
    param(
        [string]$ExplicitPath
    )

    $candidates = New-Object System.Collections.ArrayList
    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        [void]$candidates.Add($ExplicitPath)
    }
    if (-not [string]::IsNullOrWhiteSpace($env:DSH_PROFILE_DIR)) {
        [void]$candidates.Add($env:DSH_PROFILE_DIR)
    }
    if (-not [string]::IsNullOrWhiteSpace($env:DSH_HOME)) {
        [void]$candidates.Add((Join-Path $env:DSH_HOME 'profiles\desktop'))
    }

    foreach ($candidate in $candidates) {
        try {
            $resolved = [System.IO.Path]::GetFullPath($candidate)
        } catch {
            continue
        }
        if (Test-Path -LiteralPath (Join-Path $resolved 'package.json')) {
            return $resolved
        }
    }
    throw '找不到 DSH profile。请用 -ProfileDir 指定 profile 目录，或设置 DSH_PROFILE_DIR。'
}

function Resolve-PluginRoot {
    param(
        [string]$ExplicitPath
    )

    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        $candidate = $ExplicitPath
    } else {
        $candidate = Split-Path -Parent $PSScriptRoot
    }
    try {
        return [System.IO.Path]::GetFullPath($candidate)
    } catch {
        throw "无法解析插件目录：$candidate"
    }
}

function Get-PnpmCommand {
    $command = Get-Command 'pnpm.cmd' -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        $command = Get-Command 'pnpm' -ErrorAction SilentlyContinue
    }
    if ($null -eq $command) {
        throw '找不到 pnpm。请先安装 pnpm，或确认 DSH 的 Node 环境可用。'
    }
    return $command.Source
}

function Test-DshRunning {
    return $null -ne (Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)
}

function Backup-ProfileFile {
    param(
        [string]$ProfilePath,
        [string]$Name,
        [string]$Stamp
    )
    $source = Join-Path $ProfilePath $Name
    if (-not (Test-Path -LiteralPath $source)) { return $null }
    $backup = "$source.bak-$Stamp"
    Copy-Item -LiteralPath $source -Destination $backup -Force
    return $backup
}

function Restore-Backup {
    param(
        [string]$SourceBackup,
        [string]$Destination
    )
    if ($SourceBackup -and (Test-Path -LiteralPath $SourceBackup)) {
        Copy-Item -LiteralPath $SourceBackup -Destination $Destination -Force
    }
}

function Show-Status {
    param(
        [string]$PluginRoot,
        [string]$DshProfile,
        [object]$PluginPackage,
        [object]$ProfilePackage
    )

    $pluginName = [string]$PluginPackage.name
    $dependency = Get-PropertyValue -Object (Get-PropertyValue -Object $ProfilePackage -Name 'dependencies') -Name $pluginName
    $bundles = Get-PropertyValue -Object (Get-PropertyValue -Object (Get-PropertyValue -Object $ProfilePackage -Name 'dsh') -Name 'profile') -Name 'bundles'
    $installedPath = Join-Path (Join-Path $DshProfile 'node_modules') $pluginName
    $installedPackage = Join-Path $installedPath 'package.json'

    Write-Info "插件目录：$PluginRoot"
    Write-Info "DSH profile：$DshProfile"
    Write-Info "插件名称：$pluginName"
    Write-Info "插件版本：$([string]$PluginPackage.version)"
    Write-Info "声明依赖：$(if ($null -eq $dependency) { '未安装' } else { [string]$dependency })"
    Write-Info "bundle 列表：$(if ($null -eq $bundles) { '无' } else { ($bundles -join ', ') })"
    if (Test-Path -LiteralPath $installedPackage) {
        try {
            $installed = Read-Json -Path $installedPackage
            Write-Ok "已安装到 node_modules：$([string]$installed.version)"
        } catch {
            Write-Warn "node_modules 中有插件目录，但无法读取 package.json。"
        }
    } else {
        Write-Warn 'node_modules 中还没有这个插件。'
    }
    if ((Test-DshRunning)) {
        Write-Warn '检测到 DeepSeek Harness 正在运行；安装/卸载前请先关闭它。'
    } else {
        Write-Ok 'DeepSeek Harness 当前未运行。'
    }
}

function Install-Plugin {
    param(
        [string]$PluginRoot,
        [string]$DshProfile,
        [object]$PluginPackage,
        [object]$ProfilePackage,
        [string]$PnpmCommand,
        [bool]$Preview
    )

    $pluginName = [string]$PluginPackage.name
    $bundlePatch = [string]$PluginPackage.dsh.bundle.patch
    if ([string]::IsNullOrWhiteSpace($bundlePatch)) {
        throw '插件 package.json 缺少 dsh.bundle.patch。'
    }
    $bundlePatchPath = Join-Path $PluginRoot ($bundlePatch -replace '/', '\')
    if (-not (Test-Path -LiteralPath $bundlePatchPath)) {
        throw "找不到 bundle patch：$bundlePatchPath"
    }

    if ((Test-DshRunning) -and -not $Preview -and -not $Force) {
        throw 'DeepSeek Harness 正在运行。请先关闭它，或在确认安全后加 -Force。'
    }
    if ((Test-DshRunning) -and $Preview) {
        Write-Warn 'DeepSeek Harness 正在运行；实际安装前需要先关闭。'
    }

    $dependencySpec = 'file:' + ($PluginRoot -replace '\\', '/')
    Write-Info "将安装依赖：$pluginName = $dependencySpec"
    Write-Info "将加入 bundle：$pluginName"

    if ($Preview) {
        Write-Info 'DryRun：不会修改 profile，也不会执行 pnpm。'
        Write-Ok '预览完成。去掉 -DryRun 即可实际安装。'
        return
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $packageBackup = Backup-ProfileFile -ProfilePath $DshProfile -Name 'package.json' -Stamp $stamp
    $lockBackup = Backup-ProfileFile -ProfilePath $DshProfile -Name 'pnpm-lock.yaml' -Stamp $stamp
    if ($packageBackup) { Write-Info "已备份 package.json：$packageBackup" }
    if ($lockBackup) { Write-Info "已备份 pnpm-lock.yaml：$lockBackup" }

    try {
        $dependencies = Get-PropertyValue -Object $ProfilePackage -Name 'dependencies'
        if ($null -eq $dependencies) {
            $dependencies = [pscustomobject]@{}
            Set-ObjectProperty -Object $ProfilePackage -Name 'dependencies' -Value $dependencies
        }
        Set-ObjectProperty -Object $dependencies -Name $pluginName -Value $dependencySpec

        $dsh = Get-PropertyValue -Object $ProfilePackage -Name 'dsh'
        if ($null -eq $dsh) {
            $dsh = [pscustomobject]@{}
            Set-ObjectProperty -Object $ProfilePackage -Name 'dsh' -Value $dsh
        }
        $profile = Get-PropertyValue -Object $dsh -Name 'profile'
        if ($null -eq $profile) {
            $profile = [pscustomobject]@{}
            Set-ObjectProperty -Object $dsh -Name 'profile' -Value $profile
        }
        $bundles = Get-PropertyValue -Object $profile -Name 'bundles'
        if ($null -eq $bundles) {
            $bundles = @()
        } else {
            $bundles = @($bundles)
        }
        if ($bundles -notcontains $pluginName) {
            $bundles += $pluginName
            Set-ObjectProperty -Object $profile -Name 'bundles' -Value $bundles
        }

        $profilePackagePath = Join-Path $DshProfile 'package.json'
        Write-Json -Path $profilePackagePath -Value $ProfilePackage
        Write-Info '已更新 profile package.json。'

        Write-Info '正在运行 pnpm install ...'
        Push-Location $DshProfile
        try {
            & $PnpmCommand install
            if ($LASTEXITCODE -ne 0) {
                throw "pnpm install 返回退出码 $LASTEXITCODE"
            }
        } finally {
            Pop-Location
        }

        $installedPackage = Join-Path (Join-Path (Join-Path $DshProfile 'node_modules') $pluginName) 'package.json'
        if (-not (Test-Path -LiteralPath $installedPackage)) {
            throw "安装后没有找到 node_modules/$pluginName/package.json"
        }
        Write-Ok "安装完成：$pluginName"
        Write-Info '请重启 DeepSeek Harness，然后在模式选择里选择「网课模式（重写）」。'
    } catch {
        Write-Warn "安装失败：$($_.Exception.Message)"
        Write-Warn '正在恢复 profile 配置文件 ...'
        Restore-Backup -SourceBackup $packageBackup -Destination (Join-Path $DshProfile 'package.json')
        if ($lockBackup) {
            Restore-Backup -SourceBackup $lockBackup -Destination (Join-Path $DshProfile 'pnpm-lock.yaml')
        }
        throw
    }
}

function Uninstall-Plugin {
    param(
        [string]$DshProfile,
        [string]$PluginName,
        [string]$PnpmCommand,
        [bool]$Preview
    )

    if ((Test-DshRunning) -and -not $Preview -and -not $Force) {
        throw 'DeepSeek Harness 正在运行。请先关闭它，或在确认安全后加 -Force。'
    }

    $profilePackagePath = Join-Path $DshProfile 'package.json'
    $profilePackage = Read-Json -Path $profilePackagePath
    $deps = Get-PropertyValue -Object $profilePackage -Name 'dependencies'
    if ($null -ne $deps) {
        $dependencyProperty = $deps.PSObject.Properties[$PluginName]
        if ($null -ne $dependencyProperty) { $dependencyProperty.Value = $null; $deps.PSObject.Properties.Remove($PluginName) }
    }
    $bundles = Get-PropertyValue -Object (Get-PropertyValue -Object (Get-PropertyValue -Object $profilePackage -Name 'dsh') -Name 'profile') -Name 'bundles'
    if ($null -ne $bundles) {
        $newBundles = @($bundles | Where-Object { $_ -ne $PluginName })
        Set-ObjectProperty -Object (Get-PropertyValue -Object (Get-PropertyValue -Object $profilePackage -Name 'dsh') -Name 'profile') -Name 'bundles' -Value $newBundles
    }

    if ($Preview) {
        Write-Info "DryRun：将从 profile 移除 $PluginName。"
        return
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $packageBackup = Backup-ProfileFile -ProfilePath $DshProfile -Name 'package.json' -Stamp $stamp
    $lockBackup = Backup-ProfileFile -ProfilePath $DshProfile -Name 'pnpm-lock.yaml' -Stamp $stamp
    try {
        Write-Json -Path $profilePackagePath -Value $profilePackage
        Push-Location $DshProfile
        try {
            & $PnpmCommand install
            if ($LASTEXITCODE -ne 0) { throw "pnpm install 返回退出码 $LASTEXITCODE" }
        } finally {
            Pop-Location
        }
        Write-Ok "已卸载：$PluginName"
    } catch {
        Write-Warn "卸载失败：$($_.Exception.Message)"
        Restore-Backup -SourceBackup $packageBackup -Destination $profilePackagePath
        if ($lockBackup) { Restore-Backup -SourceBackup $lockBackup -Destination (Join-Path $DshProfile 'pnpm-lock.yaml') }
        throw
    }
}

try {
    $pluginRoot = Resolve-PluginRoot -ExplicitPath $PluginPath
    $pluginPackagePath = Join-Path $pluginRoot 'package.json'
    if (-not (Test-Path -LiteralPath $pluginPackagePath)) {
        Fail "找不到插件 package.json：$pluginPackagePath"
    }
    $pluginPackage = Read-Json -Path $pluginPackagePath
    if ([string]::IsNullOrWhiteSpace([string]$pluginPackage.name)) {
        Fail '插件 package.json 缺少 name。'
    }
    $expectedName = 'dsh-xuexi-next'
    if ([string]$pluginPackage.name -ne $expectedName) {
        Fail "插件名称应为 $expectedName，实际为 $([string]$pluginPackage.name)。"
    }

    $dshProfile = Resolve-DshProfile -ExplicitPath $ProfileDir
    $profilePackagePath = Join-Path $dshProfile 'package.json'
    $profilePackage = Read-Json -Path $profilePackagePath

    Write-Info "脚本动作：$Action"
    if ($Action -eq 'Status') {
        Show-Status -PluginRoot $pluginRoot -DshProfile $dshProfile -PluginPackage $pluginPackage -ProfilePackage $profilePackage
        exit 0
    }

    $pnpmCommand = Get-PnpmCommand
    Write-Info "pnpm：$pnpmCommand"

    if ($Action -eq 'Install') {
        Install-Plugin -PluginRoot $pluginRoot -DshProfile $dshProfile -PluginPackage $pluginPackage -ProfilePackage $profilePackage -PnpmCommand $pnpmCommand -Preview:$DryRun
        exit 0
    }

    if ($Action -eq 'Uninstall') {
        Uninstall-Plugin -DshProfile $dshProfile -PluginName ([string]$pluginPackage.name) -PnpmCommand $pnpmCommand -Preview:$DryRun
        exit 0
    }
} catch {
    Fail $_.Exception.Message
}
