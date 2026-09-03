param(
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [string]$EnvironmentFile = ".env.production",
  [switch]$ConfirmDatabaseRestore
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmDatabaseRestore) { throw "La restauración reemplaza datos. Repite el comando con -ConfirmDatabaseRestore." }
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$EnvironmentPath = Resolve-Path (Join-Path $ProjectRoot $EnvironmentFile)
$ResolvedBackup = Resolve-Path -LiteralPath $BackupFile
$RemoteFile = "/tmp/park-plaza-restore.dump"

docker compose --env-file $EnvironmentPath -f (Join-Path $ProjectRoot "docker-compose.production.yml") cp $ResolvedBackup "postgres:$RemoteFile"
if ($LASTEXITCODE -ne 0) { throw "Docker no pudo copiar el respaldo al contenedor." }
docker compose --env-file $EnvironmentPath -f (Join-Path $ProjectRoot "docker-compose.production.yml") exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner "$1"' -- $RemoteFile
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL no pudo restaurar el respaldo." }
docker compose --env-file $EnvironmentPath -f (Join-Path $ProjectRoot "docker-compose.production.yml") exec -T postgres rm -f $RemoteFile

Write-Host "Restauración completada desde: $ResolvedBackup"
