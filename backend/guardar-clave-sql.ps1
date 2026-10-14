$ErrorActionPreference = 'Stop'
$taskClaveSegura = Read-Host 'Contraseña SQL de incasa_app' -AsSecureString
$taskCarpeta = Join-Path $PSScriptRoot 'config'
New-Item -ItemType Directory -Path $taskCarpeta -Force | Out-Null
$taskArchivo = Join-Path $taskCarpeta 'sql-clave.dpapi'
# Sin -Key: PowerShell usa DPAPI, vinculada al usuario y a esta PC.
$taskClaveSegura | ConvertFrom-SecureString | Set-Content -LiteralPath $taskArchivo -Encoding ASCII
Write-Output 'Clave cifrada guardada para el usuario actual de Windows.'
