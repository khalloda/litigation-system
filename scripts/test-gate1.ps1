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

  The cases marked DRIFT are the reason for the 23 August 2026 rewrite. The
  gate used to demand the 19 August counts exactly, which would have refused
  every extraction from a copy of a file that moves 100 records a day. Those
  cases assert the new behaviour: growth passes, a FALL is put to the firm.

  This file is UTF-8 WITH a byte-order mark. It contains Arabic table names,
  and Windows PowerShell 5.1 reads a .ps1 without one as Windows-1252.
================================================================================
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib/gate1.ps1')

# A plausible SHA-256: 64 hex characters. The gate checks the shape, not the
# value -- it cannot recompute a digest it was handed.
$FakeSha = 'a' * 64

# A complete, correct extraction: the baseline every case varies from.
# It is deliberately NOT the 19 August figures + 0 drift in the interesting
# cases below; here it is, so the arithmetic is easy to follow.
function New-PerfectRun {
    $rows = @()
    foreach ($name in $script:Gate1ReferenceRows.Keys) {
        $n = $script:Gate1ReferenceRows[$name]
        $rows += [pscustomobject]@{
            name                 = $name
            row_count            = $n
            csv_rows_verified    = $n     # the file read back to the same count
            csv_columns_verified = 7
            plain_columns        = 7
            sha256               = $FakeSha
        }
    }
    return @{
        TableRows    = $rows
        TotalRows    = 30553
        Attachments  = 54
        MvfValues    = 288
        WarningCount = 0
        SourceInfo   = @{
            path         = 'D:\migration-source\Litigation database (ID 23194).accdb'
            bytes        = 46661632
            modified_utc = '2026-08-23T07:31:00.0000000Z'
            sha256       = $FakeSha
        }
        RelationshipPairs    = 21
        SelectedTables       = @()
        IncludeArchiveTables = $false
    }
}

# Add $Delta rows to one table and keep the total honest.
function Add-Rows {
    param([hashtable] $Run, [string] $Table, [int] $Delta)
    $row = $Run.TableRows | Where-Object { $_.name -eq $Table }
    $row.row_count         = $row.row_count + $Delta
    $row.csv_rows_verified = $row.row_count
    $Run.TotalRows         = $Run.TotalRows + $Delta
    return $Run
}

$failed = 0

function Test-Case {
    param(
        [string] $Name,
        [hashtable] $Run,
        [ValidateSet('pass', 'fail', 'concern', 'diagnostic')] [string] $Expect,
        [string] $Because = ''
    )

    $result = Test-Gate1 -TableRows $Run.TableRows `
                         -TotalRows $Run.TotalRows `
                         -Attachments $Run.Attachments `
                         -MvfValues $Run.MvfValues `
                         -WarningCount $Run.WarningCount `
                         -SourceInfo $Run.SourceInfo `
                         -RelationshipPairs $Run.RelationshipPairs `
                         -SelectedTables $Run.SelectedTables `
                         -IncludeArchiveTables:$Run.IncludeArchiveTables

    $actual =
        if (-not $result.Gated)               { 'diagnostic' }
        elseif ($result.Failures.Count -gt 0) { 'fail' }
        elseif ($result.Concerns.Count -gt 0) { 'concern' }
        else                                  { 'pass' }

    $problems = @()
    if ($actual -ne $Expect) {
        $problems += "expected '$Expect', got '$actual'"
    }
    if ($Because -and ($Expect -eq 'fail' -or $Expect -eq 'concern')) {
        $said = @($result.Failures) + @($result.Concerns)
        $matched = $said | Where-Object { $_ -like "*$Because*" }
        if (-not $matched) {
            $problems += "nothing said mentioned '$Because'"
        }
    }

    if ($problems.Count -eq 0) {
        Write-Host ("  ok    {0}" -f $Name)
    } else {
        $script:failed++
        Write-Host ("  FAIL  {0}" -f $Name) -ForegroundColor Red
        foreach ($p in $problems) { Write-Host ("          {0}" -f $p) -ForegroundColor Red }
        foreach ($f in $result.Failures) { Write-Host ("          failure: {0}" -f $f) }
        foreach ($c in $result.Concerns) { Write-Host ("          concern: {0}" -f $c) }
    }
}

Write-Host ""

# --- the happy path ---------------------------------------------------------
Test-Case 'a complete, correct extraction passes' (New-PerfectRun) 'pass'

