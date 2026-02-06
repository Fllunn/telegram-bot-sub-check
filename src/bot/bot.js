import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/env.js';

let botInstance = null;

/**
 * Initializes and returns TelegramBot instance with polling enabled
 * @returns {TelegramBot} Initialized bot instance
 */
export function initializeBot() {
  if (botInstance) {
    return botInstance;
  }

  try {
    botInstance = new TelegramBot(config.botToken, {
      polling: true,
    });

    console.log('✅ Бот успешно инициализирован с включённым polling');
    return botInstance;
  } catch (error) {
    console.error('❌ Ошибка при инициализации бота:', error.message);
    process.exit(1);
  }
}

/**
 * Gets the initialized bot instance
 * @returns {TelegramBot|null} Bot instance or null if not initialized
 */
export function getBot() {
  return botInstance;
}

export default { initializeBot, getBot };
