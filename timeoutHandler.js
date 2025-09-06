/**
 * Sets a delayed message to be sent to user after specified timeout
 * @param {Object} bot - Telegraf bot instance
 * @param {number} userId - Telegram user ID
 * @param {string} message - Message text to send
 * @param {Array} options - Array of button options
 * @param {number} delay - Delay in milliseconds (default: 2 hours)
 */
// Redis-based scheduler: stores jobs for later pickup by cron worker
import { Redis } from '@upstash/redis';

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

async function scheduleWithQStash(userId, message, options, delayMs) {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return false;
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) return false;

  const url = `https://qstash.upstash.io/v2/publish/${encodeURIComponent(
    `https://api.telegram.org/bot${botToken}/sendMessage`
  )}`;

  const body = {
    chat_id: userId,
    text: message,
    ...(options
      ? {
          reply_markup: {
            inline_keyboard: options.map(o => [{ text: o, callback_data: 'postfinal_' + o }]),
          },
        }
      : {}),
  };

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Upstash-Delay': `${Math.max(0, Math.floor(delayMs / 1000))}s`,
  };

  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    console.error('QStash schedule failed:', resp.status, txt);
    return false;
  }
  return true;
}

export async function setDelayedMessage(bot, userId, message, options, delay = 2 * 60 * 60 * 1000) {
  // Prefer QStash direct scheduling to Telegram
  try {
    const ok = await scheduleWithQStash(userId, message, options, delay);
    if (ok) {
      console.log(`QStash scheduled delayed message for user ${userId}`);
      return;
    }
  } catch (e) {
    console.error('QStash scheduling error, will try Redis fallback:', e);
  }

  // Fallback to Redis zset (requires external cron)
  if (!redis) {
    console.warn('No Redis configured; delayed message cannot be scheduled.');
    return;
  }
  const dueAt = Date.now() + delay;
  const job = { userId, message, options, dueAt };
  try {
    await redis.zadd('tg:delayed:jobs', { score: dueAt, member: JSON.stringify(job) });
    console.log(`Scheduled delayed message for user ${userId} at ${new Date(dueAt).toISOString()}`);
  } catch (e) {
    console.error('Failed to schedule delayed message (Redis):', e);
  }
}

/**
 * Handles post-final callback actions
 * @param {Object} bot - Telegraf bot instance
 */
export function setupPostFinalHandlers(bot) {
  // Handle post-final callback actions
  bot.action(/postfinal_(.+)/, async (ctx) => {
    try {
      const action = ctx.match[1];
      
      // You can customize responses based on the action
      const responses = {
        'Хочу в группу': 'Отлично! Я свяжусь с вами в ближайшее время для уточнения деталей.',
        'Задать вопрос': 'Напишите ваш вопрос, и я отвечу в ближайшее время.',
        'В балинтовскую группу': 'Замечательно! Скоро с вами свяжутся для записи в балинтовскую группу.',
        'На разбор практики': 'Отлично! Организуем разбор вашей практики.',
        'Я клиент (хочу терапию)': 'Понятно, я учту, что вы ищете терапевтическую помощь.',
        'Я психолог (хочу как специалист)': 'Отлично, рассмотрим возможности для профессионального развития.'
      };

      const response = responses[action] || 'Спасибо за ваш выбор! Мы свяжемся с вами.';
      
      await ctx.editMessageText(response);
      console.log(`Post-final action processed: ${action} for user ${ctx.from.id}`);
    } catch (error) {
      console.error('Error handling post-final action:', error);
      await ctx.answerCbQuery('Произошла ошибка, попробуйте позже.');
    }
  });
}

