import { NestFactory } from '@nestjs/core';
import { LogLevel } from '@nestjs/common';
import { AppModule } from './app.module';
import { LoggerService } from './common/logger/logger.service';

async function bootstrap() {
  const logger = new LoggerService();
  const isProduction = process.env.NODE_ENV === 'production';

  try {
    logger.log('🚀 Запуск Telegram бота для проверки подписки...', 'Bootstrap');

    // In production, disable NestJS console logging
    const nestLoggerConfig: false | LogLevel[] = isProduction 
      ? false 
      : ['error', 'warn', 'log'];
    
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: nestLoggerConfig,
    });

    logger.log('✅ Бот готов к работе и ожидает сообщений!', 'Bootstrap');

    // Keep the application running
    process.on('SIGINT', async () => {
      logger.warn('⛔ Остановка бота...', 'Bootstrap');
      await app.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.warn('⛔ Остановка бота...', 'Bootstrap');
      await app.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error('❌ Критическая ошибка:', 'Bootstrap', error);
    process.exit(1);
  }
}

bootstrap();
