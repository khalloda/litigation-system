<#
================================================================================
  01_extract_access.ps1
  ------------------------------------------------------------------------
  Stage A of the Litigation Database migration: complete, lossless extraction
  from the Access .accdb into UTF-8 CSV + binary attachment files, with a
  reconciliation manifest.

  WHY THIS EXISTS RATHER THAN A PLAIN CSV EXPORT
  ----------------------------------------------
  Access "complex columns" (Attachment and Multi-Value fields) are NOT stored
  in the visible table. The visible column holds an internal pointer, and the
  real data sits in a hidden system table.

  A normal CSV/ODBC export of العملاء therefore produces a `logo` column where
  all 313 rows look populated -- with values like 136, 42, 1. Those are
  pointers. Only 54 clients actually have a logo. The export succeeds, reports
  no error, and silently loses every image.

  Confirmed complex columns in this database:
      العملاء.logo              Attachment      54 files
      Contacts.Attachments      Attachment       0 files (empty)
      Copy Of العملاء.logo      Attachment      54 files (archive table)
      خطابات الأتعاب.Matter     Multi-Value    288 values / 195 parents

  This script reads them through DAO Recordset2 / Field2, which is the only
  interface that returns the real content.

  GUARANTEES
  ----------
   * The source database is opened READ-ONLY and is never modified.
   * Every row of every table is written, including malformed ones. No row is
     filtered, cleaned, or skipped during extraction. Cleaning happens later,
     in the staging layer, where it is reversible.
   * NULL and empty-string are preserved as distinct values.
   * All text is written UTF-8 (no BOM) so Arabic survives into PostgreSQL.
   * A manifest records the row count and SHA-256 of every output file, so
     Stage B can prove nothing was lost in transit.

  REQUIREMENTS
  ------------
   * Windows with Microsoft Access (or the Access Database Engine) installed.
   * Run 32-bit or 64-bit PowerShell to match your Office bitness.
   * Run from a COPY of the database, never the production original.

  USAGE
  -----
     .\01_extract_access.ps1 -DatabasePath "D:\path\to\database.accdb" `
                             -OutputRoot   "D:\path\to\_migration"
================================================================================
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $DatabasePath,

    [Parameter(Mandatory = $true)]
    [string] $OutputRoot,

    # Tables to extract. Empty = every non-system table.
    [string[]] $Tables = @(),

    # Also extract archive-only tables (Group C in the scope decision).
    [switch] $IncludeArchiveTables
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ===========================================================================
#  ENCODING SELF-CHECK -- run before anything else
#
#  This file is UTF-8 WITH a byte-order mark, and it must stay that way.
#
#  Windows PowerShell 5.1 -- the version that ships with Windows, and the one
#  most likely to be used here because Access COM interop needs it -- reads a
#  .ps1 file WITHOUT a BOM as Windows-1252. Every Arabic table name in this
#  script is then mangled. Before the BOM was added, 5.1 could not even parse
#  this file; the failure mode had it parsed would have been worse -- table
#  names silently not matching, tables quietly skipped, and a "successful"
#  extraction missing whole tables.
#
#  So: prove the Arabic in this file survived being read, before trusting any
#  of it. If this check fails, the file has been re-saved without its BOM.
# ===========================================================================
$encodingProbe = 'العملاء'          # the clients table: 7 Arabic letters
$expectedCodes = @(1575, 1604, 1593, 1605, 1604, 1575, 1569)   # ا ل ع م ل ا ء
$actualCodes   = [int[]][char[]]$encodingProbe

if ($actualCodes.Count -ne $expectedCodes.Count -or
    (Compare-Object $actualCodes $expectedCodes -SyncWindow 0)) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host " ENCODING ERROR -- REFUSING TO RUN" -ForegroundColor Red
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host "  The Arabic text in this script was not read correctly." -ForegroundColor Red
    Write-Host "  Expected 7 characters, got $($actualCodes.Count): $($actualCodes -join ',')" -ForegroundColor Red
    Write-Host ""
    Write-Host "  This file must be saved as UTF-8 WITH a byte-order mark." -ForegroundColor Red
    Write-Host "  Without one, Windows PowerShell 5.1 reads it as Windows-1252" -ForegroundColor Red
    Write-Host "  and every Arabic table name in it is corrupted, so tables" -ForegroundColor Red
    Write-Host "  would be silently skipped." -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ---------------------------------------------------------------------------
#  DAO constants
# ---------------------------------------------------------------------------
$dbOpenReadOnly   = 4
$dbAttachment     = 101      # Attachment complex column
$dbComplexText    = 109      # Multi-value text
$dbComplexLong    = 104
$dbComplexByte    = 102
$dbComplexInteger = 103
$dbComplexSingle  = 105
$dbComplexDouble  = 106
$dbComplexGUID    = 107
$dbComplexDecimal = 108

$ComplexTypes = @(
    $dbAttachment, $dbComplexText, $dbComplexLong, $dbComplexByte,
    $dbComplexInteger, $dbComplexSingle, $dbComplexDouble,
    $dbComplexGUID, $dbComplexDecimal
)

# ---------------------------------------------------------------------------
#  Output layout
# ---------------------------------------------------------------------------
$DirTables      = Join-Path $OutputRoot 'tables'        # one CSV per table
$DirComplex     = Join-Path $OutputRoot 'complex'       # flattened MVF junctions
$DirAttachments = Join-Path $OutputRoot 'attachments'   # extracted binaries
$DirMeta        = Join-Path $OutputRoot 'meta'          # manifest + logs

foreach ($d in @($OutputRoot, $DirTables, $DirComplex, $DirAttachments, $DirMeta)) {
    if (-not (Test-Path -LiteralPath $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}

$LogPath  = Join-Path $DirMeta 'extract.log'
$Manifest = [System.Collections.Generic.List[object]]::new()
$Warnings = [System.Collections.Generic.List[object]]::new()

function Write-Log {
    param([string] $Message, [string] $Level = 'INFO')
    $line = "{0}  [{1,-5}]  {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Write-Host $line
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Add-Warning {
    param([string] $Table, [string] $Column, [string] $Message)
    $Warnings.Add([pscustomobject]@{
        table = $Table; column = $Column; message = $Message
    })
    Write-Log "$Table.$Column -- $Message" 'WARN'
}

# ---------------------------------------------------------------------------
#  Filesystem-safe names. Arabic is preserved; only illegal characters go.
# ---------------------------------------------------------------------------
function Get-SafeName {
    param([string] $Name)
    $bad = [System.IO.Path]::GetInvalidFileNameChars()
    $sb  = [System.Text.StringBuilder]::new()
    foreach ($ch in $Name.ToCharArray()) {
        if ($bad -contains $ch) { [void]$sb.Append('_') } else { [void]$sb.Append($ch) }
    }
    return $sb.ToString()
}

# ---------------------------------------------------------------------------
#  CSV field encoding.
#
#  NULL and empty string must remain distinguishable, because in this database
#  they mean different things (e.g. an unassigned lawyer vs. a cleared one).
#  NULL  -> written as a bare, unquoted empty field
#  ''    -> written as a quoted empty field ("")
#  Everything else is quoted and internal quotes are doubled.
# ---------------------------------------------------------------------------
function ConvertTo-CsvField {
    param($Value)

    if ($null -eq $Value -or $Value -is [System.DBNull]) { return '' }

    if ($Value -is [datetime]) {
        return '"' + $Value.ToString('yyyy-MM-dd HH:mm:ss') + '"'
    }
    if ($Value -is [bool]) {
        return '"' + $(if ($Value) { 'true' } else { 'false' }) + '"'
    }
    if ($Value -is [byte[]]) {
        # Raw binary in an ordinary column: hex-encode so nothing is lost.
        return '"0x' + [System.BitConverter]::ToString($Value).Replace('-', '') + '"'
    }

    $s = [string]$Value
    return '"' + $s.Replace('"', '""') + '"'
}

function New-Utf8Writer {
    param([string] $Path)
    # UTF-8 WITHOUT BOM: PostgreSQL COPY does not want a BOM.
    $enc = New-Object System.Text.UTF8Encoding($false)
    return New-Object System.IO.StreamWriter($Path, $false, $enc)
}

function Get-FileSha256 {
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

# ===========================================================================
#  OPEN THE DATABASE (READ-ONLY)
# ===========================================================================

Write-Log "=========================================================="
Write-Log "Extraction starting"
Write-Log "Source : $DatabasePath"
Write-Log "Output : $OutputRoot"

if (-not (Test-Path -LiteralPath $DatabasePath)) {
    throw "Database not found: $DatabasePath"
}

$srcInfo = Get-Item -LiteralPath $DatabasePath
Write-Log ("Source size   : {0:N0} bytes" -f $srcInfo.Length)
Write-Log ("Source SHA256 : {0}" -f (Get-FileSha256 $DatabasePath))

try {
    $engine = New-Object -ComObject DAO.DBEngine.120
} catch {
    throw "Could not create DAO.DBEngine.120. Ensure Access or the Access Database Engine is installed, and that PowerShell's bitness matches Office's. Error: $_"
}

# OpenDatabase(name, exclusive, read-only, connect)
$db = $engine.OpenDatabase($DatabasePath, $false, $true)
Write-Log "Database opened READ-ONLY."

# ---------------------------------------------------------------------------
#  Decide which tables to extract
# ---------------------------------------------------------------------------
$ArchiveTables = @(
    'حضور الاجتماع اليومي', 'اجتماع', 'meeting_attendance',
    'tblMinMatterHearingDate', 'Copy Of العملاء', 'Follow-up',
    'Switchboard Items', 'عهدة قسم القضايا', 'Paste Errors',
    'pivotCharصالح-ضد'
)

$allTables = @()
foreach ($td in $db.TableDefs) {
    $n = $td.Name
    if ($n -like 'MSys*') { continue }   # Access system catalog
    if ($n -like 'f_*')   { continue }   # hidden complex storage; read via DAO instead
    if ($n -like '~*')    { continue }   # temp objects
    $allTables += $n
}

if ($Tables.Count -gt 0) {
    $targetTables = $allTables | Where-Object { $Tables -contains $_ }
} elseif ($IncludeArchiveTables) {
    $targetTables = $allTables
} else {
    $targetTables = $allTables | Where-Object { $ArchiveTables -notcontains $_ }
}

Write-Log ("Tables in database : {0}" -f $allTables.Count)
Write-Log ("Tables to extract  : {0}" -f @($targetTables).Count)

# ===========================================================================
#  MAIN EXTRACTION LOOP
# ===========================================================================

foreach ($tableName in $targetTables) {

    Write-Log "----------------------------------------------------------"
    Write-Log "TABLE: $tableName"

    $safe    = Get-SafeName $tableName
    $csvPath = Join-Path $DirTables "$safe.csv"

    $td = $db.TableDefs.Item($tableName)

    # ---- classify columns -------------------------------------------------
    $plainCols   = @()   # ordinary scalar columns
    $complexCols = @()   # attachment / multi-value

    foreach ($f in $td.Fields) {
        if ($ComplexTypes -contains $f.Type) {
            $complexCols += [pscustomobject]@{ Name = $f.Name; Type = $f.Type }
        } else {
            $plainCols += $f.Name
        }
    }

    if ($complexCols.Count -gt 0) {
        foreach ($c in $complexCols) {
            $kind = if ($c.Type -eq $dbAttachment) { 'ATTACHMENT' } else { 'MULTI-VALUE' }
            Write-Log ("  complex column detected: {0} [{1}] -- extracted separately" -f $c.Name, $kind)
        }
    }

    # ---- open the table ---------------------------------------------------
    # dbOpenTable is not used, because linked/complex tables can refuse it.
    $rs = $db.OpenRecordset("SELECT * FROM [$tableName]", 2, 0, $dbOpenReadOnly)

    $writer = New-Utf8Writer $csvPath

    # Header: plain columns only. Complex columns go to their own files, and
    # emitting the pointer value here would be actively misleading.
    $writer.WriteLine(($plainCols | ForEach-Object { '"' + $_.Replace('"','""') + '"' }) -join ',')

    $rowCount        = 0
    $attachmentCount = 0
    $mvfValueCount   = 0
    $mvfParentCount  = 0

    # Per-table writers for complex columns, created lazily.
    $complexWriters = @{}

    if (-not $rs.EOF) { $rs.MoveFirst() }

    while (-not $rs.EOF) {

        # ---- plain columns ------------------------------------------------
        $fields = foreach ($col in $plainCols) {
            ConvertTo-CsvField $rs.Fields.Item($col).Value
        }
        $writer.WriteLine($fields -join ',')

        # A stable row identity for linking complex data back to the parent.
        # Prefer the real primary key; fall back to ordinal position.
        $parentKey = $null
        foreach ($cand in @('ID', 'ID_client', 'contractID', 'matterID', 'ID_hearings', 'ID_Task')) {
            if ($plainCols -contains $cand) {
                $v = $rs.Fields.Item($cand).Value
                if ($null -ne $v) { $parentKey = [string]$v; break }
            }
        }
        if ($null -eq $parentKey) { $parentKey = "row_$rowCount" }

        # ---- complex columns ----------------------------------------------
        foreach ($c in $complexCols) {

            $colSafe = Get-SafeName $c.Name

            if ($c.Type -eq $dbAttachment) {
                # -------- ATTACHMENT --------------------------------------
                if (-not $complexWriters.ContainsKey($c.Name)) {
                    $p = Join-Path $DirComplex "${safe}__${colSafe}__attachments.csv"
                    $w = New-Utf8Writer $p
                    $w.WriteLine('"parent_key","file_name","file_type","byte_size","stored_path"')
                    $complexWriters[$c.Name] = @{ Writer = $w; Path = $p }
                }
                $w = $complexWriters[$c.Name].Writer

                $tableAttachDir = Join-Path $DirAttachments "$safe`__$colSafe"
                if (-not (Test-Path -LiteralPath $tableAttachDir)) {
                    New-Item -ItemType Directory -Path $tableAttachDir -Force | Out-Null
                }

                try {
                    $rsAtt = $rs.Fields.Item($c.Name).Value    # Recordset2
                    if ($null -ne $rsAtt) {
                        while (-not $rsAtt.EOF) {
                            $fileName = [string]$rsAtt.Fields.Item('FileName').Value
                            $fileType = [string]$rsAtt.Fields.Item('FileType').Value

                            # Unique on disk: parent key prefix avoids collisions
                            # between clients sharing a logo filename.
                            $outName = "{0}__{1}" -f $parentKey, (Get-SafeName $fileName)
                            $outPath = Join-Path $tableAttachDir $outName

                            if (Test-Path -LiteralPath $outPath) {
                                Remove-Item -LiteralPath $outPath -Force
                            }

                            # SaveToFile writes the ORIGINAL bytes, stripping the
                            # Access attachment wrapper. This is the only correct
                            # way to recover the file.
                            $rsAtt.Fields.Item('FileData').SaveToFile($outPath)

                            $size = (Get-Item -LiteralPath $outPath).Length

                            $w.WriteLine(
                                (ConvertTo-CsvField $parentKey) + ',' +
                                (ConvertTo-CsvField $fileName)  + ',' +
                                (ConvertTo-CsvField $fileType)  + ',' +
                                (ConvertTo-CsvField $size)      + ',' +
                                (ConvertTo-CsvField (Join-Path "$safe`__$colSafe" $outName))
                            )

                            $attachmentCount++
                            $rsAtt.MoveNext()
                        }
                        $rsAtt.Close()
                    }
                } catch {
                    # Recorded and the run continues, so ONE pass collects every
                    # problem rather than stopping at the first. Gate 1 at the end
                    # of this script fails on any warning, so nothing slips past.
                    Add-Warning $tableName $c.Name "attachment read failed on parent '$parentKey': $_"
                }

            } else {
                # -------- MULTI-VALUE FIELD -------------------------------
                if (-not $complexWriters.ContainsKey($c.Name)) {
                    $p = Join-Path $DirComplex "${safe}__${colSafe}__values.csv"
                    $w = New-Utf8Writer $p
                    $w.WriteLine('"parent_key","ordinal","value"')
                    $complexWriters[$c.Name] = @{ Writer = $w; Path = $p }
                }
                $w = $complexWriters[$c.Name].Writer

                try {
                    $rsMv = $rs.Fields.Item($c.Name).Value     # Recordset2
                    if ($null -ne $rsMv) {
                        $ord = 0
                        $had = $false
                        while (-not $rsMv.EOF) {
                            $val = $rsMv.Fields.Item('Value').Value
                            $w.WriteLine(
                                (ConvertTo-CsvField $parentKey) + ',' +
                                (ConvertTo-CsvField $ord)       + ',' +
                                (ConvertTo-CsvField $val)
                            )
                            $mvfValueCount++
                            $ord++
                            $had = $true
                            $rsMv.MoveNext()
                        }
                        if ($had) { $mvfParentCount++ }
                        $rsMv.Close()
                    }
                } catch {
                    # As above: collected now, fatal at Gate 1.
                    Add-Warning $tableName $c.Name "multi-value read failed on parent '$parentKey': $_"
                }
            }
        }

        $rowCount++
        $rs.MoveNext()
    }

    $rs.Close()
    $writer.Flush(); $writer.Close()

    foreach ($k in $complexWriters.Keys) {
        $complexWriters[$k].Writer.Flush()
        $complexWriters[$k].Writer.Close()
    }

    # ---- manifest entry ---------------------------------------------------
    $Manifest.Add([pscustomobject]@{
        object_type       = 'table'
        name              = $tableName
        output_file       = "tables/$safe.csv"
        row_count         = $rowCount
        plain_columns     = $plainCols.Count
        complex_columns   = $complexCols.Count
        attachments       = $attachmentCount
        mvf_values        = $mvfValueCount
        mvf_parents       = $mvfParentCount
        sha256            = Get-FileSha256 $csvPath
        bytes             = (Get-Item -LiteralPath $csvPath).Length
    })

    foreach ($k in $complexWriters.Keys) {
        $p = $complexWriters[$k].Path
        $Manifest.Add([pscustomobject]@{
            object_type     = 'complex'
            name            = "$tableName.$k"
            output_file     = "complex/" + (Split-Path $p -Leaf)
            row_count       = $(if ($complexCols | Where-Object { $_.Name -eq $k -and $_.Type -eq $dbAttachment }) { $attachmentCount } else { $mvfValueCount })
            plain_columns   = 0
            complex_columns = 0
            attachments     = $attachmentCount
            mvf_values      = $mvfValueCount
            mvf_parents     = $mvfParentCount
            sha256          = Get-FileSha256 $p
            bytes           = (Get-Item -LiteralPath $p).Length
        })
    }

    $msg = "  rows: $rowCount"
    if ($attachmentCount -gt 0) { $msg += "   attachments: $attachmentCount" }
    if ($mvfValueCount  -gt 0)  { $msg += "   mvf values: $mvfValueCount (parents: $mvfParentCount)" }
    Write-Log $msg
}

