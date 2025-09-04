import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import config from '../dialogueConfig.js';
import { createExcel } from '../excel.js';
import { sendMail } from '../mailer.js';
import { setDelayedMessage, setupPostFinalHandlers } from '../timeoutHandler.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['BOT_TOKEN', 'RECIPIENT_EMAIL', 'SMTP_USER', 'SMTP_PASS'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  console.error('Make sure to set up Yandex Mail SMTP settings in your .env file');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const userState = new Map();

// Error handling middleware
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('Произошла ошибка. Попробуйте начать заново с команды /start');
});

// Greeting and main menu
bot.start(async (ctx) => {
  try {
    userState.set(ctx.from.id, { stage: 'menu', answers: [] });
    const buttons = config.branches.map(b => [Markup.button.callback(b.label, `branch_${b.key}`)]);
    await ctx.reply(config.greeting, Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('Произошла ошибка при запуске. Попробуйте еще раз.');
  }
});

// Branch selection handlers
config.branches.forEach((branch, idx) => {
  bot.action(`branch_${branch.key}`, async (ctx) => {
    try {
      userState.set(ctx.from.id, { stage: 'q_0', branch: idx, answers: [] });
      const q = branch.questions[0];
      await ctx.editMessageText(
        q.text,
        Markup.inlineKeyboard(q.options.map((o, i) => [Markup.button.callback(o, `answer_0_${i}`)]))
      );
    } catch (error) {
      console.error('Error in branch selection:', error);
      await ctx.answerCbQuery('Произошла ошибка, попробуйте еще раз.');
    }
  });
});

// Answer handlers and branch navigation
bot.action(/answer_(\d+)_(\d+)/, async (ctx) => {
  try {
    const [, qIdx, optIdx] = ctx.match;
    const state = userState.get(ctx.from.id) || {};
    const branch = config.branches[state.branch];
    
    if (!branch) {
      await ctx.answerCbQuery('Ошибка: ветка не найдена');
      return;
    }

    state.answers = state.answers || [];
    state.answers.push({
      question: branch.questions[Number(qIdx)].text,
      answer: branch.questions[Number(qIdx)].options[optIdx]
    });

    // Next question or final result
    const nextQuestionIndex = Number(qIdx) + 1;
    if (nextQuestionIndex < branch.questions.length) {
      const nextQ = branch.questions[nextQuestionIndex];
      await ctx.editMessageText(
        nextQ.text,
        Markup.inlineKeyboard(
          nextQ.options.map((o, i) => [Markup.button.callback(o, `answer_${nextQuestionIndex}_${i}`)])
        )
      );
      state.stage = `q_${nextQuestionIndex}`;
      userState.set(ctx.from.id, state);
    } else {
      // End of questions - show diagnosis and process results
      await ctx.editMessageText(branch.diagnosis);
      state.stage = 'final';
      userState.set(ctx.from.id, state);

      try {
        // Create Excel file and send email
        const buffer = await createExcel({
          username: ctx.from.username,
          branch: branch.label,
          answers: state.answers
        });

        await sendMail(buffer, branch.label, process.env.RECIPIENT_EMAIL);
        
        await ctx.reply('Спасибо! Ваши ответы записаны и отправлены для обработки.');

        // Set delayed message (2 hours)
        setDelayedMessage(bot, ctx.from.id, branch.delayed, branch.finalOptions);
        
        console.log(`User ${ctx.from.id} completed branch: ${branch.label}`);
      } catch (error) {
        console.error('Error processing final results:', error);
        await ctx.reply('Ваши ответы записаны, но возникла проблема с отправкой. Мы свяжемся с вами.');
      }
    }
  } catch (error) {
    console.error('Error in answer handler:', error);
    await ctx.answerCbQuery('Произошла ошибка, попробуйте еще раз.');
  }
});

// Help command
bot.help((ctx) => {
  ctx.reply('Используйте /start для начала диагностики. Если возникли проблемы, начните заново с команды /start.');
});

// Setup post-final handlers for delayed messages
setupPostFinalHandlers(bot);

// Handle unknown commands
bot.on('message', (ctx) => {
  ctx.reply('Используйте кнопки для навигации или команду /start для начала.');
});

// Export handler for Vercel
export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      // Handle Telegram webhook
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } else if (req.method === 'GET') {
      // Health check endpoint
      res.status(200).json({ 
        status: 'Bot is running',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

