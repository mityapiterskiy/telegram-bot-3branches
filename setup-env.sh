#!/bin/bash

echo "🤖 Настройка переменных окружения для Telegram-бота"
echo "=================================================="
echo ""

# Проверяем наличие Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI не найден. Установите: npm i -g vercel"
    exit 1
fi

echo "📝 Добавляем переменные окружения..."
echo ""

# BOT_TOKEN
echo "1️⃣ BOT_TOKEN (получите у @BotFather в Telegram):"
echo "   Пример: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
vercel env add BOT_TOKEN

echo ""

# RECIPIENT_EMAIL  
echo "2️⃣ RECIPIENT_EMAIL (куда отправлять Excel файлы):"
echo "   Пример: admin@example.com"
vercel env add RECIPIENT_EMAIL

echo ""

# SMTP настройки для Yandex
echo "3️⃣ SMTP_HOST (для Yandex Mail):"
echo "   Введите: smtp.yandex.ru"
vercel env add SMTP_HOST

echo ""

echo "4️⃣ SMTP_PORT (порт для Yandex):"
echo "   Введите: 465"
vercel env add SMTP_PORT

echo ""

echo "5️⃣ SMTP_USER (ваш Yandex email):"
echo "   Пример: your-name@yandex.ru"
vercel env add SMTP_USER

echo ""

echo "6️⃣ SMTP_PASS (пароль от Yandex почты):"
echo "   Введите ваш обычный пароль от Yandex"
vercel env add SMTP_PASS

echo ""
echo "✅ Переменные окружения добавлены!"
echo ""
echo "🚀 Теперь выполните production деплой:"
echo "   vercel --prod"
echo ""
echo "🔗 После деплоя настройте webhook:"
echo "   curl -X POST \"https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook\" \\"
echo "        -d '{\"url\": \"https://your-domain.vercel.app/api\"}'"
