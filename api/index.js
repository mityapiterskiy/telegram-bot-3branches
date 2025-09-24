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

// Global bot instance to avoid cold start issues
let bot;
let userState;

// Initialize bot and state
function initializeBot() {
  if (!bot) {
    console.log('[INIT] Initializing bot instance...');
    bot = new Telegraf(process.env.BOT_TOKEN);
    userState = new Map();
    console.log('[INIT] Bot initialized successfully');
  }
  return { bot, userState };
}
// 🔧 Ensure the bot instance exists before registering handlers
initializeBot();

// Error handling middleware
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('Произошла ошибка. Попробуйте начать заново с команды /start');
});

// 🔧 Answer every callback query immediately to clear Telegram's loading state
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
  return next();
});

bot.on('callback_query', async (ctx, next) => {
  try { await ctx.answerCbQuery(); } catch (_) {}
  return next();
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
  const startTime = Date.now();
  console.log(`[START] Answer handler for user ${ctx.from.id}, qIdx: ${ctx.match[1]}, optIdx: ${ctx.match[2]}`);

  try {
    // Answer callback immediately to stop loading - multiple attempts for reliability
    let callbackAnswered = false;
    for (let i = 0; i < 2; i++) {
      try {
        await ctx.answerCbQuery();
        callbackAnswered = true;
        console.log(`[1.${i+1}] Callback answered attempt ${i+1} for user ${ctx.from.id} (${Date.now() - startTime}ms)`);
        break;
      } catch (err) {
        console.log(`[1.${i+1}] Callback answer attempt ${i+1} failed for user ${ctx.from.id}:`, err.message);
        if (i < 1) await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms before retry
      }
    }

    // Additional response with progress indicator
    if (!callbackAnswered && ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
        console.log(`[2] Progress callback sent for user ${ctx.from.id} (${Date.now() - startTime}ms)`);
      } catch (_) {}
    }

    const [, qIdx, optIdx] = ctx.match;
    const state = userState.get(ctx.from.id) || {};
    console.log(`[3] Match parsed for user ${ctx.from.id}, state:`, state, `(${Date.now() - startTime}ms)`);

    let branchIndex = state.branch;
    let branch = config.branches[branchIndex];
    console.log(`[4] Branch retrieved for user ${ctx.from.id}, branchIndex: ${branchIndex}, hasBranch: ${!!branch} (${Date.now() - startTime}ms)`);

    // Fallback for serverless: recover branch by matching current question text
    if (!branch) {
      const fallbackStartTime = Date.now();
      console.log(`[5] Branch recovery needed for user ${ctx.from.id}, qIdx: ${qIdx}, state:`, state, `(${Date.now() - startTime}ms)`);
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
        console.log(`[6] Recovered branch ${branch.key} for user ${ctx.from.id} (${Date.now() - startTime}ms, fallback took ${Date.now() - fallbackStartTime}ms)`);
      } else {
        console.error(`[ERROR] Failed to recover branch for user ${ctx.from.id}, qIdx: ${qIdx}, question: ${currentText} (${Date.now() - startTime}ms)`);
        await ctx.answerCbQuery('Ошибка: ветка не найдена');
        return;
      }
    }

    state.answers = state.answers || [];
    state.answers.push({
      question: branch.questions[Number(qIdx)].text,
      answer: branch.questions[Number(qIdx)].options[optIdx]
    });
    console.log(`[7] Answer saved for user ${ctx.from.id}, qIdx: ${qIdx} (${Date.now() - startTime}ms)`);

    // Next question or final result
    const nextQuestionIndex = Number(qIdx) + 1;
    console.log(`[8] Next question index: ${nextQuestionIndex}, total questions: ${branch.questions.length} for user ${ctx.from.id} (${Date.now() - startTime}ms)`);

    if (nextQuestionIndex < branch.questions.length) {
      const nextQ = branch.questions[nextQuestionIndex];
      console.log(`[9] Preparing next question for user ${ctx.from.id}: ${nextQ.text.substring(0, 50)}... (${Date.now() - startTime}ms)`);

      try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch (_) {}
      try {
        await ctx.deleteMessage();
        console.log(`[9.1] Previous question message deleted for user ${ctx.from.id} (${Date.now() - startTime}ms)`);
      } catch (deleteError) {
        console.log(`[WARN] Failed to delete previous message for user ${ctx.from.id}:`, deleteError.message);
      }

      await ctx.reply(
        nextQ.text,
        Markup.inlineKeyboard(
          nextQ.options.map((o, i) => [Markup.button.callback(o, `answer_${nextQuestionIndex}_${i}`)])
        )
      );
      console.log(`[10] Next question sent for user ${ctx.from.id} (${Date.now() - startTime}ms)`);
      try { await ctx.answerCbQuery(); } catch (_) {}
      state.stage = `q_${nextQuestionIndex}`;
      userState.set(ctx.from.id, state);
      console.log(`[11] State updated and handler completed for user ${ctx.from.id}, total time: ${Date.now() - startTime}ms`);
    } else {
      console.log(`[12] Final stage reached for user ${ctx.from.id}, qIdx: ${qIdx} (${Date.now() - startTime}ms)`);
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
        console.log(`[13] Final options sent for user ${ctx.from.id} (${Date.now() - startTime}ms)`);
      } else {
        console.log(`[14] No final options, sending results for user ${ctx.from.id} (${Date.now() - startTime}ms)`);
        // If no postfinal options, finish immediately
        try {
          await sendResultsAndThankYou(ctx, branch.label, state);
          console.log(`User ${ctx.from.id} completed branch: ${branch.label} (total time: ${Date.now() - startTime}ms)`);
        } catch (error) {
          console.error('Error processing final results:', error);
          await ctx.reply('Ваши ответы записаны, но возникла проблема с отправкой. Мы свяжемся с вами.');
        }
      }
    }
  } catch (error) {
    console.error(`[ERROR] Error in answer handler for user ${ctx.from.id}:`, error, `(total time: ${Date.now() - startTime}ms)`);
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
  const requestStart = Date.now();

  // Initialize bot for each request to ensure it's ready
  const { bot } = initializeBot();
  console.log(`[WEBHOOK] ${req.method} request received at ${new Date().toISOString()}, bot initialized: ${!!bot}`);

  try {
    if (req.method === 'POST') {
      console.log(`[WEBHOOK] Processing Telegram update, body size: ${JSON.stringify(req.body).length} bytes`);
      console.log(`[WEBHOOK] Update type:`, req.body?.message ? 'message' : req.body?.callback_query ? 'callback_query' : req.body?.inline_query ? 'inline_query' : 'other');

      const updateStart = Date.now();
      await bot.handleUpdate(req.body);
      const updateTime = Date.now() - updateStart;

      console.log(`[WEBHOOK] Update processed successfully in ${updateTime}ms (total: ${Date.now() - requestStart}ms)`);
      res.status(200).json({ ok: true });
    } else if (req.method === 'GET') {
      console.log(`[WEBHOOK] Health check requested (${Date.now() - requestStart}ms)`);
      // Health check endpoint
      res.status(200).json({
        status: 'Bot is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        botReady: !!bot
      });
    } else {
      console.log(`[WEBHOOK] Method not allowed: ${req.method} (${Date.now() - requestStart}ms)`);
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(`[WEBHOOK ERROR] Handler error after ${Date.now() - requestStart}ms:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

