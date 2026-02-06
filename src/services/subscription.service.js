import { getBot } from '../bot/bot.js';
import { config } from '../config/env.js';

/**
 * Checks if user is subscribed to all required channels
 * Returns detailed status with failed channels and errors
 * @param {number} userId - Telegram user ID to check
 * @returns {Promise<{ok: boolean, failedChannels: string[], errors: Array}>}
 */
export async function checkSubscription(userId) {
  const bot = getBot();
  const result = {
    ok: true,
    failedChannels: [],
    errors: [],
  };

  // Check subscription for each required channel
  for (const channel of config.requiredChannels) {
    try {
      // Attempt to get chat member info
      const member = await bot.getChatMember(channel, userId);

      // Check if user is actually subscribed (not just kicked or restricted)
      const isSubscribed = ['member', 'administrator', 'creator'].includes(member.status);

      if (!isSubscribed) {
        result.failedChannels.push(channel);
        result.ok = false;
      }
    } catch (error) {
      // Log error and add to failed channels
      const errorMsg = error.message || 'Неизвестная ошибка';
      console.error(`❌ Ошибка при проверке подписки на ${channel}:`, errorMsg);

      result.failedChannels.push(channel);
      result.errors.push({
        channel,
        errorMsg: formatErrorMessage(errorMsg, channel),
      });
      result.ok = false;
    }
  }

  return result;
}

/**
 * Formats error messages for user-friendly display
 * @param {string} errorMsg - Original error message
 * @param {string} channel - Channel identifier
 * @returns {string} Formatted error message
 */
function formatErrorMessage(errorMsg, channel) {
  // Handle common API errors
  if (errorMsg.includes('not found')) {
    return `Канал ${channel} не найден. Проверьте имя или ID канала.`;
  }
  if (errorMsg.includes('user not a member')) {
    return `Бот не состоит в канале ${channel}.`;
  }
  if (errorMsg.includes('member list is inaccessible')) {
    return `Бот не может получить доступ к списку подписчиков ${channel}. Убедитесь, что бот состоит в канале.`;
  }
  if (errorMsg.includes('forbidden')) {
    return `Бот не может получить доступ к ${channel} (проблема с правами).`;
  }
  if (errorMsg.includes('private')) {
    return `Канал ${channel} приватный и недоступен.`;
  }

  return `Не удалось проверить подписку на ${channel}.`;
}

export default { checkSubscription };
