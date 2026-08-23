<#
================================================================================
  Gate 1 -- the completeness test for a Stage A extraction.

  Kept in its own file, separate from the extraction, for two reasons:

    1. The gate must be INDEPENDENT of how the extractor was invoked. Three of
       its holes came from the expectations being adjusted to match the mode
       the script happened to be running in.
    2. It can then be tested on its own, against synthetic manifests, without
       an Access database. See scripts/test-gate1.ps1.

  WHAT IT DECIDES  -- rewritten 23 August 2026, task 2.1

  The 19 August counts used to be a pass condition: every table had to match
  exactly or the script exited non-zero. The firm ruled that wrong, and it is.
  The Access file is in daily use and drifts about 100 records a day, so every
  copy we ever extract from -- every rehearsal copy, and the real one on
  cutover day -- has already moved away from 19 August. A gate that demanded
  13,279 hearings would refuse a perfectly good extraction, and the natural
  response to a gate that fails on correct data is to loosen it until it
  passes. At that point it has stopped being a check while still looking like
  one.

  So the August figures are now a SHAPE check: reported beside what was
  actually read, with the difference shown. What the gate ASSERTS is:

     * provenance     the manifest records which file was read -- path, size,
                      modification date, SHA-256. Three weeks from now
                      "which extraction produced this?" is answered by the
                      manifest and not by memory
     * self-consistency  every CSV parses back out to exactly the number of
                      rows read from Access, with its column count intact and
                      a SHA-256 recorded
     * completeness   all 15 expected tables present, exactly once each, none
                      empty, and no unexpected table standing in for one
     * relationships  the relationship export is not empty -- without it the
                      foreign keys cannot be rebuilt in the target
     * arithmetic     the reported total equals the sum of the per-table counts
     * complex cols   attachments and multi-value entries EXACTLY as expected.
                      These two stay exact deliberately: they come from Access
                      complex columns, where the failure mode is a silent zero
                      that a "> 0" floor would catch but a wrong-by-one would
                      not. Ruled by the firm, 23 August 2026
     * no warnings    any warning at all is a failure

  And it RAISES A CONCERN -- which also blocks Stage B, but is a question for
  the firm rather than a broken extraction -- when a count has fallen below
  its August figure, or has more than doubled. The file grows about 100
  records a day; it does not shrink, and it does not double in a week.

  This file is UTF-8 WITH a byte-order mark. Windows PowerShell 5.1 reads a
  .ps1 without one as Windows-1252 and corrupts every Arabic table name below.
================================================================================
#>

# ---------------------------------------------------------------------------
#  The 19 August 2026 reference. A SHAPE CHECK, NOT A PASS CONDITION.
#
#  Nothing here is compared for equality. These are the figures the extraction
#  is reported against, so a human can see 13,279 -> 13,4xx as drift and
#  13,279 -> 412 as a broken read. If the firm ever RE-BASELINES -- because it
#  has taken a new reference reading, not because the data drifted -- change
#  them deliberately, in the same commit as the reason.
# ---------------------------------------------------------------------------
$script:Gate1ReferenceDate = '19 August 2026'