# ===========================================================================
#  RELATIONSHIPS  (needed to rebuild foreign keys in the target)
# ===========================================================================

Write-Log "----------------------------------------------------------"
Write-Log "Exporting relationships"

$relPath = Join-Path $DirMeta 'relationships.csv'
$rw = New-Utf8Writer $relPath
$rw.WriteLine('"name","parent_table","parent_field","child_table","child_field","enforced","cascade_update","cascade_delete","one_to_one"')

$relCount = 0
foreach ($rel in $db.Relations) {
    $attr           = $rel.Attributes
    $enforced       = (($attr -band 2)    -eq 0)      # dbRelationDontEnforce
    $cascadeUpdate  = (($attr -band 256)  -ne 0)
    $cascadeDelete  = (($attr -band 4096) -ne 0)
    $oneToOne       = (($attr -band 1)    -ne 0)

    foreach ($f in $rel.Fields) {
        $rw.WriteLine(
            (ConvertTo-CsvField $rel.Name)          + ',' +
            (ConvertTo-CsvField $rel.Table)         + ',' +
            (ConvertTo-CsvField $f.Name)            + ',' +
            (ConvertTo-CsvField $rel.ForeignTable)  + ',' +
            (ConvertTo-CsvField $f.ForeignName)     + ',' +
            (ConvertTo-CsvField $enforced)          + ',' +
            (ConvertTo-CsvField $cascadeUpdate)     + ',' +
            (ConvertTo-CsvField $cascadeDelete)     + ',' +
            (ConvertTo-CsvField $oneToOne)
        )
        $relCount++
    }
}
$rw.Flush(); $rw.Close()
Write-Log "  relationship field-pairs: $relCount"

