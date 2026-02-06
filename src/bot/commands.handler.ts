import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import TelegramBot from 'node-telegram-bot-api';
import { BotService } from './bot.service';
import { SubscriptionService } from './subscription.service';
import {
  AccessLink,
  AccessLinkDocument,
} from '../schemas/access-link.schema';
import { ConfigService } from '../config/config.service';

@Injectable()
export class CommandsHandler implements OnModuleInit {
  private readonly logger = new Logger(CommandsHandler.name);

  constructor(
    @InjectModel(AccessLink.name)
    private accessLinkModel: Model<AccessLinkDocument>,
    private botService: BotService,
    private subscriptionService: SubscriptionService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    const bot = this.botService.getBot();

    bot.onText(/\/start/, (msg) => this.handleStart(msg));
    bot.on('callback_query', (query) => this.handleCallbackQuery(query));
    bot.on('message', (msg) => this.handleMessage(msg));

    this.logger.log('✅ Обработчики пользовательских команд зарегистрированы');
  }

  private async handleStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    // Проверяем, является ли пользователь админом
    if (this.configService.isAdmin(userId)) {
      await this.sendAdminHelp(chatId);
      return;
    }

    await this.checkAndNotifySubscription(chatId, userId);
  }

  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    const text = msg.text;
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    this.logger.log(`📨 Получено сообщение: text="${text}", userId=${userId}, chatId=${chatId}`);

    if (!text || !userId || text.startsWith('/')) {
      this.logger.log(`⏭️ Пропуск сообщения: text=${text}, startsWith /=${text?.startsWith('/')}`);
      return;
    }

    // Проверяем, является ли пользователь админом
    if (this.configService.isAdmin(userId)) {
      this.logger.log(`👤 Пользователь ${userId} является админом, пропуск`);
      return; // Админы не используют эту кнопку
    }

    this.logger.log(`🔍 Проверка текста: "${text}" === "Проверить подписку": ${text === 'Проверить подписку'}`);

    if (text === 'Проверить подписку') {
      this.logger.log(`✅ Вызов handleStart для userId=${userId}`);
      await this.handleStart(msg);
    }
  }

  private async checkAndNotifySubscription(chatId: number, userId: number): Promise<void> {
    try {
      const result = await this.subscriptionService.checkSubscription(userId);

      if (result.ok) {
        await this.sendAccessMessage(chatId);
      } else {
        await this.sendSubscriptionRequiredMessage(
          chatId,
          result.failedChannels,
          result.errors,
        );
      }
    } catch (error) {
      this.logger.error(`❌ Ошибка при проверке подписки: ${error}`);
      await this.botService.sendMessage(
        chatId,
        '❌ Произошла ошибка при проверке подписки. Пожалуйста, попробуйте позже.',
      );
    }
  }

  private async sendAdminHelp(chatId: number): Promise<void> {
    const message = `

<b>Доступные команды:</b>

<b>Управление каналами:</b>
• /admin_add_channel - добавить канал для проверки
• /admin_list_channels - показать все каналы
• /admin_remove_channel - удалить канал из проверки

<b>Управление ссылками доступа:</b>
• /admin_add_link - добавить новую ссылку доступа
• /admin_list_links - показать все ссылки
• /admin_remove_link - удалить ссылку`;

    await this.botService.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [
          [{ text: 'Добавить канал' }, { text: 'Список каналов' }],
          [{ text: 'Удалить канал' }],
          [{ text: 'Добавить ссылку' }, { text: 'Список ссылок' }],
          [{ text: 'Удалить ссылку' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    });
  }

  private async handleCallbackQuery(
    query: TelegramBot.CallbackQuery,
  ): Promise<void> {
    const chatId = query.message?.chat.id;
    const userId = query.from.id;
    const data = query.data;
    const queryId = query.id;

    this.logger.log(`📩 Callback query получен: queryId=${queryId}, userId=${userId}, data=${data}`);

    if (!chatId || data !== 'CHECK_SUBSCRIPTION') {
      this.logger.warn(`⚠️ Некорректный callback: chatId=${chatId}, data=${data}`);
      return;
    }

    try {
      const result = await this.subscriptionService.checkSubscription(userId);

      if (result.ok) {
        this.logger.log(`✅ Пользователь ${userId} подписан на все каналы`);
        
        const accessMessage = await this.getAccessMessage();
        const successMessage = `✅ Отлично! Вы подписаны на все необходимые каналы.\n\n${accessMessage}`;

        let messageSent = false;

        // Пытаемся отредактировать существующее сообщение
        try {
          await this.botService.editMessageText(successMessage, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: 'HTML',
          });
          messageSent = true;
          this.logger.log(`✅ Сообщение об успехе отредактировано для пользователя ${userId}`);
        } catch (editError) {
          this.logger.debug(
            `⚠️ Не удалось отредактировать сообщение для ${userId}: ${(editError as Error).message}`,
          );
        }

        // Если редактирование не сработало, отправляем новое сообщение
        if (!messageSent) {
          try {
            await this.botService.sendMessage(chatId, successMessage, {
              parse_mode: 'HTML',
            });
            messageSent = true;
            this.logger.log(`✅ Новое сообщение об успехе отправлено пользователю ${userId}`);
          } catch (sendError) {
            this.logger.error(`❌ Ошибка при отправке сообщения ${userId}: ${(sendError as Error).message}`);
          }
        }

        // Показываем уведомление
        try {
          this.logger.log(`📤 Отправка уведомления об успехе для пользователя ${userId}, queryId=${queryId}`);
          await this.botService.answerCallbackQuery(queryId, {
            text: '✅ Доступ открыт!',
            show_alert: false,
          });
          this.logger.log(`✅ Уведомление об успехе отправлено пользователю ${userId}`);
        } catch (alertError) {
          this.logger.error(`❌ Ошибка при отправке уведомления для ${userId}: ${(alertError as Error).message}`);
        }
      } else {
        this.logger.log(`❌ Пользователь ${userId} не подписан. Каналы: ${result.failedChannels.join(', ')}`);
        
        const message = this.formatSubscriptionRequiredMessage(
          result.failedChannels,
          result.errors,
        );

        let messageSent = false;

        // Пытаемся отредактировать существующее сообщение
        try {
          await this.botService.editMessageText(message, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Проверить подписку',
                    callback_data: 'CHECK_SUBSCRIPTION',
                  },
                ],
              ],
            },
          });
          messageSent = true;
          this.logger.log(`✅ Сообщение отредактировано для пользователя ${userId}`);
        } catch (editError) {
          this.logger.debug(
            `⚠️ Не удалось отредактировать сообщение для ${userId}: ${(editError as Error).message}`,
          );
        }

        // Если редактирование не сработало, отправляем новое сообщение
        if (!messageSent) {
          try {
            await this.botService.sendMessage(chatId, message, {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: 'Проверить подписку',
                      callback_data: 'CHECK_SUBSCRIPTION',
                    },
                  ],
                ],
              },
            });
            messageSent = true;
            this.logger.log(`✅ Новое сообщение отправлено пользователю ${userId}`);
          } catch (sendError) {
            this.logger.error(`❌ Ошибка при отправке сообщения ${userId}: ${(sendError as Error).message}`);
          }
        }

        // Показываем alert уведомление в конце
        try {
          this.logger.log(`📤 Отправка alert для пользователя ${userId}, queryId=${queryId}`);
          await this.botService.answerCallbackQuery(queryId, {
            text: '❌ Вы подписаны не на все каналы.',
            show_alert: true,
          });
          this.logger.log(`✅ Alert успешно отправлен пользователю ${userId}`);
        } catch (alertError) {
          this.logger.error(`❌ Ошибка при отправке alert для ${userId}: ${(alertError as Error).message}`);
        }
      }
    } catch (error) {
      this.logger.error(`❌ Ошибка в обработчике callback для пользователя ${userId}: ${error}`);
      try {
        await this.botService.answerCallbackQuery(queryId, {
          text: 'Ошибка при проверке подписки',
          show_alert: true,
        });
      } catch (alertError) {
        this.logger.error(`❌ Ошибка при отправке alert об ошибке: ${(alertError as Error).message}`);
      }
    }
  }

  private async sendAccessMessage(chatId: number): Promise<void> {
    const accessMessage = await this.getAccessMessage();
    const message = `✅ Отлично! Вы подписаны на все необходимые каналы.\n\n${accessMessage}`;

    await this.botService.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [
          [{ text: 'Проверить подписку' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    });
  }

  private async getAccessMessage(): Promise<string> {
    const accessLinks = await this.accessLinkModel
      .find()
      .lean()
      .exec();

    if (accessLinks.length === 0) {
      return '🔗 Ссылка доступа не установлена. Обратитесь к администратору.';
    }

    let message = '<b>Теперь вам доступен эксклюзивный доступ к каналам:</b>\n\n';
    accessLinks.forEach((link, index) => {
      message += `${index + 1}. ${link.url}\n`;
    });
    
    return message;
  }

  private async sendSubscriptionRequiredMessage(
    chatId: number,
    failedChannels: string[],
    errors: Array<{ channel: string; errorMsg: string }>,
  ): Promise<void> {
    const message = this.formatSubscriptionRequiredMessage(
      failedChannels,
      errors,
    );

    await this.botService.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [
          [{ text: 'Проверить подписку' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    });
  }

  private formatSubscriptionRequiredMessage(
    failedChannels: string[],
    errors: Array<{ channel: string; errorMsg: string }>,
  ): string {
    let message = '❌ Вы не подписаны на все необходимые каналы.\n\n';
    message += '📋 <b>Требуемые каналы:</b>\n';

    for (const channel of failedChannels) {
      message += `• ${this.formatChannelName(channel)}\n`;
    }

    message += '\n👇 Подпишитесь на все каналы и нажмите кнопку ниже для проверки.';

    return message;
  }

  private formatChannelName(channel: string): string {
    if (channel.startsWith('@')) {
      const channelName = channel.substring(1);
      return `<a href="https://t.me/${channelName}">${channel}</a>`;
    }
    return `<code>Канал ${channel}</code>`;
  }
}
