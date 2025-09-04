/**
 * Sets a delayed message to be sent to user after specified timeout
 * @param {Object} bot - Telegraf bot instance
 * @param {number} userId - Telegram user ID
 * @param {string} message - Message text to send
 * @param {Array} options - Array of button options
 * @param {number} delay - Delay in milliseconds (default: 2 hours)
 */
export function setDelayedMessage(bot, userId, message, options, delay = 2 * 60 * 60 * 1000) {
  setTimeout(async () => {
    try {
      const messageOptions = options
        ? {
            reply_markup: {
              inline_keyboard: options.map(option => [
                { text: option, callback_data: 'postfinal_' + option }
              ])
            }
          }
        : undefined;

      await bot.telegram.sendMessage(userId, message, messageOptions);
      console.log(`Delayed message sent to user ${userId}`);
    } catch (error) {
      console.error(`Failed to send delayed message to user ${userId}:`, error);
    }
  }, delay);
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

