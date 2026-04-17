# Convenience launcher for Windows PowerShell.
# 1) make sure .env exists
# 2) make sure ngrok is running in another terminal: ngrok http 5050
# 3) make sure PUBLIC_HOSTNAME in .env matches your ngrok URL (host only, no https://)

if (!(Test-Path .env)) {
  Write-Host "No .env file — real calls need one. Mock calls still work: npm start, then use Run mock call (free)." -ForegroundColor Yellow
}

if (!(Test-Path node_modules)) {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  npm install
}

Write-Host "`nStarting CrossCall server on http://localhost:5050 ..." -ForegroundColor Green
npm start
