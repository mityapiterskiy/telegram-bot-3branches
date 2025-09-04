# 📧 Настройка Yandex Mail для Telegram-бота

## 🎯 Преимущества Yandex Mail

✅ **Простота настройки** — можно использовать обычный пароль  
✅ **Бесплатно** — никаких ограничений для личного использования  
✅ **Надёжность** — стабильная работа SMTP сервера  
✅ **Поддержка SSL** — безопасная передача данных  

## 📝 Пошаговая настройка

### 1. Создание почтового ящика

1. Перейдите на [Yandex.ru](https://yandex.ru/)
2. Нажмите "Завести почту" или войдите в существующий аккаунт
3. Создайте почтовый ящик типа `your-name@yandex.ru`

### 2. Включение SMTP доступа

1. Откройте [Настройки почты](https://mail.yandex.ru/#setup/client)
2. Перейдите в раздел **"Почтовые программы"**
3. **Включите** опцию "Доступ по протоколу IMAP"
4. Сохраните настройки

### 3. Настройка переменных окружения

Создайте файл `.env` со следующими параметрами:

```env
# Telegram Bot
BOT_TOKEN=your_bot_token_from_botfather

# Email получатель результатов
RECIPIENT_EMAIL=recipient@example.com

# Yandex Mail SMTP
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=your-name@yandex.ru
SMTP_PASS=your_yandex_password
```

## 🔐 Варианты аутентификации

### Вариант 1: Обычный пароль (рекомендуется)
```env
SMTP_PASS=your_regular_yandex_password
```

### Вариант 2: Пароль приложения (если не работает обычный)
1. Перейдите в [Пароли приложений](https://id.yandex.ru/security/app-passwords)
2. Создайте новый пароль для "Почта"
3. Используйте сгенерированный пароль:
```env
SMTP_PASS=generated_app_password
```

## 🧪 Тестирование настроек

Создайте тестовый файл `test-email.js`:

```javascript
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

async function testEmail() {
  const transporter = nodemailer.createTransporter({
    host: 'smtp.yandex.ru',
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    await transporter.verify();
    console.log('✅ SMTP настройки корректны!');
    
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.RECIPIENT_EMAIL,
      subject: 'Тест Yandex SMTP',
      text: 'Если вы получили это письмо, настройка прошла успешно!'
    });
    
    console.log('✅ Тестовое письмо отправлено!');
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

testEmail();
```

Запустите тест:
```bash
node test-email.js
```

## 🚨 Возможные проблемы

### Ошибка "Invalid login or password"
- Проверьте правильность email и пароля
- Убедитесь, что включен IMAP доступ в настройках
- Попробуйте создать пароль приложения

### Ошибка "Connection timeout"
- Проверьте интернет-соединение
- Убедитесь, что порт 465 не заблокирован файерволом
- Попробуйте порт 587 с `secure: false`

### Ошибка "Self signed certificate"
```javascript
// Добавьте в настройки транспорта:
tls: {
  rejectUnauthorized: false
}
```

## 🔧 Альтернативные настройки

### Для порта 587 (STARTTLS)
```env
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=587
# В коде: secure: false
```

### Для корпоративных доменов
```env
SMTP_HOST=smtp.yandex.ru
SMTP_USER=your-name@your-domain.ru  # Если настроен Yandex для бизнеса
```

## ✅ Готово!

После настройки ваш бот будет автоматически отправлять Excel-файлы с результатами диагностики на указанную почту через Yandex Mail SMTP сервер.

**Никаких сложных настроек OAuth или паролей приложений не требуется!** 🎉