$script:Gate1ReferenceRows = [ordered]@{
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
$script:Gate1ReferenceTotalRows = 30553   # the sum of the table above, on that date

# ---------------------------------------------------------------------------
#  The two figures that ARE asserted for equality.
#
#  These come from Access complex columns -- the ones a plain CSV export loses
#  silently, which is the whole reason the extractor exists. The failure mode
#  there is not drift, it is a zero: the read throws or returns nothing and the
#  export still reports success. They are asserted exactly rather than as a
#  floor so that a PARTIAL read is caught too.
#
#  If the firm adds a client logo or a fee letter these move, and Gate 1 will
#  fail on an otherwise good extraction until they are updated deliberately
#  here, with the reason. That is intended: a logo appearing is something the
#  firm should confirm, not something a gate should wave through.
# ---------------------------------------------------------------------------
$script:Gate1ExpectedAttachments = 54      # العملاء.logo -- the 54 client logos
$script:Gate1ExpectedMvfValues   = 288     # خطابات الأتعاب.Matter, 195 parents

# A count at or above this multiple of its August figure is not daily drift...
$script:Gate1GrowthConcernFactor = 2.0
# ...but only worth raising once the absolute change is bigger than noise, so
# a 3-row table gaining one member does not shout.
$script:Gate1GrowthConcernFloor  = 250


function Test-Gate1 {
    <#
      Pure: takes what the extraction produced, returns a verdict. Prints
      nothing and exits nothing, so it can be tested.

      Returns a hashtable:
        Gated    [bool]     was this a gateable run at all?
        Reason   [string]   if not gated, why not
        Failures [string[]] the extraction is wrong. Empty means none
        Concerns [string[]] the extraction looks intact, but a count moved in
                            a direction the firm should see. Also blocks
        Shape    [object[]] per-table actual against 19 August, for reporting
    #>
    param(
        # name, row_count, csv_rows_verified, csv_columns_verified,
        # plain_columns, sha256
        [Parameter(Mandatory = $true)] [object[]] $TableRows,
        [Parameter(Mandatory = $true)] [int]      $TotalRows,
        [Parameter(Mandatory = $true)] [int]      $Attachments,
        [Parameter(Mandatory = $true)] [int]      $MvfValues,
        [Parameter(Mandatory = $true)] [int]      $WarningCount,

        # path / bytes / modified_utc / sha256 of the .accdb actually read
        [hashtable] $SourceInfo = @{},
        [int]       $RelationshipPairs = 0,

        [string[]] $SelectedTables = @(),
        [switch]   $IncludeArchiveTables
    )

    $failures = [System.Collections.Generic.List[string]]::new()
    $concerns = [System.Collections.Generic.List[string]]::new()

    # -- is this gateable at all? -------------------------------------------
    # Both switches change WHAT is extracted, so neither run can satisfy the
    # expected set. Those runs are diagnostics and never report a pass.
    if ($SelectedTables.Count -gt 0) {
        return @{ Gated = $false; Reason = '-Tables was used'
                  Failures = @(); Concerns = @(); Shape = @() }
    }
    if ($IncludeArchiveTables) {
        return @{ Gated = $false; Reason = '-IncludeArchiveTables was used'
                  Failures = @(); Concerns = @(); Shape = @() }
    }

    $names = @($TableRows | ForEach-Object { $_.name })

    # =======================================================================
    #  1. PROVENANCE -- which file did this come from?
    #
    #  An extraction that cannot name its source is not evidence of anything.
    #  Three weeks from now, "which extraction produced this?" has to be
    #  answerable from the manifest rather than from anyone's memory; and on
    #  cutover day it is the proof that the frozen production file, not a
    #  stale rehearsal copy, is what was read.
    # =======================================================================
    foreach ($key in @('path', 'bytes', 'modified_utc', 'sha256')) {
        if (-not $SourceInfo.ContainsKey($key) -or
            $null -eq $SourceInfo[$key] -or
            [string]::IsNullOrWhiteSpace([string]$SourceInfo[$key])) {
            $failures.Add("the manifest does not record the source file's $key")
        }
    }
    if ($SourceInfo.ContainsKey('bytes') -and
        $null -ne $SourceInfo['bytes'] -and
        [int64]$SourceInfo['bytes'] -le 0) {
        $failures.Add('the manifest records a source file of 0 bytes')
    }
    if ($SourceInfo.ContainsKey('sha256') -and
        [string]$SourceInfo['sha256'] -notmatch '^[0-9A-Fa-f]{64}$') {
        $failures.Add(("the source SHA-256 is not a 64-character hex digest: '{0}'" -f `
            $SourceInfo['sha256']))
    }

    # =======================================================================
    #  2. COMPLETENESS -- the right tables, once each, none empty
    # =======================================================================

    # -- every expected table must be PRESENT -------------------------------
    # Unconditionally. An earlier version only checked a table if it already
    # appeared in the manifest, so a missing table was simply not noticed.
    foreach ($name in $script:Gate1ReferenceRows.Keys) {
        if ($names -notcontains $name) {
            $failures.Add("expected table '$name' is MISSING from the extraction")
        }
    }

    # -- no unexpected table may be present ---------------------------------
    # A stray table can otherwise stand in for a missing one. If a genuinely
    # new table has appeared in the Access file, the firm should hear about it
    # before a migration, not after.
    foreach ($name in $names) {
        if (-not $script:Gate1ReferenceRows.Contains($name)) {
            $failures.Add("unexpected table '$name' was extracted -- it is not in the migration set")
        }
    }

    # -- each table must appear EXACTLY ONCE --------------------------------
    #
    # "Every expected name is present" and "nothing unexpected appears" both
    # held for a manifest carrying the correct 15 entries PLUS a second, empty
    # `lawyers`. The gate reported exact. A later loader reading that manifest
    # could act on either entry, and one of them holds no rows.
    foreach ($group in ($names | Group-Object)) {
        if ($group.Count -gt 1) {
            $failures.Add(
                ("table '{0}' appears {1} times in the manifest -- expected exactly once" -f `
                    $group.Name, $group.Count))
        }
    }

    # -- no expected table may be empty -------------------------------------
    # The counts are no longer asserted, so this is what now stops a table
    # that was opened, read as nothing, and written as a bare header line.
    foreach ($row in $TableRows) {
        if (-not $script:Gate1ReferenceRows.Contains($row.name)) { continue }
        if ([int]$row.row_count -le 0) {
            $failures.Add(("table '{0}' extracted 0 rows -- it held {1:N0} on {2}" -f `
                $row.name, $script:Gate1ReferenceRows[$row.name], $script:Gate1ReferenceDate))
        }
    }

    # =======================================================================
    #  3. SELF-CONSISTENCY -- did the bytes on disk survive the trip?
    #
    #  This is the real question Gate 1 answers, and the only one that needs
    #  no prior figure and cannot drift: the CSV is read back off the disk and
    #  parsed, and the records that come out must equal the rows that went in.
    #  Counting our own writes would only prove the loop ran.
    # =======================================================================
    foreach ($row in $TableRows) {

        $verified = $null
        if ($row.PSObject.Properties.Name -contains 'csv_rows_verified') {
            $verified = $row.csv_rows_verified
        }

        if ($null -eq $verified -or [string]::IsNullOrWhiteSpace([string]$verified)) {
            $failures.Add(("table '{0}': the written CSV was never read back and verified" -f $row.name))
        }
        elseif ([int]$verified -ne [int]$row.row_count) {
            $failures.Add(("table '{0}': {1:N0} rows read from Access but {2:N0} parse back out of the CSV -- the file on disk is not what was read" -f `
                $row.name, [int]$row.row_count, [int]$verified))
        }

        if (($row.PSObject.Properties.Name -contains 'csv_columns_verified') -and
            ($row.PSObject.Properties.Name -contains 'plain_columns') -and
            [int]$row.row_count -gt 0) {
            $cols = $row.csv_columns_verified
            if ($null -ne $cols -and
                -not [string]::IsNullOrWhiteSpace([string]$cols) -and
                [int]$cols -ne [int]$row.plain_columns) {
                $failures.Add(("table '{0}': {1} columns written but {2} parse back out of the CSV" -f `
                    $row.name, [int]$row.plain_columns, [int]$cols))
            }
        }

        $sha = ''
        if ($row.PSObject.Properties.Name -contains 'sha256') { $sha = [string]$row.sha256 }
        if ($sha -notmatch '^[0-9A-Fa-f]{64}$') {
            $failures.Add(("table '{0}': no SHA-256 recorded for its CSV -- Stage B cannot prove the file it loads is the file this gate passed" -f `
                $row.name))
        }
    }

    # =======================================================================
    #  4. RELATIONSHIPS -- the foreign keys have to be rebuildable
    # =======================================================================
    if ($RelationshipPairs -le 0) {
        $failures.Add('no relationships were exported -- the foreign keys cannot be rebuilt in the target')
    }

    # =======================================================================
    #  5. ARITHMETIC -- the total must equal what it is a total of
    #
    #  No longer a comparison against 30,553: that constant would fail every
    #  run from here. This is the identity, which holds on any day.
    # =======================================================================
    $sum = 0
    foreach ($row in $TableRows) { $sum += [int]$row.row_count }
    if ($TotalRows -ne $sum) {
        $failures.Add(("reported total {0:N0} does not equal the sum of the per-table counts, {1:N0}" -f `
            $TotalRows, $sum))
    }

    # =======================================================================
    #  6. THE COMPLEX COLUMNS -- the whole reason the extractor exists
    # =======================================================================
    if ($Attachments -ne $script:Gate1ExpectedAttachments) {
        $detail = if ($Attachments -eq 0) {
            'ZERO is the signature of the silent-failure export (D11): the complex-column read did not happen'
        } else {
            'this is not drift -- check whether the firm has added or removed a client logo'
        }
        $failures.Add(("attachments {0}, expected exactly {1}. {2}" -f `
            $Attachments, $script:Gate1ExpectedAttachments, $detail))
    }
    if ($MvfValues -ne $script:Gate1ExpectedMvfValues) {
        $detail = if ($MvfValues -eq 0) {
            'ZERO is the signature of the silent-failure export (D11): the multi-value read did not happen'
        } else {
            'this is not drift -- check whether the firm has added or removed a fee letter'
        }
        $failures.Add(("multi-value entries {0}, expected exactly {1}. {2}" -f `
            $MvfValues, $script:Gate1ExpectedMvfValues, $detail))
    }

    # =======================================================================
    #  7. ANY WARNING AT ALL IS A FAILURE
    #
    #  A complex-column read that threw was once recorded and forgotten.
    #  There is no such thing as an acceptable warning in a lossless
    #  extraction.
    # =======================================================================
    if ($WarningCount -gt 0) {
        $failures.Add("$WarningCount warning(s) were recorded")
    }

    # =======================================================================
    #  8. SHAPE -- actual against 19 August, and the two directions that are
    #     a question for the firm rather than a broken extraction
    # =======================================================================
    $shape = [System.Collections.Generic.List[object]]::new()

    foreach ($name in $script:Gate1ReferenceRows.Keys) {
        $row = $TableRows | Where-Object { $_.name -eq $name } | Select-Object -First 1
        $reference = [int]$script:Gate1ReferenceRows[$name]
        $actual    = if ($null -eq $row) { $null } else { [int]$row.row_count }

        $shape.Add([pscustomobject]@{
            Name      = $name
            Reference = $reference
            Actual    = $actual
            Delta     = $(if ($null -eq $actual) { $null } else { $actual - $reference })
        })

        if ($null -eq $actual) { continue }          # already reported as missing
        if ($actual -le 0)     { continue }          # already reported as empty

        # The file grows by about 100 records a day. It does not shrink.
        if ($actual -lt $reference) {
            $concerns.Add(("table '{0}' has FALLEN: {1:N0} rows against {2:N0} on {3} ({4:N0}). The file grows, it does not shrink -- this is the opposite of drift" -f `
                $name, $actual, $reference, $script:Gate1ReferenceDate, ($actual - $reference)))
        }
        # ...and it does not double in a week either.
        elseif ($actual -ge ($reference * $script:Gate1GrowthConcernFactor) -and
                ($actual - $reference) -gt $script:Gate1GrowthConcernFloor) {
            $concerns.Add(("table '{0}' has DOUBLED or more: {1:N0} rows against {2:N0} on {3} (+{4:N0}). At about 100 records a day across the whole file, that is not drift" -f `
                $name, $actual, $reference, $script:Gate1ReferenceDate, ($actual - $reference)))
        }
    }

    return @{
        Gated    = $true
        Reason   = ''
        Failures = @($failures)
        Concerns = @($concerns)
        Shape    = @($shape)
    }
}


function Write-Gate1Result {
    <#
      Prints the verdict and returns the exit code. Split from Test-Gate1 so
      the decision can be tested without a process exiting.
    #>
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Result,
        [Parameter(Mandatory = $true)] [int] $TotalRows,
        [Parameter(Mandatory = $true)] [int] $Attachments,
        [Parameter(Mandatory = $true)] [int] $MvfValues,
        [Parameter(Mandatory = $true)] [int] $WarningCount,
        [int] $TableCount = 0,
        [int] $RelationshipPairs = 0,
        [hashtable] $SourceInfo = @{},
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

    # ---- the shape table, always printed, pass or fail --------------------
    Write-Host "----------------------------------------------------------"
    Write-Host (" SHAPE -- what was extracted, against {0}" -f $script:Gate1ReferenceDate)
    Write-Host " (reported for a human to eyeball -- NOT asserted)"
    Write-Host "----------------------------------------------------------"
    Write-Host ("  {0,-20} {1,12} {2,12} {3,12}" -f 'table', '19 Aug', 'extracted', 'change')

    foreach ($s in $Result.Shape) {
        if ($null -eq $s.Actual) {
            Write-Host ("  {0,-20} {1,12:N0} {2,12} {3,12}" -f `
                $s.Name, $s.Reference, 'MISSING', '--') -ForegroundColor Red
            continue
        }
        $delta  = [int]$s.Delta
        $sign   = if ($delta -gt 0) { '+' } else { '' }
        $colour = if ($delta -lt 0) { 'Yellow' } else { 'Gray' }
        Write-Host ("  {0,-20} {1,12:N0} {2,12:N0} {3,12}" -f `
            $s.Name, $s.Reference, $s.Actual, ("{0}{1:N0}" -f $sign, $delta)) -ForegroundColor $colour
    }

    $refTotal   = $script:Gate1ReferenceTotalRows
    $totalDelta = $TotalRows - $refTotal
    $totalSign  = if ($totalDelta -gt 0) { '+' } else { '' }
    Write-Host ("  {0,-20} {1,12:N0} {2,12:N0} {3,12}" -f `
        'TOTAL', $refTotal, $TotalRows, ("{0}{1:N0}" -f $totalSign, $totalDelta))
    Write-Host ""

    if ($SourceInfo.Count -gt 0) {
        Write-Host "----------------------------------------------------------"
        Write-Host " SOURCE -- recorded in the manifest"
        Write-Host "----------------------------------------------------------"
        foreach ($key in @('path', 'bytes', 'modified_utc', 'sha256')) {
            if ($SourceInfo.ContainsKey($key)) {
                $v = $SourceInfo[$key]
                if ($key -eq 'bytes') { $v = "{0:N0} bytes" -f [int64]$v }
                Write-Host ("  {0,-13}: {1}" -f $key, $v)
            }
        }
        Write-Host ""
    }

    $hasFailures = $Result.Failures.Count -gt 0
    $hasConcerns = $Result.Concerns.Count -gt 0

    if ($hasFailures) {
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
    }

    if ($hasConcerns) {
        Write-Host "==========================================================" -ForegroundColor Yellow
        Write-Host " FOR THE FIRM -- A COUNT MOVED THE WRONG WAY" -ForegroundColor Yellow
        Write-Host "==========================================================" -ForegroundColor Yellow
        foreach ($c in $Result.Concerns) { Write-Host "  $c" -ForegroundColor Yellow }
        Write-Host ""
        Write-Host "  The extraction itself looks intact -- every file was read" -ForegroundColor Yellow
        Write-Host "  back and verified. This is a question about the DATA, and" -ForegroundColor Yellow
        Write-Host "  it goes to the firm before Stage B, not past it." -ForegroundColor Yellow
        Write-Host ""
    }

    if ($hasFailures -or $hasConcerns) {
        if ($ManifestPath) { Write-Host "Manifest: $ManifestPath" }
        return 1
    }

    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " GATE 1 PASSED" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host ("  tables        : {0} of {0} present, once each, none empty" -f `
        $script:Gate1ReferenceRows.Count)
    Write-Host  "  self-check    : every CSV read back and verified, SHA-256 recorded"
    Write-Host ("  rows          : {0:N0}" -f $TotalRows)
    Write-Host ("  attachments   : {0}" -f $Attachments)
    Write-Host ("  mvf values    : {0}" -f $MvfValues)
    Write-Host ("  relationships : {0} field-pairs" -f $RelationshipPairs)
    Write-Host  "  warnings      : 0"
    Write-Host ""
    if ($ManifestPath) { Write-Host "Manifest: $ManifestPath" }
    return 0
}
