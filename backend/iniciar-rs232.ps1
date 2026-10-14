param(
    [string]$Puerto = 'COM3',
    [ValidateSet(1200, 2400, 4800, 9600)][int]$Baudios = 9600,
    [ValidateSet(0, 99)][int]$Direccion = 99
)

$ErrorActionPreference = 'Stop'
if (-not $env:INCASA_DB_CLAVE) {
    $taskArchivoClave = Join-Path $PSScriptRoot 'config/sql-clave.dpapi'
    if (-not (Test-Path -LiteralPath $taskArchivoClave)) {
        throw 'Falta la clave SQL cifrada. Ejecuta guardar-clave-sql.ps1.'
    }
    $taskClaveSegura = (Get-Content -LiteralPath $taskArchivoClave -Raw).Trim() | ConvertTo-SecureString
    $taskCredencial = [System.Management.Automation.PSCredential]::new('incasa_app', $taskClaveSegura)
    $env:INCASA_DB_CLAVE = $taskCredencial.GetNetworkCredential().Password
}

$env:INCASA_BASCULA_SIMULAR = 'false'
$env:INCASA_SERIE_HABILITADA = 'true'
$env:INCASA_PUERTO_SERIE = $Puerto
$env:INCASA_SERIE_BAUDIOS = "$Baudios"
$env:INCASA_SERIE_BITS_DATOS = '8'
$env:INCASA_SERIE_PARIDAD = 'NONE'
$env:INCASA_SERIE_BITS_PARADA = '1'
$env:INCASA_SERIE_DIRECCION = "$Direccion"
Push-Location $PSScriptRoot
try { & mvn spring-boot:run }
finally { Pop-Location; Remove-Item Env:INCASA_DB_CLAVE -ErrorAction SilentlyContinue }
