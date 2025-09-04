# 🚀 Инструкции по деплою на Vercel

## ✅ Статус деплоя

**Preview деплой выполнен успешно!**
- Preview URL: `https://testrepo-7uepv6gdi-mityas-projects-ec3e6ad8.vercel.app`
- Production URL: `https://testrepo-eta-five.vercel.app` (будет активен после добавления переменных)

## 🔐 Настройка переменных окружения

### Вариант 1: Через Vercel CLI

Выполните следующие команды в терминале:

```bash
# 1. Токен Telegram бота (получить у @BotFather)
vercel env add BOT_TOKEN

# 2. Email для получения Excel файлов
vercel env add RECIPIENT_EMAIL

# 3. SMTP настройки для Yandex Mail
vercel env add SMTP_HOST
# Введите: smtp.yandex.ru

vercel env add SMTP_PORT
# Введите: 465

vercel env add SMTP_USER
# Введите: your.email@yandex.ru

vercel env add SMTP_PASS
# Введите: ваш пароль от Yandex почты
```

### Вариант 2: Через веб-интерфейс

1. Откройте [Vercel Dashboard](https://vercel.com/dashboard)
2. Найдите проект `test_repo`
3. Перейдите в Settings → Environment Variables
4. Добавьте переменные:

| Переменная | Значение | Описание |
|------------|----------|----------|
| `BOT_TOKEN` | `your_bot_token` | Токен от @BotFather |
| `RECIPIENT_EMAIL` | `recipient@example.com` | Email для Excel файлов |
| `SMTP_HOST` | `smtp.yandex.ru` | SMTP сервер Yandex |
| `SMTP_PORT` | `465` | Порт для SSL |
| `SMTP_USER` | `your@yandex.ru` | Ваш Yandex email |
| `SMTP_PASS` | `your_password` | Пароль от Yandex |

## 🚀 Production деплой

После добавления переменных окружения выполните:

```bash
vercel --prod
```

## 🤖 Настройка Telegram webhook

После успешного production деплоя настройте webhook для бота:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://testrepo-eta-five.vercel.app/api"}'
```

Замените:
- `<YOUR_BOT_TOKEN>` на ваш реальный токен
- `testrepo-eta-five.vercel.app` на ваш production URL

## 🔍 Проверка работы

### 1. Health Check
Откройте в браузере: `https://your-domain.vercel.app/api`

Должен вернуться JSON:
```json
{
  "status": "Bot is running",
  "timestamp": "2024-09-04T20:01:30.252Z"
}
```

### 2. Тест бота
Напишите `/start` вашему боту в Telegram

### 3. Проверка логов
```bash
vercel logs
```

## 🛠️ Возможные проблемы

### Ошибка "Missing environment variables"
- Убедитесь, что все переменные добавлены в Vercel
- Проверьте правильность названий переменных
- Выполните `vercel --prod` после добавления переменных

### Бот не отвечает
- Проверьте настройку webhook
- Убедитесь, что BOT_TOKEN корректный
- Проверьте логи: `vercel logs`

### Ошибки отправки email
- Проверьте настройки Yandex Mail
- Убедитесь, что включен IMAP в настройках почты
- Попробуйте создать пароль приложения

## 📝 Полезные команды

```bash
# Просмотр переменных окружения
vercel env ls

# Удаление переменной
vercel env rm VARIABLE_NAME

# Просмотр логов
vercel logs

# Информация о проекте
vercel inspect

# Откат к предыдущей версии
vercel rollback
```

## 🎉 Готово!

После выполнения всех шагов ваш Telegram-бот будет работать на Vercel и автоматически отправлять Excel-файлы с результатами диагностики на указанную почту через Yandex Mail.

**Production URL:** https://testrepo-eta-five.vercel.app
