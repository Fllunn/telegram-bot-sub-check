import { initializeBot } from './bot/bot.js';
import { registerHandlers } from './bot/commands.js';
import { config } from './config/env.js';

/**
 * Main entry point for the Telegram bot
 */
async function startBot() {
  console.log('🚀 Запуск Telegram бота для проверки подписки...\n');

  // Initialize bot
  const bot = initializeBot();

  // Register command and callback handlers
  registerHandlers();

  // Log configuration
  console.log('📋 Конфигурация загружена:');
  console.log(`   • Требуемые каналы: ${config.requiredChannels.join(', ')}`);
  console.log(`   • Ссылка доступа: ${config.accessLink}`);
  console.log('\n✅ Бот готов к работе и ожидает сообщений!\n');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n⛔ Остановка бота...');
    bot.stopPolling();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n⛔ Остановка бота...');
    bot.stopPolling();
    process.exit(0);
  });
}

// Start the bot
startBot().catch(error => {
  console.error('❌ Критическая ошибка:', error.message);
  process.exit(1);
});
