<#
================================================================================
  Tests for Gate 1.

      pwsh -File scripts/test-gate1.ps1
      npm run test:gate1

  No Access database is needed: the gate is a pure decision over a manifest,
  so the manifests here are synthetic. That is the point of keeping it in
  scripts/lib/gate1.ps1 rather than inline in the extractor.

  Every case below is a way Gate 1 has actually been wrong, or a way it must
  stay right. The three marked RE-REVIEW are the bypasses Codex proved after
  the first fix: each one printed "GATE 1 PASSED" on an incomplete extraction.

  This file is UTF-8 WITH a byte-order mark. It contains Arabic table names,
  and Windows PowerShell 5.1 reads a .ps1 without one as Windows-1252.
================================================================================
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib/gate1.ps1')

# A complete, correct extraction: the baseline every case varies from.
function New-PerfectRun {
    $rows = @()
    foreach ($name in $script:Gate1ExpectedRows.Keys) {
        $rows += [pscustomobject]@{ name = $name; row_count = $script:Gate1ExpectedRows[$name] }
    }
    return @{
        TableRows    = $rows
        TotalRows    = 30553
        Attachments  = 54
        MvfValues    = 288
        WarningCount = 0
        SelectedTables = @()
        IncludeArchiveTables = $false
    }
}

$failed = 0

function Test-Case {
    param(
        [string] $Name,
        [hashtable] $Run,
        [ValidateSet('pass', 'fail', 'diagnostic')] [string] $Expect,
        [string] $Because = ''
    )

    $result = Test-Gate1 -TableRows $Run.TableRows `
                         -TotalRows $Run.TotalRows `
                         -Attachments $Run.Attachments `
                         -MvfValues $Run.MvfValues `
                         -WarningCount $Run.WarningCount `
                         -SelectedTables $Run.SelectedTables `
                         -IncludeArchiveTables:$Run.IncludeArchiveTables

    $actual =
        if (-not $result.Gated)             { 'diagnostic' }
        elseif ($result.Failures.Count -gt 0) { 'fail' }
        else                                  { 'pass' }

    $problems = @()
    if ($actual -ne $Expect) {
        $problems += "expected '$Expect', got '$actual'"
    }
    if ($Because -and $Expect -eq 'fail') {
        $matched = $result.Failures | Where-Object { $_ -like "*$Because*" }
        if (-not $matched) {
            $problems += "no failure mentioned '$Because'"
        }
    }

    if ($problems.Count -eq 0) {
        Write-Host ("  ok    {0}" -f $Name)
    } else {
        $script:failed++
        Write-Host ("  FAIL  {0}" -f $Name) -ForegroundColor Red
        foreach ($p in $problems) { Write-Host ("          {0}" -f $p) -ForegroundColor Red }
        foreach ($f in $result.Failures) { Write-Host ("          said: {0}" -f $f) }
    }
}

Write-Host ""

# --- the happy path ---------------------------------------------------------
Test-Case 'a complete, correct extraction passes' (New-PerfectRun) 'pass'

# --- RE-REVIEW 1: a missing table masked by an unrelated table of equal size -
# This is the worst of the three. The total was doing duty as a completeness
# check, and a total cannot tell a missing table from a different one.
$run = New-PerfectRun
$run.TableRows = @($run.TableRows | Where-Object { $_.name -ne 'lawyers' })
$run.TableRows += [pscustomobject]@{ name = 'some_other_table'; row_count = 23 }
Test-Case 'RE-REVIEW: `lawyers` missing, an unrelated 23-row table makes the total add up' `
    $run 'fail' 'lawyers'

# ...and the stray table is itself reported, not merely tolerated.
Test-Case 'RE-REVIEW: the stray table that masked it is also rejected' `
    $run 'fail' 'some_other_table'

# --- RE-REVIEW 2: -Tables used to pass with no complex columns at all -------
$run = New-PerfectRun
$run.SelectedTables = @('العملاء')
$run.TableRows = @([pscustomobject]@{ name = 'العملاء'; row_count = 313 })
$run.TotalRows = 313
$run.Attachments = 0
$run.MvfValues = 0
Test-Case 'RE-REVIEW: -Tables with 0 attachments and 0 mvf is a diagnostic, never a pass' `
    $run 'diagnostic'

# --- RE-REVIEW 3: -IncludeArchiveTables used to pass with doubled counts ----
$run = New-PerfectRun
$run.IncludeArchiveTables = $true
$run.Attachments = 108
$run.TotalRows = 99999
Test-Case 'RE-REVIEW: -IncludeArchiveTables with 108 attachments and 99,999 rows is a diagnostic' `
    $run 'diagnostic'

# --- the complex columns ----------------------------------------------------
$run = New-PerfectRun; $run.Attachments = 0
Test-Case '0 attachments fails' $run 'fail' 'attachments 0'

$run = New-PerfectRun; $run.Attachments = 53
Test-Case '53 attachments fails' $run 'fail' 'attachments 53'

$run = New-PerfectRun; $run.MvfValues = 0
Test-Case '0 multi-value entries fails' $run 'fail' 'multi-value entries 0'

$run = New-PerfectRun; $run.MvfValues = 287
Test-Case '287 multi-value entries fails' $run 'fail' 'multi-value entries 287'

# --- per-table counts -------------------------------------------------------
$run = New-PerfectRun
($run.TableRows | Where-Object { $_.name -eq 'الجلسات' }).row_count = 13278
$run.TotalRows = 30552
Test-Case 'one hearing missing fails' $run 'fail' 'الجلسات'

# --- a missing table with the total left untouched --------------------------
$run = New-PerfectRun
$run.TableRows = @($run.TableRows | Where-Object { $_.name -ne 'فريق العمل' })
Test-Case 'a missing table fails even when nothing replaces it' $run 'fail' 'MISSING'

# --- warnings ---------------------------------------------------------------
$run = New-PerfectRun; $run.WarningCount = 1
Test-Case 'a single warning fails' $run 'fail' 'warning'

# --- the total as a cross-check --------------------------------------------
$run = New-PerfectRun; $run.TotalRows = 30554
Test-Case 'a total that disagrees with the per-table counts fails' $run 'fail' 'total rows'

Write-Host ""
if ($failed -gt 0) {
    Write-Host ("{0} gate test(s) failed." -f $failed) -ForegroundColor Red
    exit 1
}
Write-Host "test:gate1 -- 13 cases, all correct." -ForegroundColor Green
exit 0
