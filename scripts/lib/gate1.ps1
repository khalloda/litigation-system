<#
================================================================================
  Gate 1 -- the completeness test for a Stage A extraction.

  Kept in its own file, separate from the extraction, for two reasons:

    1. The gate must be INDEPENDENT of how the extractor was invoked. Three of
       its holes came from the expectations being adjusted to match the mode
       the script happened to be running in.
    2. It can then be tested on its own, against synthetic manifests, without
       an Access database. See scripts/test-gate1.ps1.

  WHAT IT DECIDES

  A run is GATED only when the extraction was full and default. Both switches
  change what is extracted, so neither can satisfy the expected set. Those runs
  are diagnostics: they are labelled as such and never report a pass.

  A gated run turns green only for the exact migration set:
     * every expected table present     (a missing table cannot be masked)
     * no unexpected table present      (a stray table cannot stand in)
     * every per-table count exact
     * 30,553 rows in total
     * exactly 54 attachments
     * exactly 288 multi-value entries
     * zero warnings

  This file is UTF-8 WITH a byte-order mark. Windows PowerShell 5.1 reads a
  .ps1 without one as Windows-1252 and corrupts every Arabic table name below.
================================================================================
#>

# The migration set, per docs/MIGRATION.md Gate 1. If the firm's data has
# genuinely changed -- it is in daily use and drifts about 100 records a day --
# update these deliberately, in the same commit as the reason.
$script:Gate1ExpectedRows = [ordered]@{
    'الجلسات'          = 13279
    'admin work table' = 4207
    'إجراءات المهام'   = 4130
    'Attendance'       = 4022
    'الدعاوى'          = 1730
    'التوكيلات'        = 735
    'السداد'           = 597
    'الفواتير'         = 543
    'المستندات'        = 405
    'خطابات الأتعاب'   = 331
    'العملاء'          = 313
    'Contacts'         = 188
    'تقسيم التحصيلات'  = 47
    'lawyers'          = 23
    'فريق العمل'       = 3
}
$script:Gate1ExpectedTotalRows   = 30553   # the sum of the table above
$script:Gate1ExpectedAttachments = 54      # العملاء.logo -- the 54 client logos
$script:Gate1ExpectedMvfValues   = 288     # خطابات الأتعاب.Matter, 195 parents