# ===========================================================================
#  DRIFT -- the 23 August 2026 rewrite. These are the cases the OLD gate got
#  wrong: it demanded the 19 August counts exactly and would have refused
#  every one of them.
# ===========================================================================

# Four days of ordinary use across the whole file.
$run = New-PerfectRun
$run = Add-Rows $run 'الجلسات'  260
$run = Add-Rows $run 'الدعاوى'   18
$run = Add-Rows $run 'العملاء'    4
$run = Add-Rows $run 'الفواتير'  11
Test-Case 'DRIFT: four days of growth across four tables PASSES' $run 'pass'

# A single new row in the smallest table.
$run = Add-Rows (New-PerfectRun) 'فريق العمل' 1
Test-Case 'DRIFT: one new team member passes -- and raises nothing' $run 'pass'

# A count that has fallen is the opposite of drift. The file grows.
$run = Add-Rows (New-PerfectRun) 'الجلسات' -1
Test-Case 'DRIFT: one hearing FEWER than 19 August goes to the firm' $run 'concern' 'FALLEN'

# ...and it blocks, rather than being printed and passed over.
$run = Add-Rows (New-PerfectRun) 'الدعاوى' -200
Test-Case 'DRIFT: 200 matters fewer blocks Stage B' $run 'concern' 'الدعاوى'

# A broken read that still produced rows: 13,279 -> 412 is not drift.
$run = Add-Rows (New-PerfectRun) 'الجلسات' -12867
Test-Case 'DRIFT: a hearings table read as 412 rows goes to the firm' $run 'concern' 'FALLEN'

# Growth so large it is not four days of a busy office.
$run = Add-Rows (New-PerfectRun) 'الجلسات' 13279
Test-Case 'DRIFT: a hearings table that has DOUBLED goes to the firm' $run 'concern' 'DOUBLED or more'

# ...but a small table doubling is noise, not a signal.
$run = Add-Rows (New-PerfectRun) 'lawyers' 24
Test-Case 'DRIFT: `lawyers` 23 -> 47 is below the floor and passes quietly' $run 'pass'

# ===========================================================================
#  RE-REVIEW -- the three bypasses that each printed "GATE 1 PASSED"
# ===========================================================================

# RE-REVIEW 1: a missing table masked by an unrelated table of equal size.
# The worst of the three. The total was doing duty as a completeness check,
# and a total cannot tell a missing table from a different one.
$run = New-PerfectRun
$run.TableRows = @($run.TableRows | Where-Object { $_.name -ne 'lawyers' })
$run.TableRows += [pscustomobject]@{
    name = 'some_other_table'; row_count = 23; csv_rows_verified = 23
    csv_columns_verified = 7; plain_columns = 7; sha256 = $FakeSha
}
Test-Case 'RE-REVIEW: `lawyers` missing, an unrelated 23-row table makes the total add up' `
    $run 'fail' 'lawyers'

Test-Case 'RE-REVIEW: the stray table that masked it is also rejected' `
    $run 'fail' 'some_other_table'

# RE-REVIEW 2: -Tables used to pass with no complex columns at all.
$run = New-PerfectRun
$run.SelectedTables = @('العملاء')
$run.TableRows = @([pscustomobject]@{
    name = 'العملاء'; row_count = 313; csv_rows_verified = 313
    csv_columns_verified = 7; plain_columns = 7; sha256 = $FakeSha
})
$run.TotalRows = 313
$run.Attachments = 0
$run.MvfValues = 0
Test-Case 'RE-REVIEW: -Tables with 0 attachments and 0 mvf is a diagnostic, never a pass' `
    $run 'diagnostic'

# RE-REVIEW 3: -IncludeArchiveTables used to pass with doubled counts.
$run = New-PerfectRun
$run.IncludeArchiveTables = $true
$run.Attachments = 108
$run.TotalRows = 99999
Test-Case 'RE-REVIEW: -IncludeArchiveTables with 108 attachments and 99,999 rows is a diagnostic' `
    $run 'diagnostic'

# ===========================================================================
#  THE COMPLEX COLUMNS -- still exact, deliberately
# ===========================================================================
$run = New-PerfectRun; $run.Attachments = 0
Test-Case '0 attachments fails' $run 'fail' 'silent-failure export'

$run = New-PerfectRun; $run.Attachments = 53
Test-Case '53 attachments fails -- a partial read, not drift' $run 'fail' 'attachments 53'

$run = New-PerfectRun; $run.MvfValues = 0
Test-Case '0 multi-value entries fails' $run 'fail' 'silent-failure export'

