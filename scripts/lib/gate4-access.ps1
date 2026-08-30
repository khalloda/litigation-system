param(
    [Parameter(Mandatory = $true)]
    [string]$DatabasePath
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Release-ComObject($Value) {
    if ($null -ne $Value -and [Runtime.InteropServices.Marshal]::IsComObject($Value)) {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value)
    }
}

function Query-Scalar($Database, [string]$Sql) {
    $recordset = $null
    try {
        $recordset = $Database.OpenRecordset($Sql, 2, 4)
        return [int64]$recordset.Fields.Item(0).Value
    }
    finally {
        if ($null -ne $recordset) { try { $recordset.Close() } catch {} }
        Release-ComObject $recordset
    }
}

function Quote-AccessName([string]$Name) {
    return "[" + $Name.Replace("]", "]]" ) + "]"
}

function Read-Parameters($Database, [string]$Sql) {
    $temporary = $null
    try {
        $temporary = $Database.CreateQueryDef("", $Sql)
        return @($temporary.Parameters | ForEach-Object {
            [ordered]@{ name = [string]$_.Name; type = [int]$_.Type }
        })
    }
    catch {
        return @()
    }
    finally {
        if ($null -ne $temporary) { try { $temporary.Close() } catch {} }
        Release-ComObject $temporary
    }
}

function Read-UtcDate($Value) {
    try { return ([datetime]$Value).ToUniversalTime().ToString("o") }
    catch { return $null }
}

if (-not (Test-Path -LiteralPath $DatabasePath -PathType Leaf)) {
    throw "Access copy does not exist: $DatabasePath"
}

$database = $null
$dbEngine = $null
$result = [ordered]@{
    tables = @()
    relationships = @()
    queries = @()
    reports = @()
}

try {
    $dbEngine = New-Object -ComObject DAO.DBEngine.120
    # Exclusive=false, read-only=true. The caller also marks the disposable
    # copy read-only at the filesystem level.
    $database = $dbEngine.OpenDatabase($DatabasePath, $false, $true)

    $tables = [System.Collections.Generic.List[object]]::new()
    foreach ($table in $database.TableDefs) {
        $name = [string]$table.Name
        if ($name.StartsWith("MSys") -or $name.StartsWith("~")) { continue }
        $columns = @($table.Fields | ForEach-Object {
            $required = $false
            $allowZeroLength = $false
            try { $required = [bool]$_.Required } catch {}
            try { $allowZeroLength = [bool]$_.AllowZeroLength } catch {}
            [ordered]@{
                name = [string]$_.Name
                ordinal = [int]$_.OrdinalPosition
                type = [int]$_.Type
                size = [int]$_.Size
                required = $required
                allow_zero_length = $allowZeroLength
            }
        })
        $tables.Add([ordered]@{
            name = $name
            rows = (Query-Scalar $database ("SELECT Count(*) FROM " + (Quote-AccessName $name)))
            columns = $columns
        })
    }
    $result.tables = @($tables | Sort-Object { $_.name })

    $relationships = [System.Collections.Generic.List[object]]::new()
    foreach ($relation in $database.Relations) {
        if ([string]$relation.Name -like "MSys*") { continue }
        $fields = @($relation.Fields | ForEach-Object {
            [ordered]@{ source = [string]$_.Name; target = [string]$_.ForeignName }
        })
        $relationships.Add([ordered]@{
            name = [string]$relation.Name
            source_table = [string]$relation.Table
            target_table = [string]$relation.ForeignTable
            attributes = [int64]$relation.Attributes
            fields = $fields
        })
    }
    $result.relationships = @($relationships | Sort-Object { $_.name })

    $queries = [System.Collections.Generic.List[object]]::new()
    foreach ($query in $database.QueryDefs) {
        $name = [string]$query.Name
        if ($name.StartsWith("~")) { continue }
        $parameters = @()
        $parameterError = $null
        try {
            $parameters = @($query.Parameters | ForEach-Object {
                [ordered]@{ name = [string]$_.Name; type = [int]$_.Type }
            })
        }
        catch { $parameterError = $_.Exception.Message }
        $queries.Add([ordered]@{
            name = $name
            sql = [string]$query.SQL
            parameters = $parameters
            parameter_error = $parameterError
            created = Read-UtcDate $query.DateCreated
            modified = Read-UtcDate $query.LastUpdated
        })
    }
    $result.queries = @($queries | Sort-Object { $_.name })

    # Report design blobs are deliberately not opened. Opening a parameterised
    # report can execute VBA or block on a modal prompt. MSysObjects provides
    # the report inventory and modification metadata without executing one;
    # the six record-source definitions were independently exported during
    # the owner-approved logical-equivalence audit and are held in the Gate 4
    # source contract.
    $reportContainer = $null
    try {
        $reportContainer = $database.Containers.Item("Reports")
        $reports = [System.Collections.Generic.List[object]]::new()
        foreach ($document in $reportContainer.Documents) {
            $reports.Add([ordered]@{
                name = [string]$document.Name
                created = Read-UtcDate $document.DateCreated
                modified = Read-UtcDate $document.LastUpdated
            })
        }
        $result.reports = @($reports | Sort-Object { $_.name })
    }
    finally {
        Release-ComObject $reportContainer
    }
}
finally {
    if ($null -ne $database) { try { $database.Close() } catch {} }
    Release-ComObject $database
    Release-ComObject $dbEngine
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

$result | ConvertTo-Json -Depth 20 -Compress