function Test-Gate1 {
    <#
      Pure: takes what the extraction produced, returns a verdict. Prints
      nothing and exits nothing, so it can be tested.

      Returns a hashtable:
        Gated    [bool]     was this a gateable run at all?
        Reason   [string]   if not gated, why not
        Failures [string[]] empty means pass
    #>
    param(
        [Parameter(Mandatory = $true)] [object[]] $TableRows,   # name + row_count
        [Parameter(Mandatory = $true)] [int]      $TotalRows,
        [Parameter(Mandatory = $true)] [int]      $Attachments,
        [Parameter(Mandatory = $true)] [int]      $MvfValues,
        [Parameter(Mandatory = $true)] [int]      $WarningCount,
        [string[]] $SelectedTables = @(),
        [switch]   $IncludeArchiveTables
    )

    $failures = [System.Collections.Generic.List[string]]::new()

    # -- is this gateable at all? -------------------------------------------
    if ($SelectedTables.Count -gt 0) {
        return @{ Gated = $false; Reason = '-Tables was used'; Failures = @() }
    }
    if ($IncludeArchiveTables) {
        return @{ Gated = $false; Reason = '-IncludeArchiveTables was used'; Failures = @() }
    }

    $names = @($TableRows | ForEach-Object { $_.name })

    # -- 1. every expected table must be PRESENT ----------------------------
    # Unconditionally. The previous version only checked a table if it already
    # appeared in the manifest, so a missing table was simply not noticed.
    foreach ($name in $script:Gate1ExpectedRows.Keys) {
        if ($names -notcontains $name) {
            $failures.Add("expected table '$name' is MISSING from the extraction")
        }
    }

    # -- 2. no unexpected table may be present ------------------------------
    # A stray table can otherwise stand in for a missing one and keep the total
    # looking right. If a genuinely new table has appeared in the Access file,
    # the firm should hear about it before a migration, not after.
    foreach ($name in $names) {
        if (-not $script:Gate1ExpectedRows.Contains($name)) {
            $failures.Add("unexpected table '$name' was extracted -- it is not in the migration set")
        }
    }

    # -- 3. every expected table must have the expected count ---------------
    foreach ($name in $script:Gate1ExpectedRows.Keys) {
        $row = $TableRows | Where-Object { $_.name -eq $name } | Select-Object -First 1
        if ($null -eq $row) { continue }   # already reported as missing
        if ([int]$row.row_count -ne $script:Gate1ExpectedRows[$name]) {
            $failures.Add(("table '{0}': {1:N0} rows, expected {2:N0}" -f `
                $name, [int]$row.row_count, $script:Gate1ExpectedRows[$name]))
        }
    }

    # -- 4. the total, as a cross-check and nothing more --------------------
    # The per-table assertions above are the real completeness check. This
    # catches arithmetic drift against docs/MIGRATION.md. It is NOT a
    # substitute: a total cannot tell a missing table from a smaller one
    # elsewhere, which is exactly how a missing `lawyers` slipped through.
    if ($TotalRows -ne $script:Gate1ExpectedTotalRows) {
        $failures.Add(("total rows {0:N0}, expected {1:N0}" -f `
            $TotalRows, $script:Gate1ExpectedTotalRows))
    }

    # -- 5. the complex columns: the whole reason the extractor exists ------
    if ($Attachments -ne $script:Gate1ExpectedAttachments) {
        $failures.Add(("attachments {0}, expected exactly {1}. A CSV export destroys these; if this is 0 the complex-column read failed silently" -f `
            $Attachments, $script:Gate1ExpectedAttachments))
    }
    if ($MvfValues -ne $script:Gate1ExpectedMvfValues) {
        $failures.Add(("multi-value entries {0}, expected exactly {1}" -f `
            $MvfValues, $script:Gate1ExpectedMvfValues))
    }

    # -- 6. any warning at all is a failure ---------------------------------
    # A complex-column read that threw was previously recorded and forgotten.
    # There is no such thing as an acceptable warning in a lossless extraction.
    if ($WarningCount -gt 0) {
        $failures.Add("$WarningCount warning(s) were recorded")
    }

    return @{ Gated = $true; Reason = ''; Failures = @($failures) }
}


function Write-Gate1Result {
    <#
      Prints the verdict and exits with the right code. Split from Test-Gate1
      so the decision can be tested without a process exiting.
    #>
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Result,
        [Parameter(Mandatory = $true)] [int] $TotalRows,
        [Parameter(Mandatory = $true)] [int] $Attachments,
        [Parameter(Mandatory = $true)] [int] $MvfValues,
        [Parameter(Mandatory = $true)] [int] $WarningCount,
        [int] $TableCount = 0,
        [string] $ManifestPath = '',
        [string] $WarningsPath = ''
    )

    Write-Host ""

    if (-not $Result.Gated) {
        Write-Host "==========================================================" -ForegroundColor Yellow
        Write-Host " DIAGNOSTIC RUN -- NOT GATED" -ForegroundColor Yellow
        Write-Host "==========================================================" -ForegroundColor Yellow
        Write-Host ("  {0}, so this is a partial extraction." -f $Result.Reason) -ForegroundColor Yellow
        Write-Host ""
        Write-Host ("  tables       : {0}" -f $TableCount)
        Write-Host ("  rows         : {0:N0}" -f $TotalRows)
        Write-Host ("  attachments  : {0}" -f $Attachments)
        Write-Host ("  mvf values   : {0}" -f $MvfValues)
        Write-Host ("  warnings     : {0}" -f $WarningCount)
        Write-Host ""
        Write-Host "  Gate 1 has NOT been evaluated. These numbers prove nothing" -ForegroundColor Yellow
        Write-Host "  about completeness, and Stage B must not run on this output." -ForegroundColor Yellow
        Write-Host "  For a gated extraction, run the script with no switches." -ForegroundColor Yellow
        Write-Host ""
        if ($ManifestPath) { Write-Host "Manifest: $ManifestPath" }
        return 0
    }

    if ($Result.Failures.Count -gt 0) {
        Write-Host "==========================================================" -ForegroundColor Red
        Write-Host " GATE 1 FAILED -- DO NOT PROCEED TO STAGE B" -ForegroundColor Red
        Write-Host "==========================================================" -ForegroundColor Red
        foreach ($f in $Result.Failures) { Write-Host "  $f" -ForegroundColor Red }
        if ($WarningCount -gt 0 -and $WarningsPath) {
            Write-Host "  see $WarningsPath" -ForegroundColor Red
        }
        Write-Host ""
        Write-Host "  The extraction is not a complete copy of the database." -ForegroundColor Red
        Write-Host "  Loading it would lose data silently. See docs/MIGRATION.md." -ForegroundColor Red
        Write-Host ""
        return 1
    }

    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " GATE 1 PASSED" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host ("  tables       : {0} of {0}, all present, all counts exact" -f `
        $script:Gate1ExpectedRows.Count)
    Write-Host ("  rows         : {0:N0}" -f $TotalRows)
    Write-Host ("  attachments  : {0}" -f $Attachments)
    Write-Host ("  mvf values   : {0}" -f $MvfValues)
    Write-Host  "  warnings     : 0"
    Write-Host ""
    if ($ManifestPath) { Write-Host "Manifest: $ManifestPath" }
    return 0
}
