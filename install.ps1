# install.ps1 -- install dsh-xuexi into the DSH desktop profile
#
# Compatibility:
#   - Windows PowerShell 5.1 (powershell.exe)
#   - PowerShell 7+           (pwsh.exe)
#
# Encoding (IMPORTANT):
#   This file MUST be saved as UTF-8 **with BOM**.
#   - PowerShell 5.1 relies on the BOM to decode the file as UTF-8.
#     Without the BOM it falls back to the system ANSI code page and
#     mangles every non-ASCII character below.
#   - PowerShell 7 reads UTF-8 with or without BOM, so the BOM is harmless
#     there.
#
# Chinese output policy:
#   - On PowerShell 7+ we switch [Console]::OutputEncoding to UTF-8 and emit
#     Chinese messages (the -Zh strings).
#   - On Windows PowerShell 5.1 we silently fall back to the English strings,
#     so we never depend on the legacy console code page being able to
#     render CJK.
#
# All JSON editing is done by scripts/patch-profile.mjs (Node), so the result
# is identical no matter which PowerShell version you use.
#
# Usage:
#   cd <this plugin directory>
#   pwsh       -File .\install.ps1          # preferred (PowerShell 7)
#   powershell -File .\install.ps1          # also works (Windows PowerShell 5.1)
#
#   .\install.ps1 -DryRun                   # preview only
#   .\install.ps1 -VerifyOnly               # check the install, change nothing
#   .\install.ps1 -Rollback <backup>        # restore a backup
#   .\install.ps1 -ProfileName default      # a profile other than "desktop"

[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$VerifyOnly,
    [string]$Rollback,
    [string]$ProfileName = 'desktop'
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Edition detection + UTF-8 console setup
# ---------------------------------------------------------------------------
$IsPwsh = $PSVersionTable.PSVersion.Major -ge 7

if ($IsPwsh) {
    try {
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $OutputEncoding           = [System.Text.Encoding]::UTF8
    } catch {
        # Some hosts (ISE, remoting endpoints) reject this; not fatal.
    }
}

# ---------------------------------------------------------------------------
# Localized output helpers
#   Say  -En "..." -Zh "..."  [-Color Green]
#   Fail -En "..." -Zh "..."     -> throws
# On PS 7+ the Chinese string is used when non-empty; otherwise English.
# ---------------------------------------------------------------------------
function Say {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$En,
        [string]$Zh,
        [System.ConsoleColor]$Color
    )
    $text = if ($IsPwsh -and $Zh) { $Zh } else { $En }
    if ($PSBoundParameters.ContainsKey('Color')) {
        Write-Host $text -ForegroundColor $Color
    } else {
        Write-Host $text
    }
}

function Fail {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$En,
        [string]$Zh
    )
    $msg = if ($IsPwsh -and $Zh) { $Zh } else { $En }
    throw $msg
}