# ===========================================================================
#  COLUMN DICTIONARY  (drives the rename map and the i18n labels)
# ===========================================================================

Write-Log "Exporting column dictionary"

$colPath = Join-Path $DirMeta 'columns.csv'
$cw = New-Utf8Writer $colPath
$cw.WriteLine('"table_name","column_name","ordinal","access_type","size","required","allow_zero_length","default_value","validation_rule","caption","description","is_complex"')

foreach ($tableName in $targetTables) {
    $td  = $db.TableDefs.Item($tableName)
    $ord = 0
    foreach ($f in $td.Fields) {

        $caption = ''
        $descr   = ''
        # Caption / Description are user-defined properties: absent unless set.
        try { $caption = [string]$f.Properties.Item('Caption').Value }     catch { $caption = '' }
        try { $descr   = [string]$f.Properties.Item('Description').Value } catch { $descr   = '' }

        $default = ''
        $valid   = ''
        try { $default = [string]$f.DefaultValue }    catch { $default = '' }
        try { $valid   = [string]$f.ValidationRule } catch { $valid   = '' }

        $cw.WriteLine(
            (ConvertTo-CsvField $tableName)                                  + ',' +
            (ConvertTo-CsvField $f.Name)                                     + ',' +
            (ConvertTo-CsvField $ord)                                        + ',' +
            (ConvertTo-CsvField $f.Type)                                     + ',' +
            (ConvertTo-CsvField $f.Size)                                     + ',' +
            (ConvertTo-CsvField $f.Required)                                 + ',' +
            (ConvertTo-CsvField $f.AllowZeroLength)                          + ',' +
            (ConvertTo-CsvField $default)                                    + ',' +
            (ConvertTo-CsvField $valid)                                      + ',' +
            (ConvertTo-CsvField $caption)                                    + ',' +
            (ConvertTo-CsvField $descr)                                      + ',' +
            (ConvertTo-CsvField ($ComplexTypes -contains $f.Type))
        )
        $ord++
    }
}
$cw.Flush(); $cw.Close()

