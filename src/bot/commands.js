import { getBot } from './bot.js';
import { config } from '../config/env.js';
import { checkSubscription } from '../services/subscription.service.js';

/**
 * Registers command and callback handlers for the bot
 */
export function registerHandlers() {
  const bot = getBot();

  // Handle /start command
  bot.onText(/\/start/, handleStartCommand);

  // Handle callback button clicks (subscription check)
  bot.on('callback_query', handleCallbackQuery);
}

/**
 * Handles /start command - checks subscription and sends appropriate response
 */
async function handleStartCommand(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    // Perform subscription check
    const result = await checkSubscription(userId);

    if (result.ok) {
      // User is subscribed to all channels
      await sendAccessMessage(chatId);
    } else {
      // User is not subscribed to all channels
      await sendSubscriptionRequiredMessage(chatId, result.failedChannels, result.errors);
    }
  } catch (error) {
    console.error('❌ Error in /start handler:', error.message);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при проверке подписки. Пожалуйста, попробуйте позже.',
    );
  }
}

/**
 * Handles callback query (button clicks)
 */
async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (data === 'CHECK_SUBSCRIPTION') {
    try {
      // Re-check subscription
      const result = await checkSubscription(userId);

      if (result.ok) {
        // User is now subscribed to all channels
        await getBot().answerCallbackQuery(query.id, {
          text: '✅ Отлично! Доступ открыт.',
          show_alert: false,
        });

        await getBot().editMessageText(
          '✅ Отлично! Вы подписаны на все необходимые каналы.\n\n' + formatAccessMessage(),
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML',
          },
        );
      } else {
        // Still not subscribed to all channels
        // Show alert notification
        await getBot().answerCallbackQuery(query.id, {
          text: '❌ Вы подписаны не на все каналы. Подпишитесь на все требуемые каналы.',
          show_alert: true,
        });

        const message = formatSubscriptionRequiredMessage(result.failedChannels, result.errors);
        const editMessageOptions = {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🔄 Проверить подписку',
                  callback_data: 'CHECK_SUBSCRIPTION',
                },
              ],
            ],
          },
        };

        try {
          await getBot().editMessageText(message, editMessageOptions);
        } catch (editError) {
          // If message not modified, ignore error (already showed alert)
          if (!editError.message.includes('message is not modified')) {
            throw editError;
          }
        }
      }
    } catch (error) {
      console.error('❌ Ошибка в обработчике callback:', error.message);
      await getBot().answerCallbackQuery(query.id, {
        text: 'Ошибка при проверке подписки',
        show_alert: true,
      });
    }
  }
}

/**
 * Sends access link message to user
 */
async function sendAccessMessage(chatId) {
  const message =
    '✅ Отлично! Вы подписаны на все необходимые каналы.\n\n' + formatAccessMessage();

  await getBot().sendMessage(chatId, message, {
    parse_mode: 'HTML',
  });
}

/**
 * Formats access message with link
 */
function formatAccessMessage() {
  return `🔗 <a href="${config.accessLink}">Нажмите для доступа</a>`;
}

/**
 * Sends subscription required message with list of channels and check button
 */
async function sendSubscriptionRequiredMessage(chatId, failedChannels, errors) {
  const message = formatSubscriptionRequiredMessage(failedChannels, errors);

  await getBot().sendMessage(chatId, message, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🔄 Проверить подписку',
            callback_data: 'CHECK_SUBSCRIPTION',
          },
        ],
      ],
    },
  });
}

/**
 * Formats subscription required message
 */
function formatSubscriptionRequiredMessage(failedChannels, errors) {
  let message = '❌ Вы не подписаны на все необходимые каналы.\n\n';
  message += '📋 <b>Требуемые каналы:</b>\n';

  for (const channel of failedChannels) {
    message += `• ${formatChannelName(channel)}\n`;
  }

  // Add error messages if any
  if (errors.length > 0) {
    message += '\n⚠️ <b>Возникли проблемы:</b>\n';
    for (const error of errors) {
      message += `• ${error.errorMsg}\n`;
    }
  }

  message += '\n👇 Подпишитесь на все каналы и нажмите кнопку ниже для проверки.';

  return message;
}

/**
 * Formats channel name for display (converts numeric ID to readable format)
 * Creates clickable links for @username channels
 */
function formatChannelName(channel) {
  if (channel.startsWith('@')) {
    const channelName = channel.substring(1); // Remove @
    return `<a href="https://t.me/${channelName}">${channel}</a>`;
  }
  return `<code>Канал ${channel}</code>`;
}

export default { registerHandlers };
