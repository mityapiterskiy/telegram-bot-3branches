import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import config from '../dialogueConfig.js';
import { createExcel } from '../excel.js';
import { sendMail } from '../mailer.js';
// Removed delayed messaging

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
      try { await ctx.answerCbQuery(); } catch (_) {}
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
    // Always answer callback immediately to stop Telegram's button loading/highlight state
    try { await ctx.answerCbQuery(); } catch (_) {}
    // Additional immediate response for slow operations
    if (ctx.callbackQuery) {
      try { await ctx.answerCbQuery('Обрабатываем...'); } catch (_) {}
    }
    const [, qIdx, optIdx] = ctx.match;
    const state = userState.get(ctx.from.id) || {};
    let branchIndex = state.branch;
    let branch = config.branches[branchIndex];

    // Fallback for serverless: recover branch by matching current question text
    if (!branch) {
      console.log(`Branch recovery needed for user ${ctx.from.id}, qIdx: ${qIdx}, state:`, state);
      const currentText = ctx.update?.callback_query?.message?.text;
      const qNumber = Number(qIdx);

      // Try to find branch by question text - cache this operation
      let foundIndex = -1;
      for (let i = 0; i < config.branches.length; i++) {
        if (config.branches[i].questions[qNumber]?.text === currentText) {
          foundIndex = i;
          break; // Found, no need to continue
        }
      }

      if (foundIndex >= 0) {
        branchIndex = foundIndex;
        branch = config.branches[foundIndex];
        state.branch = foundIndex;
        state.answers = state.answers || [];
        userState.set(ctx.from.id, state);
        console.log(`Recovered branch ${branch.key} for user ${ctx.from.id}`);
      } else {
        console.error(`Failed to recover branch for user ${ctx.from.id}, qIdx: ${qIdx}, question: ${currentText}`);
        await ctx.answerCbQuery('Ошибка: ветка не найдена');
        return;
      }
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
      // Some Telegram clients keep the spinner until another acknowledgement; be defensive
      try { await ctx.answerCbQuery(); } catch (_) {}
      state.stage = `q_${nextQuestionIndex}`;
      userState.set(ctx.from.id, state);
    } else {
      // End of questions - remove the last question message and show diagnosis separately
      try { await ctx.deleteMessage(); } catch (_) {}
      await ctx.reply(branch.diagnosis);
      state.stage = 'final';
      userState.set(ctx.from.id, state);

      // Post-final flow per branch
      const currentBranch = config.branches[branchIndex];
      const finalKeyboard = currentBranch.finalOptions?.map((o, i) => [
        Markup.button.callback(o, `postfinal_${currentBranch.key}_${i}`)
      ]);
      if (finalKeyboard && finalKeyboard.length) {
        await ctx.reply(currentBranch.delayed, Markup.inlineKeyboard(finalKeyboard));
      } else {
        // If no postfinal options, finish immediately
        try {
          await sendResultsAndThankYou(ctx, branch.label, state);
          console.log(`User ${ctx.from.id} completed branch: ${branch.label}`);
        } catch (error) {
          console.error('Error processing final results:', error);
          await ctx.reply('Ваши ответы записаны, но возникла проблема с отправкой. Мы свяжемся с вами.');
        }
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

// Post-final handlers
bot.action(/postfinal_(.+)_(\d+)/, async (ctx) => {
  try {
    try { await ctx.answerCbQuery(); } catch (_) {}
    const branchKey = ctx.match[1];
    const optIdx = Number(ctx.match[2]);
    const state = userState.get(ctx.from.id) || {};
    let branchIndex = state.branch;
    let branch = config.branches.find(b => b.key === branchKey) || config.branches[branchIndex];

    // Fallback: recover branch by choice label or by delayed message text
    if (!branch) {
      const msgText = ctx.update?.callback_query?.message?.text;
      let foundIndex = config.branches.findIndex(b => b.key === branchKey);
      if (foundIndex < 0 && msgText) {
        foundIndex = config.branches.findIndex(b => b.delayed === msgText);
      }
      if (foundIndex >= 0) {
        branchIndex = foundIndex;
        branch = config.branches[foundIndex];
        state.branch = foundIndex;
        userState.set(ctx.from.id, state);
      }
    }

    // If user selected a generic final action that requires extra group menu
    const choiceText = branch?.finalOptions?.[optIdx];

    if (branch?.key === 'client' && choiceText === 'Хочу в группу' && branch.groupMenu) {
      // Record final choice before showing group menu
      state.finalChoice = choiceText;
      userState.set(ctx.from.id, state);
      const kb = branch.groupMenu.options.map((o, i) => [Markup.button.callback(o, `group_${branch.key}_${i}`)]);
      await ctx.editMessageText(branch.groupMenu.text, Markup.inlineKeyboard(kb));
      return;
    }
    if (branch?.key === 'mixed' && (optIdx === 0 || optIdx === 1) && branch.groupMenu) {
      // Record final choice ("Я клиент..." / "Я психолог...") before showing group menu
      state.finalChoice = choiceText;
      userState.set(ctx.from.id, state);
      const kb = branch.groupMenu.options.map((o, i) => [Markup.button.callback(o, `group_${branch.key}_${i}`)]);
      await ctx.editMessageText(branch.groupMenu.text, Markup.inlineKeyboard(kb));
      return;
    }

    // Otherwise finalize immediately: remove the final options message and finish
    try { await ctx.deleteMessage(); } catch (_) {}
    state.finalChoice = choiceText;
    userState.set(ctx.from.id, state);
    await sendResultsAndThankYou(ctx, branch?.label || 'Неизвестная ветка', state);
  } catch (error) {
    console.error('Error in postfinal handler:', error);
    await ctx.reply('Произошла ошибка. Попробуйте ещё раз.');
  }
});

// Group selection handlers
bot.action(/group_(.+)_(\d+)/, async (ctx) => {
  try {
    try { await ctx.answerCbQuery(); } catch (_) {}
    const branchKey = ctx.match[1];
    const groupIdx = Number(ctx.match[2]);
    const state = userState.get(ctx.from.id) || {};
    let branch = config.branches.find(b => b.key === branchKey) || config.branches[state.branch];
    // Fallback: infer branch by which branch offers this group option
    if (!branch) {
      const foundIndex = config.branches.findIndex(b => b.key === branchKey);
      if (foundIndex >= 0) {
        branch = config.branches[foundIndex];
        state.branch = foundIndex;
      }
    }
    // Delete the group selection message to remove its inline keyboard
    try { await ctx.deleteMessage(); } catch (_) {}
    const group = branch?.groupMenu?.options?.[groupIdx];
    state.groupChoice = group;
    userState.set(ctx.from.id, state);
    await sendResultsAndThankYou(ctx, branch?.label || 'Неизвестная ветка', state);
  } catch (error) {
    console.error('Error in group handler:', error);
    await ctx.reply('Произошла ошибка. Попробуйте ещё раз.');
  }
});

async function sendResultsAndThankYou(ctx, branchLabel, state) {
  // Extend answers with post-final choices if present
  const enrichedAnswers = [...(state.answers || [])];
  if (state.finalChoice) {
    enrichedAnswers.push({ question: 'Выбор после диагностики', answer: state.finalChoice });
  }
  if (state.groupChoice) {
    enrichedAnswers.push({ question: 'Выбранная группа', answer: state.groupChoice });
  }

  const buffer = await createExcel({
    username: ctx.from.username,
    branch: branchLabel,
    answers: enrichedAnswers
  });
  await sendMail(buffer, branchLabel, process.env.RECIPIENT_EMAIL);
  await ctx.reply('Спасибо! Ваши ответы записаны и отправлены для обработки.');
}

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