# ===========================================================================
#  MANIFEST + SUMMARY
# ===========================================================================

$db.Close()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($db)     | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($engine) | Out-Null

$manifestPath = Join-Path $DirMeta 'manifest.csv'
$Manifest | Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding UTF8

$warnPath = Join-Path $DirMeta 'warnings.csv'
if ($Warnings.Count -gt 0) {
    $Warnings | Export-Csv -LiteralPath $warnPath -NoTypeInformation -Encoding UTF8
} else {
    'table,column,message' | Set-Content -LiteralPath $warnPath -Encoding UTF8
}

$summary = [ordered]@{
    extracted_at         = (Get-Date).ToString('o')
    source_path          = $DatabasePath
    source_bytes         = $srcInfo.Length
    source_sha256        = (Get-FileSha256 $DatabasePath)
    tables_extracted     = @($targetTables).Count
    total_rows           = ($Manifest | Where-Object { $_.object_type -eq 'table' } | Measure-Object -Property row_count -Sum).Sum
    total_attachments    = ($Manifest | Where-Object { $_.object_type -eq 'table' } | Measure-Object -Property attachments -Sum).Sum
    total_mvf_values     = ($Manifest | Where-Object { $_.object_type -eq 'table' } | Measure-Object -Property mvf_values -Sum).Sum
    relationship_pairs   = $relCount
    warnings             = $Warnings.Count
}

