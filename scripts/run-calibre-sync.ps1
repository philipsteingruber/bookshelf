$ProjectRoot = "C:\Users\Philip\code\bookshelf"
$LogFile = "$ProjectRoot\logs\calibre-sync.log"

New-Item -ItemType Directory -Force -Path "$ProjectRoot\logs" | Out-Null

$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $LogFile -Value "`n=== Calibre Sync started at $Timestamp ==="

& "$ProjectRoot\node_modules\.bin\tsx" "$ProjectRoot\scripts\sync-calibre.ts" --apply >> $LogFile 2>&1

$ExitCode = $LASTEXITCODE
Add-Content -Path $LogFile -Value "=== Finished with exit code $ExitCode ==="
exit $ExitCode
