import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { ConfigService } from '../config/config.service';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private bot: TelegramBot;

  constructor(private configService: ConfigService) {
    this.bot = new TelegramBot(this.configService.botToken, {
      polling: true,
    });
  }

  onModuleInit() {
    this.logger.log('✅ Бот успешно инициализирован с включённым polling');
  }

  getBot(): TelegramBot {
    return this.bot;
  }

  async sendMessage(
    chatId: number,
    text: string,
    options?: TelegramBot.SendMessageOptions,
  ): Promise<TelegramBot.Message> {
    try {
      return await this.bot.sendMessage(chatId, text, options);
    } catch (error) {
      this.logger.error(`Ошибка отправки сообщения: ${error}`);
      throw error;
    }
  }

  async editMessageText(
    text: string,
    options: TelegramBot.EditMessageTextOptions,
  ): Promise<TelegramBot.Message | boolean> {
    try {
      return await this.bot.editMessageText(text, options);
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (!errorMessage.includes('message is not modified')) {
        this.logger.error(`Ошибка редактирования сообщения: ${errorMessage}`);
      }
      throw error;
    }
  }

  async answerCallbackQuery(
    queryId: string,
    options?: { text?: string; show_alert?: boolean },
  ): Promise<boolean> {
    try {
      return await this.bot.answerCallbackQuery(queryId, options);
    } catch (error) {
      this.logger.error(`Ошибка ответа на callback: ${error}`);
      throw error;
    }
  }

  async getChatMember(
    chatId: string | number,
    userId: number,
  ): Promise<TelegramBot.ChatMember> {
    return await this.bot.getChatMember(chatId, userId);
  }
}