$summary | ConvertTo-Json -Depth 4 |
    Set-Content -LiteralPath (Join-Path $DirMeta 'summary.json') -Encoding UTF8

Write-Log "=========================================================="
Write-Log "EXTRACTION COMPLETE"
Write-Log ("  tables       : {0}" -f $summary.tables_extracted)
Write-Log ("  rows         : {0:N0}" -f $summary.total_rows)
Write-Log ("  attachments  : {0}" -f $summary.total_attachments)
Write-Log ("  mvf values   : {0}" -f $summary.total_mvf_values)
Write-Log ("  warnings     : {0}" -f $summary.warnings)
Write-Log "=========================================================="

# ===========================================================================
#  GATE 1 -- assert, do not advise
#
#  This used to print the expected numbers and leave a human to compare them,
#  with a note saying "if attachments = 0 the extraction FAILED silently".
#  A printed hint is not a gate. Nobody reads the twelfth line of a successful
#  run, and a complex-column read that fails is recorded as a warning and the
#  script carries on to report success.
#
#  Now: any mismatch, and any warning at all, is a hard failure with a
#  non-zero exit code. The whole point of Stage A is that it either produced
#  a complete copy or it did not.
#
#  Counts are per docs/MIGRATION.md, Gate 1. If the firm's data has genuinely
#  changed -- it is in daily use, and it drifts about 100 records a day --
#  update these numbers deliberately, in the same commit as the reason.
# ===========================================================================

