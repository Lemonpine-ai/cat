# --- 다보냥 프론트엔드 자동 배포 (저장소 루트 = 이 스크립트와 있는 폴더) ---
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host "🚀 보리 & 찹쌀이 대시보드 업데이트를 시작합니다!" -ForegroundColor Cyan

git add .

$currentDate = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "update: dashboard ($currentDate)"

Write-Host "📦 깃허브 금고로 안전하게 이동 중..." -ForegroundColor Yellow
git push origin master

Write-Host "✅ 완료! 이제 1~2분 뒤면 Vercel 사이트에 자동으로 반영됩니다." -ForegroundColor Green
Write-Host "--------------------------------------------------"
Pause
