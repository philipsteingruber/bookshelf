$ProjectRoot = "C:\Users\Philip\code\bookshelf"
$LogFile = "$ProjectRoot\logs\calibre-sync.log"

New-Item -ItemType Directory -Force -Path "$ProjectRoot\logs" | Out-Null
Set-Location $ProjectRoot
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"`n=== Calibre Sync started at $Timestamp ===" | Out-File -FilePath $LogFile -Append -Encoding UTF8

$Output = & "C:\Program Files\nodejs\node.exe" "$ProjectRoot\node_modules\tsx\dist\cli.mjs" "$ProjectRoot\scripts\sync-calibre.ts" --apply 2>&1
$Output | Out-File -FilePath $LogFile -Append -Encoding UTF8

$ExitCode = $LASTEXITCODE
"=== Finished with exit code $ExitCode ===" | Out-File -FilePath $LogFile -Append -Encoding UTF8
exit $ExitCode
