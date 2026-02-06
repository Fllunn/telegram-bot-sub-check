import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    logger.log('🚀 Запуск Telegram бота для проверки подписки...\n');

    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    logger.log('\n✅ Бот готов к работе и ожидает сообщений!\n');

    // Keep the application running
    process.on('SIGINT', async () => {
      logger.log('\n⛔ Остановка бота...');
      await app.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.log('\n⛔ Остановка бота...');
      await app.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error('❌ Критическая ошибка:', error);
    process.exit(1);
  }
}

bootstrap();
