param(
  [string]$EnvironmentFile = ".env.production",
  [string]$OutputDirectory = "backups"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$EnvironmentPath = Resolve-Path (Join-Path $ProjectRoot $EnvironmentFile)
$BackupRoot = Join-Path $ProjectRoot $OutputDirectory
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$RemoteFile = "/tmp/park-plaza-$Timestamp.dump"
$LocalFile = Join-Path $BackupRoot "park-plaza-$Timestamp.dump"

docker compose --env-file $EnvironmentPath -f (Join-Path $ProjectRoot "docker-compose.production.yml") exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --file="$1"' -- $RemoteFile
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL no pudo generar el respaldo." }
docker compose --env-file $EnvironmentPath -f (Join-Path $ProjectRoot "docker-compose.production.yml") cp "postgres:$RemoteFile" $LocalFile
if ($LASTEXITCODE -ne 0) { throw "Docker no pudo copiar el respaldo al host." }
docker compose --env-file $EnvironmentPath -f (Join-Path $ProjectRoot "docker-compose.production.yml") exec -T postgres rm -f $RemoteFile

Write-Host "Respaldo creado: $LocalFile"