# ---------------------------------------------------------------------------
# Content verification
#   Test-InstalledCopy -SourceDir <plugin dir> -InstalledDir <node_modules copy>
#
# Compares the SHA-256 of every file that must ship.
#
# WHY A FILE COUNT IS NOT ENOUGH (measured): `pnpm install` can exit 0 while
# leaving STALE content behind -- the exact failure the gotcha above describes.
# A count sees "12 files" and reports success even when all 12 are old.
# Comparing hashes is what turns "installed but old" from silent into loud.
#
# Expected set = package.json "files" + the three npm always bundles in
# (package.json itself, README*, LICENSE*) even though "files" omits them.
# ---------------------------------------------------------------------------
function Test-InstalledCopy {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$SourceDir,
        [Parameter(Mandatory = $true)][string]$InstalledDir
    )

    $problems = @()
    $expected = @()

    if (-not (Test-Path -LiteralPath $InstalledDir)) {
        Fail -En "installed copy missing: $InstalledDir" `
             -Zh "已安装副本缺失: $InstalledDir"
    }

    # (a) what must ship
    $pluginPkg = Get-Content -LiteralPath (Join-Path $SourceDir 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($pluginPkg.files) {
        foreach ($entry in @($pluginPkg.files)) {
            $full = Join-Path $SourceDir ($entry -replace '/', '\')
            if (Test-Path -LiteralPath $full -PathType Container) {
                foreach ($f in (Get-ChildItem -LiteralPath $full -Recurse -File)) {
                    $expected += $f.FullName.Substring($SourceDir.Length).TrimStart('\', '/')
                }
            } elseif (Test-Path -LiteralPath $full) {
                $expected += $entry
            } else {
                $problems += "files whitelist points at a missing path: $entry"
            }
        }
    }
    foreach ($f in (Get-ChildItem -LiteralPath $SourceDir -File)) {
        if ($f.Name -eq 'package.json' -or $f.Name -match '^(README|LICENSE)') {
            $expected += $f.Name
        }
    }
    $expected = @($expected | Sort-Object -Unique)

    foreach ($rel in $expected) {
        $norm = $rel -replace '\\', '/'
        $src  = Join-Path $SourceDir    ($norm -replace '/', '\')
        $dst  = Join-Path $InstalledDir ($norm -replace '/', '\')
        if (-not (Test-Path -LiteralPath $dst)) {
            $problems += "missing: $norm"
            continue
        }
        $h1 = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
        $h2 = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash
        if ($h1 -ne $h2) { $problems += "stale: $norm" }
    }

    # (b) nothing may be installed that the source does not carry
    foreach ($f in (Get-ChildItem -LiteralPath $InstalledDir -Recurse -File)) {
        $norm = $f.FullName.Substring($InstalledDir.Length).TrimStart('\', '/') -replace '\\', '/'
        if (-not (Test-Path -LiteralPath (Join-Path $SourceDir ($norm -replace '/', '\')))) {
            $problems += "not in source: $norm"
        }
    }

    if ($problems.Count -gt 0) {
        Write-Host ""
        Say -En "[FAIL] the installed copy does not match the source:" `
            -Zh "[FAIL] 已安装副本与源文件不一致：" -Color Red
        foreach ($p in $problems) { Write-Host "         - $p" }
        Say -En "       Re-run: .\install.ps1" -Zh "       请重新运行: .\install.ps1"
        Fail -En "content verification failed" -Zh "内容校验失败"
    }

    Say -En "[ok] verified: $($expected.Count) files linked, every hash matches" `
        -Zh "[ok] 校验通过: 已链接 $($expected.Count) 个文件，哈希全部一致" -Color Green
}

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
$PluginDir  = $PSScriptRoot
$ProfileDir = Join-Path $env:USERPROFILE ".dsh\profiles\$ProfileName"
$PkgPath    = Join-Path $ProfileDir 'package.json'
$NodeExe    = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$PnpmMjs    = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'
$PatchMjs   = Join-Path $PluginDir 'scripts\patch-profile.mjs'
$staleDir   = Join-Path $ProfileDir 'node_modules\dsh-xuexi'

Say -En "PowerShell          : $($PSVersionTable.PSVersion)" `
    -Zh "PowerShell 版本      : $($PSVersionTable.PSVersion)"
Say -En "Plugin dir          : $PluginDir" `
    -Zh "插件目录            : $PluginDir"
Say -En "Profile dir         : $ProfileDir" `
    -Zh "配置目录            : $ProfileDir"
if ($DryRun) {
    Say -En "Mode                : DRY RUN" `
        -Zh "运行模式            : 试运行 (DRY RUN)" -Color Yellow
}
Write-Host ""

# ---- preflight ------------------------------------------------------------
if (-not (Test-Path $PkgPath)) {
    Fail -En "profile package.json not found: $PkgPath" `
         -Zh "未找到配置文件 package.json: $PkgPath"
}
if (-not (Test-Path $NodeExe)) {
    Fail -En "node not found: $NodeExe" `
         -Zh "未找到 node: $NodeExe"
}
if (-not (Test-Path $PnpmMjs)) {
    Fail -En "pnpm not found: $PnpmMjs" `
         -Zh "未找到 pnpm: $PnpmMjs"
}
if (-not (Test-Path $PatchMjs)) {
    Fail -En "patch script not found: $PatchMjs" `
         -Zh "未找到补丁脚本: $PatchMjs"
}
Say -En "[ok] preflight passed" -Zh "[ok] 前置检查通过" -Color Green

# ---- verify-only path -----------------------------------------------------
# Check an existing install without changing anything:
#   .\install.ps1 -VerifyOnly
if ($VerifyOnly) {
    Say -En "[..] verifying installed copy ..." -Zh "[..] 正在校验已安装副本 ..."
    Write-Host ""
    Test-InstalledCopy -SourceDir $PluginDir -InstalledDir $staleDir
    exit 0
}

# ---- rollback path --------------------------------------------------------
if ($Rollback) {
    if (-not (Test-Path $Rollback)) {
        Fail -En "backup not found: $Rollback" `
             -Zh "未找到备份文件: $Rollback"
    }
    & $NodeExe $PatchMjs $PluginDir --rollback $Rollback
    if ($LASTEXITCODE -ne 0) {
        Fail -En "rollback failed" -Zh "回滚失败"
    }
    Write-Host ""
    Say -En "[..] running pnpm install ..." -Zh "[..] 正在执行 pnpm install ..."
    Push-Location $ProfileDir
    try { & $NodeExe $PnpmMjs install } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) {
        Fail -En "pnpm install failed" -Zh "pnpm install 失败"
    }
    Say -En "[ok] rollback completed. Restart DeepSeek Harness." `
        -Zh "[ok] 回滚完成。请重启 DeepSeek Harness。" -Color Green
    exit 0
}

# ---- 1) backup ------------------------------------------------------------
if (-not $DryRun) {
    $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "$PkgPath.bak-$stamp"
    Copy-Item $PkgPath $backup -Force
    Say -En "[ok] backup created: $backup" -Zh "[ok] 已创建备份: $backup"
}

# ---- 2) patch package.json (via Node) -------------------------------------
$patchArgs = @($PatchMjs, $PluginDir)
if ($DryRun) { $patchArgs += '--dry-run' }
& $NodeExe @patchArgs
if ($LASTEXITCODE -ne 0) {
    Fail -En "patch-profile.mjs failed" -Zh "patch-profile.mjs 执行失败"
}

if ($DryRun) {
    Write-Host ""
    Say -En "[dry] done. Re-run without -DryRun to apply." `
        -Zh "[dry] 试运行完成。去掉 -DryRun 参数重新运行即可应用更改。" -Color Green
    exit 0
}