$run = New-PerfectRun; $run.MvfValues = 287
Test-Case '287 multi-value entries fails' $run 'fail' 'multi-value entries 287'

# ===========================================================================
#  COMPLETENESS
# ===========================================================================
$run = New-PerfectRun
$run.TableRows = @($run.TableRows | Where-Object { $_.name -ne 'فريق العمل' })
$run.TotalRows = 30550
Test-Case 'a missing table fails even when nothing replaces it' $run 'fail' 'MISSING'

# An empty table is the new failure the count check used to cover for free.
$run = Add-Rows (New-PerfectRun) 'التوكيلات' -735
Test-Case 'a table extracted as 0 rows fails -- opened, read as nothing, header written' `
    $run 'fail' 'extracted 0 rows'

# RED TEAM: a duplicate expected table. The correct 15 entries plus a second,
# EMPTY `lawyers`. Every name is present and nothing unexpected appears, so
# the gate reported "exact" -- but a loader reading that manifest could act on
# the empty duplicate.
$run = New-PerfectRun
$run.TableRows += [pscustomobject]@{
    name = 'lawyers'; row_count = 0; csv_rows_verified = 0
    csv_columns_verified = 7; plain_columns = 7; sha256 = $FakeSha
}
Test-Case 'RED TEAM: a duplicate, empty `lawyers` entry fails' $run 'fail' 'appears 2 times'

$run = New-PerfectRun
$run.TableRows += [pscustomobject]@{
    name = 'lawyers'; row_count = 23; csv_rows_verified = 23
    csv_columns_verified = 7; plain_columns = 7; sha256 = $FakeSha
}
$run.TotalRows = 30576
Test-Case 'a duplicate with the correct count also fails' $run 'fail' 'appears 2 times'

# ===========================================================================
#  SELF-CONSISTENCY -- the check that replaced the constants
# ===========================================================================
$run = New-PerfectRun
($run.TableRows | Where-Object { $_.name -eq 'الجلسات' }).csv_rows_verified = 13278
Test-Case 'a CSV that parses back one row short fails' $run 'fail' 'parse back out of the CSV'

$run = New-PerfectRun
($run.TableRows | Where-Object { $_.name -eq 'الجلسات' }).csv_rows_verified = $null
Test-Case 'a table whose CSV was never read back fails' $run 'fail' 'never read back'

$run = New-PerfectRun
($run.TableRows | Where-Object { $_.name -eq 'العملاء' }).csv_columns_verified = 6
Test-Case 'a CSV that parses back with a column missing fails' $run 'fail' 'columns written'

$run = New-PerfectRun
($run.TableRows | Where-Object { $_.name -eq 'العملاء' }).sha256 = ''
Test-Case 'a table with no SHA-256 recorded fails' $run 'fail' 'no SHA-256'

# ===========================================================================
#  PROVENANCE -- which file did this come from?
# ===========================================================================
foreach ($key in @('path', 'bytes', 'modified_utc', 'sha256')) {
    $run = New-PerfectRun
    $run.SourceInfo.Remove($key)
    Test-Case ("a manifest with no source {0} fails" -f $key) $run 'fail' $key
}

$run = New-PerfectRun
$run.SourceInfo['sha256'] = 'not-a-digest'
Test-Case 'a source SHA-256 that is not a digest fails' $run 'fail' '64-character hex'

$run = New-PerfectRun
$run.SourceInfo['bytes'] = 0
Test-Case 'a source file of 0 bytes fails' $run 'fail' '0 bytes'

# ===========================================================================
#  RELATIONSHIPS, ARITHMETIC, WARNINGS
# ===========================================================================
$run = New-PerfectRun; $run.RelationshipPairs = 0
Test-Case 'no relationships exported fails -- the foreign keys are unrebuildable' `
    $run 'fail' 'no relationships'

$run = New-PerfectRun; $run.TotalRows = 30554
Test-Case 'a total that disagrees with the sum of the per-table counts fails' `
    $run 'fail' 'does not equal the sum'

$run = New-PerfectRun; $run.WarningCount = 1
Test-Case 'a single warning fails' $run 'fail' 'warning'

Write-Host ""
if ($failed -gt 0) {
    Write-Host ("{0} gate test(s) failed." -f $failed) -ForegroundColor Red
    exit 1
}
Write-Host "test:gate1 -- all cases correct." -ForegroundColor Green
exit 0
