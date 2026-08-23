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

# ---------------------------------------------------------------------------
#  Read the CSV back off the disk and parse it.
#
#  This is Gate 1's self-consistency check, and it is the one condition that
#  needs no prior figure and cannot drift: the records that parse back out of
#  the file must equal the rows that were read out of Access.
#
#  It has to be a real parse -- not a line count, and not a tally of our own
#  WriteLine calls. Counting our own writes would prove only that the loop
#  ran. Counting lines would be wrong the moment a memo field contains a
#  newline, and they do. Import-Csv is the same CSV grammar Stage B will read
#  the file with, so a truncated write, an unbalanced quote or a mangled
#  encoding shows up here rather than three stages later.
# ---------------------------------------------------------------------------
function Measure-WrittenCsv {
    param([string] $Path)

    try {
        $rows = @(Import-Csv -LiteralPath $Path -Encoding UTF8)
    } catch {
        return @{ Rows = $null; Columns = $null; Error = "$_" }
    }

    $columns = $null
    if ($rows.Count -gt 0) {
        $columns = @($rows[0].PSObject.Properties.Name).Count
    }
    return @{ Rows = $rows.Count; Columns = $columns; Error = $null }
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

# ---------------------------------------------------------------------------
#  SOURCE PROVENANCE
#
#  Recorded before a single row is read, and written into the manifest.
#  Three weeks from now the question "which extraction produced this?" has to
#  be answerable from the manifest and not from anyone's memory -- and on
#  cutover day this is the proof that the frozen production file, and not a
#  stale rehearsal copy, is what was read. Gate 1 fails if any of the four is
#  missing.
# ---------------------------------------------------------------------------
$srcInfo           = Get-Item -LiteralPath $DatabasePath
$SourceBytes       = $srcInfo.Length
$SourceModifiedUtc = $srcInfo.LastWriteTimeUtc.ToString('o')
$SourceSha256      = Get-FileSha256 $DatabasePath
$SourceFullPath    = $srcInfo.FullName

Write-Log ("Source size     : {0:N0} bytes" -f $SourceBytes)
Write-Log ("Source modified : {0} (UTC)" -f $SourceModifiedUtc)
Write-Log ("Source SHA256   : {0}" -f $SourceSha256)

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

                            # SaveToFile can succeed and still leave nothing
                            # behind. An empty logo is a lost logo, and it
                            # would otherwise pass every count-based check:
                            # the row is there, the file is there, the image
                            # is gone.
                            if ($size -le 0) {
                                Add-Warning $tableName $c.Name "attachment '$fileName' on parent '$parentKey' wrote 0 bytes"
                            }

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

    # ---- read the file back and prove it is what we just wrote ------------
    $verify = Measure-WrittenCsv $csvPath
    if ($null -ne $verify.Error) {
        Add-Warning $tableName '(csv)' ("the written CSV could not be parsed back: {0}" -f $verify.Error)
    }
    elseif ($verify.Rows -ne $rowCount) {
        Add-Warning $tableName '(csv)' ("{0} rows read from Access but {1} parse back out of the CSV" -f $rowCount, $verify.Rows)
    }

    foreach ($k in $complexWriters.Keys) {
        $complexWriters[$k].Writer.Flush()
        $complexWriters[$k].Writer.Close()
    }

    # ---- manifest entry ---------------------------------------------------
    $Manifest.Add([pscustomobject]@{
        object_type       = 'table'
        name              = $tableName
        output_file       = "tables/$safe.csv"
        row_count            = $rowCount
        csv_rows_verified    = $verify.Rows
        csv_columns_verified = $verify.Columns
        plain_columns     = $plainCols.Count
        complex_columns   = $complexCols.Count
        attachments       = $attachmentCount
        mvf_values        = $mvfValueCount
        mvf_parents       = $mvfParentCount
        sha256            = Get-FileSha256 $csvPath
        bytes             = (Get-Item -LiteralPath $csvPath).Length
        source_modified_utc = ''
    })

    foreach ($k in $complexWriters.Keys) {
        $p = $complexWriters[$k].Path
        $Manifest.Add([pscustomobject]@{
            object_type     = 'complex'
            name            = "$tableName.$k"
            output_file     = "complex/" + (Split-Path $p -Leaf)
            row_count       = $(if ($complexCols | Where-Object { $_.Name -eq $k -and $_.Type -eq $dbAttachment }) { $attachmentCount } else { $mvfValueCount })
            csv_rows_verified    = ''
            csv_columns_verified = ''
            plain_columns   = 0
            complex_columns = 0
            attachments     = $attachmentCount
            mvf_values      = $mvfValueCount
            mvf_parents     = $mvfParentCount
            sha256          = Get-FileSha256 $p
            bytes           = (Get-Item -LiteralPath $p).Length
            source_modified_utc = ''
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

# The manifest's first row is the source file itself. Every other row
# describes something this script produced; this one records what it was
# produced FROM. Export-Csv takes its header from the first object, so this
# row also fixes the column set -- every other row carries the same keys.
$Manifest.Insert(0, [pscustomobject]@{
    object_type          = 'source'
    name                 = $srcInfo.Name
    output_file          = $SourceFullPath
    row_count            = ''
    csv_rows_verified    = ''
    csv_columns_verified = ''
    plain_columns        = ''
    complex_columns      = ''
    attachments          = ''
    mvf_values           = ''
    mvf_parents          = ''
    sha256               = $SourceSha256
    bytes                = $SourceBytes
    source_modified_utc  = $SourceModifiedUtc
})

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
    source_path          = $SourceFullPath
    source_bytes         = $SourceBytes
    source_modified_utc  = $SourceModifiedUtc
    source_sha256        = $SourceSha256
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
#  GATE 1
#
#  The decision lives in scripts/lib/gate1.ps1, deliberately apart from the
#  extraction. Three of its holes came from the expected values being bent to
#  match whichever mode the script happened to be running in, so the gate is
#  now independent of that -- and testable without an Access database.
#  See scripts/test-gate1.ps1.
# ===========================================================================
. (Join-Path $PSScriptRoot 'lib/gate1.ps1')

$tableRows = @($Manifest | Where-Object { $_.object_type -eq 'table' } |
                Select-Object name, row_count, csv_rows_verified,
                              csv_columns_verified, plain_columns, sha256)

# What the extraction was taken FROM. Gate 1 fails if any of the four is
# missing: an extraction that cannot name its source is not evidence.
$sourceInfo = @{
    path         = $SourceFullPath
    bytes        = $SourceBytes
    modified_utc = $SourceModifiedUtc
    sha256       = $SourceSha256
}

$gate = Test-Gate1 -TableRows $tableRows `
                   -TotalRows    ([int]$summary.total_rows) `
                   -Attachments  ([int]$summary.total_attachments) `
                   -MvfValues    ([int]$summary.total_mvf_values) `
                   -WarningCount $Warnings.Count `
                   -SourceInfo   $sourceInfo `
                   -RelationshipPairs $relCount `
                   -SelectedTables $Tables `
                   -IncludeArchiveTables:$IncludeArchiveTables

$code = Write-Gate1Result -Result $gate `
                          -TotalRows    ([int]$summary.total_rows) `
                          -Attachments  ([int]$summary.total_attachments) `
                          -MvfValues    ([int]$summary.total_mvf_values) `
                          -WarningCount $Warnings.Count `
                          -TableCount   $summary.tables_extracted `
                          -RelationshipPairs $relCount `
                          -SourceInfo   $sourceInfo `
                          -ManifestPath $manifestPath `
                          -WarningsPath $warnPath

if (-not $gate.Gated) {
    Write-Log ('DIAGNOSTIC RUN -- Gate 1 not evaluated ({0}).' -f $gate.Reason)
}
elseif ($code -ne 0) {
    Write-Log ('GATE 1 DID NOT PASS -- {0} failure(s), {1} concern(s) for the firm.' -f $gate.Failures.Count, $gate.Concerns.Count) 'ERROR'
}
else {
    Write-Log 'GATE 1 PASSED.'
}

exit $code
