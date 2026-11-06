# Backup de la base de Gadu Sorteos
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\backup-db.ps1
#
# Pide la contraseña de la base de forma interactiva: nunca queda en el chat,
# en el historial ni en el repositorio.
#
# Requiere los binarios portables de PostgreSQL en C:\Users\Usuario\Desktop\pgtools\pgsql\bin
# (o pasar -PgBin con otra ruta).

param(
  [string]$PgBin = "C:\Users\Usuario\Desktop\pgtools\pgsql\bin",
  [string]$Salida = "C:\Users\Usuario\Desktop\backups",
  # Conexión directa (IPv6) o "Session pooler" (IPv4). Ver Supabase → Connect.
  [string]$HostDb = "db.mjgcoeikcyzwojbqtuah.supabase.co",
  [int]$Puerto = 5432,
  [string]$Usuario = "postgres",
  [string]$Base = "postgres"
)

$pgDump = Join-Path $PgBin "pg_dump.exe"
if (-not (Test-Path $pgDump)) {
  Write-Host "No encuentro pg_dump en $pgDump" -ForegroundColor Red
  Write-Host "Descargá los binarios portables o pasá -PgBin con la ruta correcta."
  exit 1
}

New-Item -ItemType Directory -Force -Path $Salida | Out-Null

$fecha = Get-Date -Format "yyyy-MM-dd-HHmm"
$destino = Join-Path $Salida "gadu-$fecha.dump"

$seguro = Read-Host "Contraseña de la base (no se muestra ni se guarda)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
try {
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

Write-Host "Volcando $Base a $destino ..." -ForegroundColor Cyan

& $pgDump --host $HostDb --port $Puerto --username $Usuario --dbname $Base `
  --no-owner --no-privileges --format=custom --verbose `
  --file $destino

$codigo = $LASTEXITCODE
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

if ($codigo -ne 0) {
  Write-Host "El backup falló (código $codigo)." -ForegroundColor Red
  exit $codigo
}

$tam = [math]::Round((Get-Item $destino).Length / 1MB, 1)
Write-Host "Backup listo: $destino ($tam MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Restaurar (en una base vacía):" -ForegroundColor Yellow
Write-Host "  pg_restore --host <host> --username postgres --dbname postgres --no-owner --no-privileges `"$destino`""
Write-Host ""
Write-Host "OJO: el dump contiene datos personales. No lo subas al repo." -ForegroundColor Yellow