# ---- 3) force a fresh link ------------------------------------------------
#
# pnpm materialises a `file:` dependency as a real COPY, not a symlink.
# Without deleting it first, edits to the plugin source (e.g. cordis.patch.yml)
# would not reach node_modules on a re-install.
#
# !! CRITICAL GOTCHA (measured, cost real debugging time) !!
#
# Deleting the copy and then running `pnpm install` DOES NOT WORK.
# pnpm prints "Already up to date" and never re-creates the directory --
# you end up with the plugin NOT installed and a green success message.
# `pnpm install --force` does NOT help either.
#
# `pnpm add <name>@file:<abs path>` is the only reliable way to re-link:
# it re-resolves the dependency and definitely re-materialises the copy.
# It leaves the existing version spec in package.json untouched.
#
if (Test-Path $staleDir) {
    Say -En "[..] removing stale installed copy: $staleDir" `
        -Zh "[..] 正在删除旧的已安装副本: $staleDir"
    Remove-Item $staleDir -Recurse -Force
    Say -En "[ok] stale copy removed" -Zh "[ok] 旧副本已删除" -Color Green
} else {
    Say -En "[i ] no existing copy to refresh" `
        -Zh "[i ] 没有需要刷新的旧副本"
}

# ---- 4) link via `pnpm add` ------------------------------------------------
$linkSpec = "dsh-xuexi@file:$($PluginDir -replace '\\','/')"
Write-Host ""
Say -En "[..] running: pnpm add $linkSpec" `
    -Zh "[..] 正在执行: pnpm add $linkSpec"
Push-Location $ProfileDir
try {
    & $NodeExe $PnpmMjs add $linkSpec
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($code -ne 0) {
    Write-Host ""
    Say -En "[FAIL] pnpm add exited with code $code" `
        -Zh "[FAIL] pnpm add 退出，代码 $code" -Color Red
    Say -En "Rollback:" -Zh "回滚命令:"
    Write-Host "  .\install.ps1 -Rollback `"$backup`""
    Fail -En "pnpm add failed" -Zh "pnpm add 失败"
}

# ---- 5) verify it is really there, with the RIGHT CONTENT -------------------
# Do not trust the exit code: the failure mode above produced exit code 0.
# A file count is not enough either -- see Test-InstalledCopy for why.
if (-not (Test-Path $staleDir)) {
    Write-Host ""
    Say -En "[FAIL] node_modules\dsh-xuexi is still missing after install." `
        -Zh "[FAIL] 安装后 node_modules\dsh-xuexi 仍然缺失。" -Color Red
    Say -En "       Try manually: cd `"$ProfileDir`"; pnpm add `"$linkSpec`"" `
        -Zh "       请手动尝试: cd `"$ProfileDir`"; pnpm add `"$linkSpec`""
    Fail -En "installed copy missing" -Zh "已安装副本缺失"
}
Test-InstalledCopy -SourceDir $PluginDir -InstalledDir $staleDir

Write-Host ""
Say -En "[ok] install completed" -Zh "[ok] 安装完成" -Color Green
Write-Host ""
Say -En "Next steps:" -Zh "后续步骤:"
Say -En "  1. Restart DeepSeek Harness." `
    -Zh "  1. 重启 DeepSeek Harness。"
Say -En "  2. Open Settings -> 'Agent preset' section (NOT a top dropdown)." `
    -Zh "  2. 打开 设置 -> 'Agent preset' 区域（不是顶部的下拉框）。"
Say -En "     The new mode appears under the CUSTOM group." `
    -Zh "     新模式会出现在 CUSTOM 分组下。"
Say -En "  3. If the new-task selector is missing, turn on General -> coding tools." `
    -Zh "  3. 如果新建任务选择器缺失，请打开 通用 -> coding tools。"
Say -En "  4. Pick the 'Wangke (online-course)' mode, then say: take over the browser first" `
    -Zh "  4. 选择 'Wangke (online-course)' 模式，然后说: take over the browser first"
Write-Host ""
Say -En "Rollback:" -Zh "回滚命令:"
Write-Host "  .\install.ps1 -Rollback `"$backup`""
