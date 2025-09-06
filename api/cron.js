import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';

dotenv.config();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const bot = new Telegraf(process.env.BOT_TOKEN);

export default async function handler(req, res) {
  try {
    // pull all jobs due until now
    const now = Date.now();
    const jobs = await redis.zrangebyscore('tg:delayed:jobs', 0, now, { limit: { offset: 0, count: 50 } });

    for (const raw of jobs) {
      try {
        const job = JSON.parse(raw);
        const messageOptions = job.options
          ? {
              reply_markup: {
                inline_keyboard: job.options.map(o => [{ text: o, callback_data: 'postfinal_' + o }]),
              },
            }
          : undefined;
        await bot.telegram.sendMessage(job.userId, job.message, messageOptions);
      } catch (e) {
        console.error('Failed to process job:', e);
      } finally {
        // remove from set regardless to avoid reprocessing
        await redis.zrem('tg:delayed:jobs', raw);
      }
    }

    res.status(200).json({ ok: true, processed: jobs.length });
  } catch (err) {
    console.error('Cron handler error:', err);
    res.status(500).json({ ok: false });
  }
}


