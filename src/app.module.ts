import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { BotModule } from './bot/bot.module';

@Module({
  imports: [ConfigModule, DatabaseModule, BotModule],
})
export class AppModule {}