$ExpectedRows = [ordered]@{
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
$ExpectedTotalRows   = 30553   # the sum of the table above
$ExpectedAttachments = 54      # العملاء.logo -- the 54 client logos
$ExpectedMvfValues   = 288     # خطابات الأتعاب.Matter, across 195 parents

$gateFailures = [System.Collections.Generic.List[string]]::new()

# --- every table that was extracted must have the expected number of rows ---
foreach ($name in $ExpectedRows.Keys) {
    $row = $Manifest | Where-Object { $_.object_type -eq 'table' -and $_.name -eq $name }
    if (-not $row) {
        # Only a problem if it was meant to be in this run.
        if ($targetTables -contains $name) {
            $gateFailures.Add("table '$name' was selected but is missing from the manifest")
        }
        continue
    }
    if ([int]$row.row_count -ne $ExpectedRows[$name]) {
        $gateFailures.Add(
            ("table '{0}': {1:N0} rows, expected {2:N0}" -f $name, [int]$row.row_count, $ExpectedRows[$name]))
    }
}

# --- the complex columns: the whole reason this script exists ---------------
$fullRun = ($Tables.Count -eq 0)

if ($fullRun) {
    if ([int]$summary.total_rows -ne $ExpectedTotalRows -and -not $IncludeArchiveTables) {
        $gateFailures.Add(
            ("total rows {0:N0}, expected {1:N0}" -f [int]$summary.total_rows, $ExpectedTotalRows))
    }

    # 108, not 54, when archive tables are included: 'Copy Of العملاء' holds
    # the same images again.
    $expectAtt = if ($IncludeArchiveTables) { $ExpectedAttachments * 2 } else { $ExpectedAttachments }
    if ([int]$summary.total_attachments -ne $expectAtt) {
        $gateFailures.Add(
            ("attachments {0}, expected {1}. A CSV export destroys these; if this is 0 the complex-column read failed silently" -f `
                [int]$summary.total_attachments, $expectAtt))
    }

    if ([int]$summary.total_mvf_values -ne $ExpectedMvfValues) {
        $gateFailures.Add(
            ("multi-value entries {0}, expected {1}" -f `
                [int]$summary.total_mvf_values, $ExpectedMvfValues))
    }
}

# --- any warning at all is a failure ---------------------------------------
# A complex-column read that threw was previously recorded here and forgotten.
# There is no such thing as an acceptable warning in a lossless extraction.
if ($Warnings.Count -gt 0) {
    $gateFailures.Add(("{0} warning(s) were recorded -- see {1}" -f $Warnings.Count, $warnPath))
    foreach ($w in $Warnings) {
        $gateFailures.Add(("    {0}.{1} -- {2}" -f $w.table, $w.column, $w.message))
    }
}

Write-Host ""
if ($gateFailures.Count -gt 0) {
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host " GATE 1 FAILED -- DO NOT PROCEED TO STAGE B" -ForegroundColor Red
    Write-Host "==========================================================" -ForegroundColor Red
    foreach ($f in $gateFailures) { Write-Host "  $f" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  The extraction is not a complete copy of the database." -ForegroundColor Red
    Write-Host "  Loading it would lose data silently. See docs/MIGRATION.md." -ForegroundColor Red
    Write-Host ""
    Write-Log ("GATE 1 FAILED with {0} problem(s)." -f $gateFailures.Count) 'ERROR'
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " GATE 1 PASSED" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ("  rows         : {0:N0}  (expected {1:N0})" -f [int]$summary.total_rows, $ExpectedTotalRows)
Write-Host ("  attachments  : {0}  (expected {1})" -f [int]$summary.total_attachments, $ExpectedAttachments)
Write-Host ("  mvf values   : {0}  (expected {1})" -f [int]$summary.total_mvf_values, $ExpectedMvfValues)
Write-Host ("  warnings     : 0")
Write-Host ""
Write-Log "GATE 1 PASSED."
Write-Host "Manifest: $manifestPath"
