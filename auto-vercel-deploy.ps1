Write-Host "🚀 Auto Vercel Deploy Script" -ForegroundColor Cyan
Write-Host ""
# Шаг 1: Проверка авторизации
Write-Host "1. Проверка авторизации Vercel..." -ForegroundColor Yellow
try {
    $whoami = npx vercel whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Не авторизован. Открываю браузер для входа..." -ForegroundColor Red
        Write-Host " Пожалуйста, разреши вход в открывшемся окне браузера" -ForegroundColor Cyan
        npx vercel login
    } else {
        Write-Host "✅ Авторизован как: $whoami" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Ошибка авторизации: $_" -ForegroundColor Red
    exit 1
}
# Шаг 2: Связывание с проектом
Write-Host ""
Write-Host "2. Привязка к проекту smartproto-site..." -ForegroundColor Yellow
npx vercel link --name "smartproto-site" --yes
# Шаг 3: Деплой
Write-Host ""
Write-Host "3. Запуск продакшн-деплоя..." -ForegroundColor Yellow
npx vercel --prod --yes
Write-Host ""
Write-Host "✅ Деплой завершен!" -ForegroundColor Green
Write-Host "🌐 Открой https://vercel.com/dashboard чтобы проверить статус" -ForegroundColor Cyan
