import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }
    const { userId, message, options } = req.body || {};
    if (!userId || !message) {
      res.status(400).json({ ok: false, error: 'Missing userId or message' });
      return;
    }
    const messageOptions = options
      ? {
          reply_markup: {
            inline_keyboard: options.map(o => [{ text: o, callback_data: 'postfinal_' + o }]),
          },
        }
      : undefined;

    await bot.telegram.sendMessage(userId, message, messageOptions);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('qstash handler error:', err);
    res.status(500).json({ ok: false });
  }
}


