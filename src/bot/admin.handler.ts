import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import TelegramBot from 'node-telegram-bot-api';
import { BotService } from './bot.service';
import { ConfigService } from '../config/config.service';
import { Channel, ChannelDocument } from '../schemas/channel.schema';
import {
  AccessLink,
  AccessLinkDocument,
} from '../schemas/access-link.schema';

interface UserState {
  action: 'add_channel' | 'remove_channel' | 'add_link' | 'remove_link' | null;
  step: 'waiting_input' | 'waiting_selection' | null;
  page?: number;
}

@Injectable()
export class AdminHandler implements OnModuleInit {
  private readonly logger = new Logger(AdminHandler.name);
  private userStates: Map<number, UserState> = new Map();

  constructor(
    @InjectModel(Channel.name) private channelModel: Model<ChannelDocument>,
    @InjectModel(AccessLink.name)
    private accessLinkModel: Model<AccessLinkDocument>,
    private botService: BotService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    const bot = this.botService.getBot();

    bot.onText(/\/admin_add_channel/, (msg) =>
      this.handleAddChannelStart(msg),
    );
    bot.onText(/\/admin_remove_channel/, (msg) =>
      this.handleRemoveChannelStart(msg),
    );
    bot.onText(/\/admin_list_channels/, (msg) => this.handleListChannels(msg));
    bot.onText(/\/admin_add_link/, (msg) => this.handleAddLinkStart(msg));
    bot.onText(/\/admin_list_links/, (msg) => this.handleListLinks(msg));
    bot.onText(/\/admin_remove_link/, (msg) =>
      this.handleRemoveLinkStart(msg),
    );

    // Обработчик для текстовых сообщений от пользователей в ожидании ввода
    bot.on('message', (msg) => this.handleUserInput(msg));
    
    // Обработчик для callback_query от кнопок пагинации и удаления
    bot.on('callback_query', (query) => this.handleCallbackQuery(query));

    this.logger.log('✅ Обработчики админ-команд зарегистрированы');
  }

  private async handleAddChannelStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !this.configService.isAdmin(userId)) {
      await this.botService.sendMessage(
        chatId,
        '❌ У вас нет прав для выполнения этой команды.',
      );
      return;
    }

    this.userStates.set(userId, { action: 'add_channel', step: 'waiting_input' });
    await this.botService.sendMessage(
      chatId,
      'Введите название канала:\n\nПримеры:\n• @mychannel\n• https://t.me/mychannel',
    );
  }

  private async handleRemoveChannelStart(
    msg: TelegramBot.Message,
  ): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !this.configService.isAdmin(userId)) {
      await this.botService.sendMessage(
        chatId,
        '❌ У вас нет прав для выполнения этой команды.',
      );
      return;
    }

    this.userStates.set(userId, {
      action: 'remove_channel',
      step: 'waiting_selection',
      page: 0,
    });
    await this.showRemoveChannelList(chatId, userId, 0);
  }

  private async handleUserInput(msg: TelegramBot.Message): Promise<void> {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    const text = msg.text;

    this.logger.log(`[ADMIN] 📨 Получено сообщение: text="${text}", userId=${userId}`);

    if (!userId || !text || text.startsWith('/')) {
      this.logger.log(`[ADMIN] ⏭️ Пропуск: нет userId, текста или команда`);
      return;
    }

    // Проверяем, является ли пользователь админом
    if (!this.configService.isAdmin(userId)) {
      this.logger.log(`[ADMIN] 👤 Пользователь ${userId} не админ, пропуск`);
      return; // Не обрабатываем сообщения от не-админов
    }

    this.logger.log(`[ADMIN] 👑 Пользователь ${userId} является админом`);

    // Обработка кнопок Reply Keyboard
    const buttonCommands: { [key: string]: () => Promise<void> } = {
      'Добавить канал': () => this.handleAddChannelStart({ chat: { id: chatId }, from: { id: userId } } as TelegramBot.Message),
      'Список каналов': () => this.handleListChannels({ chat: { id: chatId }, from: { id: userId } } as TelegramBot.Message),
      'Удалить канал': () => this.handleRemoveChannelStart({ chat: { id: chatId }, from: { id: userId } } as TelegramBot.Message),
      'Добавить ссылку': () => this.handleAddLinkStart({ chat: { id: chatId }, from: { id: userId } } as TelegramBot.Message),
      'Список ссылок': () => this.handleListLinks({ chat: { id: chatId }, from: { id: userId } } as TelegramBot.Message),
      'Удалить ссылку': () => this.handleRemoveLinkStart({ chat: { id: chatId }, from: { id: userId } } as TelegramBot.Message),
    };

    if (buttonCommands[text]) {
      this.logger.log(`[ADMIN] 🔘 Обработка кнопки: ${text}`);
      await buttonCommands[text]();
      return;
    }

    const state = this.userStates.get(userId);
    if (!state || state.step !== 'waiting_input') {
      this.logger.log(`[ADMIN] ⏭️ Нет состояния или не ждем ввод для userId=${userId}`);
      return;
    }

    this.logger.log(`[ADMIN] ✅ Обработка ввода для action=${state.action}`);

    try {
      switch (state.action) {
        case 'add_channel':
          await this.addChannel(chatId, userId, text);
          break;
        case 'remove_channel':
          await this.handleRemoveChannelText(chatId, userId, text);
          break;
        case 'add_link':
          await this.addLink(chatId, userId, text);
          break;
        case 'remove_link':
          await this.handleRemoveLinkText(chatId, userId, text);
          break;
      }
    } finally {
      this.userStates.delete(userId);
    }
  }

  private async addChannel(
    chatId: number,
    userId: number,
    channelInput: string,
  ): Promise<void> {
    try {
      const channelId = this.normalizeChannel(channelInput);

      const existing = await this.channelModel
        .findOne({ channelId })
        .lean()
        .exec();

      if (existing) {
        await this.botService.sendMessage(
          chatId,
          `⚠️ Канал ${channelId} уже добавлен.`,
        );
        return;
      }

      // Проверяем доступ бота к каналу
      try {
        const bot = this.botService.getBot();
        const botInfo = await bot.getMe();
        const member = await this.botService.getChatMember(channelId, botInfo.id);
        
        const hasAccess = ['member', 'administrator', 'creator'].includes(member.status);
        
        if (!hasAccess) {
          await this.botService.sendMessage(
            chatId,
            `⚠️ Бот не состоит в канале ${channelId}. Добавьте бота в канал и попробуйте снова.`,
          );
          return;
        }
      } catch (checkError) {
        const errorMsg = (checkError as Error).message || 'Неизвестная ошибка';
        let userMessage = `⚠️ Не удалось проверить доступ к каналу ${channelId}.\n\n`;
        
        if (errorMsg.includes('not found')) {
          userMessage += 'Канал не найден. Проверьте имя или ID канала.';
        } else if (errorMsg.includes('member list is inaccessible')) {
          userMessage += 'Бот не может получить доступ к списку подписчиков. Убедитесь, что бот добавлен в канал как администратор.';
        } else if (errorMsg.includes('forbidden')) {
          userMessage += 'Бот не имеет прав доступа к каналу. Добавьте бота в канал.';
        } else {
          userMessage += `Ошибка: ${errorMsg}`;
        }
        
        await this.botService.sendMessage(chatId, userMessage);
        return;
      }

      await this.channelModel.create({
        channelId,
        addedBy: userId,
      });

      this.logger.log(`Канал ${channelId} добавлен пользователем ${userId}`);
      await this.botService.sendMessage(
        chatId,
        `✅ Канал ${channelId} успешно добавлен в список проверки.`,
      );
    } catch (error) {
      this.logger.error(`Ошибка при добавлении канала: ${error}`);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при добавлении канала. Проверьте правильность ввода.',
      );
    }
  }

  private async removeChannel(
    chatId: number,
    userId: number,
    channelId: string,
  ): Promise<void> {
    try {
      const channel = await this.channelModel.findById(channelId).lean();
      if (!channel) {
        await this.botService.sendMessage(
          chatId,
          '❌ Канал не найден',
        );
        return;
      }

      await this.channelModel.findByIdAndDelete(channelId);

      const state = this.userStates.get(userId);
      if (state) {
        state.action = null;
        state.step = null;
        state.page = undefined;
      }

      this.logger.log(`Канал ${channel.channelId} удалён`);
      await this.botService.sendMessage(
        chatId,
        `✅ Канал ${channel.channelId} успешно удалён из списка проверки.`,
      );
    } catch (error) {
      this.logger.error(`Ошибка при удалении канала: ${error}`);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при удалении канала.',
      );
    }
  }

  private async handleRemoveChannelText(
    chatId: number,
    userId: number,
    channelInput: string,
  ): Promise<void> {
    try {
      const channelId = this.normalizeChannel(channelInput);
      const channels = await this.channelModel.find().lean();
      
      // Find channel by normalized ID
      const channel = channels.find(c => 
        this.normalizeChannel(c.channelId) === channelId ||
        c.channelId === channelInput
      );

      if (!channel) {
        await this.botService.sendMessage(
          chatId,
          `⚠️ Канал ${channelId} не найден в списке.`,
        );
        return;
      }

      await this.removeChannel(chatId, userId, channel._id.toString());
    } catch (error) {
      this.logger.error(`Ошибка при удалении канала: ${error}`);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при удалении канала.',
      );
    }
  }

  private async handleListChannels(msg: TelegramBot.Message, page: number = 0): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !this.configService.isAdmin(userId)) {
      await this.botService.sendMessage(
        chatId,
        '❌ У вас нет прав для выполнения этой команды.',
      );
      return;
    }

    try {
      const channels = await this.channelModel
        .find()
        .lean()
        .exec();

      if (channels.length === 0) {
        await this.botService.sendMessage(
          chatId,
          'Список каналов для проверки пуст.',
        );
        return;
      }

      const pageSize = 10;
      const totalPages = Math.ceil(channels.length / pageSize);
      const startIdx = page * pageSize;
      const pageChannels = channels.slice(startIdx, startIdx + pageSize);

      let message = `<b>Активные каналы для проверки (стр. ${page + 1}/${totalPages}):</b>\n\n`;
      pageChannels.forEach((channel, idx) => {
        const globalIdx = startIdx + idx;
        message += `${globalIdx + 1}. <code>${channel.channelId}</code>\n`;
      });

      // Кнопки пагинации
      const keyboard = [];
      const navButtons = [];
      
      if (page > 0) {
        navButtons.push({
          text: '⬅️ Предыдущая',
          callback_data: `list_channels_page_${page - 1}`,
        });
      }
      
      if (page < totalPages - 1) {
        navButtons.push({
          text: 'Следующая ➡️',
          callback_data: `list_channels_page_${page + 1}`,
        });
      }
      
      if (navButtons.length > 0) {
        keyboard.push(navButtons);
      }

      await this.botService.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
      });
    } catch (error) {
      this.logger.error(`Ошибка при получении списка каналов: ${error}`);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при получении списка каналов.',
      );
    }
  }

  private async handleGetLink(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !this.configService.isAdmin(userId)) {
      await this.botService.sendMessage(
        chatId,
        '❌ У вас нет прав для выполнения этой команды.',
      );
      return;
    }

    try {
      const accessLink = await this.accessLinkModel
        .findOne()
        .lean()
        .exec();

      if (!accessLink) {
        await this.botService.sendMessage(
          chatId,
          '⚠️ Ссылка доступа не установлена.',
        );
        return;
      }

      await this.botService.sendMessage(
        chatId,
        `🔗 Текущая ссылка доступа:\n${accessLink.url}`,
      );
    } catch (error) {
      this.logger.error(`Ошибка при получении ссылки: ${error}`);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при получении ссылки.',
      );
    }
  }

  private async handleAddLinkStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !this.configService.isAdmin(userId)) {
      await this.botService.sendMessage(
        chatId,
        '❌ У вас нет прав для выполнения этой команды.',
      );
      return;
    }

    this.userStates.set(userId, { action: 'add_link', step: 'waiting_input' });
    await this.botService.sendMessage(
      chatId,
      'Введите ссылку доступа для добавления:\n\nПримеры:\n• https://example.com/access\n• https://t.me/+mylink',
    );
  }

  private async handleListLinks(msg: TelegramBot.Message, page: number = 0): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !this.configService.isAdmin(userId)) {
      await this.botService.sendMessage(
        chatId,
        '❌ У вас нет прав для выполнения этой команды.',
      );
      return;
    }

    try {
      const links = await this.accessLinkModel
        .find()
        .lean()
        .exec();

      if (links.length === 0) {
        await this.botService.sendMessage(
          chatId,
          'Список ссылок доступа пуст.',
        );
        return;
      }

      const pageSize = 10;
      const totalPages = Math.ceil(links.length / pageSize);
      const startIdx = page * pageSize;
      const pageLinks = links.slice(startIdx, startIdx + pageSize);

      let message = `<b>Активные ссылки доступа (стр. ${page + 1}/${totalPages}):</b>\n\n`;
      pageLinks.forEach((link, idx) => {
        const globalIdx = startIdx + idx;
        message += `${globalIdx + 1}. ${link.url}\n`;
      });

      // Кнопки пагинации
      const keyboard = [];
      const navButtons = [];
      
      if (page > 0) {
        navButtons.push({
          text: '⬅️ Предыдущая',
          callback_data: `list_links_page_${page - 1}`,
        });
      }
      
      if (page < totalPages - 1) {
        navButtons.push({
          text: 'Следующая ➡️',
          callback_data: `list_links_page_${page + 1}`,
        });
      }
      
      if (navButtons.length > 0) {
        keyboard.push(navButtons);
      }

      await this.botService.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
      });
    } catch (error) {
      this.logger.error(`Ошибка при получении списка ссылок: ${error}`);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при получении списка ссылок.',
      );
    }
  }

  private async handleRemoveLinkStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !this.configService.isAdmin(userId)) {
      await this.botService.sendMessage(
        chatId,
        '❌ У вас нет прав для выполнения этой команды.',
      );
      return;
    }

    this.userStates.set(userId, {
      action: 'remove_link',
      step: 'waiting_selection',
      page: 0,
    });
    await this.showRemoveLinkList(chatId, userId, 0);
  }

  private async addLink(
    chatId: number,
    userId: number,
    url: string,
  ): Promise<void> {
    try {
      const existing = await this.accessLinkModel
        .findOne({ url })
        .lean()
        .exec();

      if (existing) {
        await this.botService.sendMessage(
          chatId,
          `⚠️ Ссылка уже добавлена:\n${url}`,
        );
        return;
      }

      await this.accessLinkModel.create({
        url,
        updatedBy: userId,
      });

      this.logger.log(`Ссылка доступа добавлена пользователем ${userId}: ${url}`);
      await this.botService.sendMessage(
        chatId,
        `✅ Ссылка успешно добавлена:\n${url}`,
      );
    } catch (error) {
      this.logger.error(`Ошибка при добавлении ссылки: ${error}`);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при добавлении ссылки.',
      );
    }
  }

  private async removeLink(chatId: number, userId: number, linkId: string) {
    try {
      const link = await this.accessLinkModel.findById(linkId).lean();
      if (!link) {
        await this.botService.sendMessage(
          chatId,
          '❌ Ссылка не найдена',
        );
        return;
      }

      await this.accessLinkModel.findByIdAndDelete(linkId);

      const state = this.userStates.get(userId);
      if (state) {
        state.action = null;
        state.step = null;
        state.page = undefined;
      }

      this.logger.log(`Ссылка ${link.url} удалена`);
      await this.botService.sendMessage(
        chatId,
        `✅ Ссылка успешно удалена`,
      );
    } catch (error) {
      this.logger.error('Remove link error', error);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при удалении ссылки',
      );
    }
  }

  private async handleRemoveLinkText(
    chatId: number,
    userId: number,
    url: string,
  ): Promise<void> {
    try {
      const links = await this.accessLinkModel.find().lean();
      
      // Find link by URL (exact or contains match)
      const link = links.find(l => 
        l.url === url ||
        l.url.includes(url) ||
        url.includes(l.url)
      );

      if (!link) {
        await this.botService.sendMessage(
          chatId,
          `⚠️ Ссылка не найдена в списке.`,
        );
        return;
      }

      await this.removeLink(chatId, userId, link._id.toString());
    } catch (error) {
      this.logger.error(`Ошибка при удалении ссылки: ${error}`);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при удалении ссылки.',
      );
    }
  }

  private normalizeChannel(channel: string): string {
    // Handle https://t.me/channel_name format
    if (channel.includes('https://t.me/')) {
      const match = channel.match(/https:\/\/t\.me\/([\w@]+)/);
      if (match && match[1]) {
        const name = match[1];
        return name.startsWith('@') ? name : `@${name}`;
      }
    }

    // Handle t.me/channel_name format
    if (channel.includes('t.me/')) {
      const match = channel.match(/t\.me\/([\w@]+)/);
      if (match && match[1]) {
        const name = match[1];
        return name.startsWith('@') ? name : `@${name}`;
      }
    }

    // Handle @channel_name format
    if (channel.startsWith('@')) {
      return channel;
    }

    // Handle numeric ID format
    if (/^-?\d+$/.test(channel)) {
      return channel;
    }

    // If no @ prefix for username, add it
    if (!channel.startsWith('-') && !/^\d+$/.test(channel)) {
      return `@${channel}`;
    }

    return channel;
  }

  private async handleCallbackQuery(query: any) {
    const { id: callbackId, from, data, message } = query;
    const chatId = message.chat.id;
    const userId = from.id;

    try {
      const state = this.userStates.get(userId);

      // Callback для пагинации списка каналов
      if (data.startsWith('list_channels_page_')) {
        const page = parseInt(data.replace('list_channels_page_', ''));
        await this.showListChannelsPage(chatId, page);
        await this.botService.answerCallbackQuery(callbackId);
        return;
      }

      // Callback для пагинации списка ссылок
      if (data.startsWith('list_links_page_')) {
        const page = parseInt(data.replace('list_links_page_', ''));
        await this.showListLinksPage(chatId, page);
        await this.botService.answerCallbackQuery(callbackId);
        return;
      }

      // Callback для пагинации каналов
      if (data === 'next_page_remove_channel' || data === 'prev_page_remove_channel') {
        if (!state || state.action !== 'remove_channel') {
          await this.botService.answerCallbackQuery(callbackId, {
            text: 'Сессия истекла',
            show_alert: true,
          });
          return;
        }

        const currentPage = state.page || 0;
        const newPage = data === 'next_page_remove_channel' ? currentPage + 1 : Math.max(0, currentPage - 1);
        
        state.page = newPage;
        await this.showRemoveChannelList(chatId, userId, newPage);
        await this.botService.answerCallbackQuery(callbackId);
        return;
      }

      // Callback для пагинации ссылок
      if (data === 'next_page_remove_link' || data === 'prev_page_remove_link') {
        if (!state || state.action !== 'remove_link') {
          await this.botService.answerCallbackQuery(callbackId, {
            text: 'Сессия истекла',
            show_alert: true,
          });
          return;
        }

        const currentPage = state.page || 0;
        const newPage = data === 'next_page_remove_link' ? currentPage + 1 : Math.max(0, currentPage - 1);
        
        state.page = newPage;
        await this.showRemoveLinkList(chatId, userId, newPage);
        await this.botService.answerCallbackQuery(callbackId);
        return;
      }

      // Callback для выбора канала из списка
      if (data.startsWith('select_remove_channel_')) {
        if (!state || state.action !== 'remove_channel') {
          await this.botService.answerCallbackQuery(callbackId, {
            text: 'Сессия истекла',
            show_alert: true,
          });
          return;
        }

        const channelId = data.replace('select_remove_channel_', '');
        await this.removeChannel(chatId, userId, channelId);
        
        await this.botService.answerCallbackQuery(callbackId);
        return;
      }

      // Callback для выбора ссылки из списка
      if (data.startsWith('select_remove_link_')) {
        if (!state || state.action !== 'remove_link') {
          await this.botService.answerCallbackQuery(callbackId, {
            text: 'Сессия истекла',
            show_alert: true,
          });
          return;
        }

        const linkId = data.replace('select_remove_link_', '');
        await this.removeLink(chatId, userId, linkId);
        
        await this.botService.answerCallbackQuery(callbackId);
        return;
      }

      await this.botService.answerCallbackQuery(callbackId);
    } catch (error) {
      this.logger.error('Callback query error', error);
      await this.botService.answerCallbackQuery(callbackId, {
        text: '❌ Ошибка',
        show_alert: true,
      });
    }
  }

  private async showRemoveChannelList(chatId: number, userId: number, page: number = 0) {
    try {
      const channels = await this.channelModel.find().lean();

      if (channels.length === 0) {
        await this.botService.sendMessage(
          chatId,
          'Нет каналов для удаления',
        );
        return;
      }

      const pageSize = 10;
      const totalPages = Math.ceil(channels.length / pageSize);
      const startIdx = page * pageSize;
      const pageChannels = channels.slice(startIdx, startIdx + pageSize);

      let message = `<b>Выберите канал для удаления (стр. ${page + 1}/${totalPages}):</b>\n\n`;
      const keyboard = [];

      pageChannels.forEach((channel, idx) => {
        const globalIdx = startIdx + idx;
        const displayName = channel.channelId.replace(/^@/, '');
        message += `${globalIdx + 1}. <code>${displayName}</code>\n`;
        
        keyboard.push([{
          text: `${globalIdx + 1}. ${displayName}`,
          callback_data: `select_remove_channel_${channel._id}`,
        }]);
      });

      // Кнопки пагинации
      const navButtons = [];
      if (page > 0) {
        navButtons.push({
          text: '⬅️ Предыдущая',
          callback_data: 'prev_page_remove_channel',
        });
      }
      if (page < totalPages - 1) {
        navButtons.push({
          text: 'Следующая ➡️',
          callback_data: 'next_page_remove_channel',
        });
      }
      if (navButtons.length > 0) {
        keyboard.push(navButtons);
      }

      message += `\nИли введите номер/название канала вручную`;

      await this.botService.sendMessage(
        chatId,
        message,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        }
      );

      // Переключаем состояние на waiting_input для ручного ввода
      const state = this.userStates.get(userId);
      if (state) {
        state.step = 'waiting_input';
      }
    } catch (error) {
      this.logger.error('Show remove channel list error', error);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при загрузке списка каналов',
      );
    }
  }

  private async showRemoveLinkList(chatId: number, userId: number, page: number = 0) {
    try {
      const links = await this.accessLinkModel.find().lean();

      if (links.length === 0) {
        await this.botService.sendMessage(
          chatId,
          'Нет ссылок для удаления',
        );
        return;
      }

      const pageSize = 10;
      const totalPages = Math.ceil(links.length / pageSize);
      const startIdx = page * pageSize;
      const pageLinks = links.slice(startIdx, startIdx + pageSize);

      let message = `📋 <b>Выберите ссылку для удаления (стр. ${page + 1}/${totalPages}):</b>\n\n`;
      const keyboard = [];

      pageLinks.forEach((link, idx) => {
        const globalIdx = startIdx + idx;
        message += `${globalIdx + 1}. <code>${link.url}</code>\n`;
        
        keyboard.push([{
          text: `${globalIdx + 1}. ${link.url.substring(0, 30)}...`,
          callback_data: `select_remove_link_${link._id}`,
        }]);
      });

      // Кнопки пагинации
      const navButtons = [];
      if (page > 0) {
        navButtons.push({
          text: '⬅️ Предыдущая',
          callback_data: 'prev_page_remove_link',
        });
      }
      if (page < totalPages - 1) {
        navButtons.push({
          text: 'Следующая ➡️',
          callback_data: 'next_page_remove_link',
        });
      }
      if (navButtons.length > 0) {
        keyboard.push(navButtons);
      }

      message += `\nИли введите номер/ссылку вручную`;

      await this.botService.sendMessage(
        chatId,
        message,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        }
      );

      // Переключаем состояние на waiting_input для ручного ввода
      const state = this.userStates.get(userId);
      if (state) {
        state.step = 'waiting_input';
      }

    } catch (error) {
      this.logger.error('Show remove link list error', error);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при загрузке списка ссылок',
      );
    }
  }

  private async showListChannelsPage(chatId: number, page: number = 0) {
    try {
      const channels = await this.channelModel
        .find()
        .lean()
        .exec();

      if (channels.length === 0) {
        await this.botService.sendMessage(
          chatId,
          'Список каналов для проверки пуст.',
        );
        return;
      }

      const pageSize = 10;
      const totalPages = Math.ceil(channels.length / pageSize);
      const startIdx = page * pageSize;
      const pageChannels = channels.slice(startIdx, startIdx + pageSize);

      let message = `<b>Активные каналы для проверки (стр. ${page + 1}/${totalPages}):</b>\n\n`;
      pageChannels.forEach((channel, idx) => {
        const globalIdx = startIdx + idx;
        message += `${globalIdx + 1}. <code>${channel.channelId}</code>\n`;
      });

      // Кнопки пагинации
      const keyboard = [];
      const navButtons = [];
      
      if (page > 0) {
        navButtons.push({
          text: '⬅️ Предыдущая',
          callback_data: `list_channels_page_${page - 1}`,
        });
      }
      
      if (page < totalPages - 1) {
        navButtons.push({
          text: 'Следующая ➡️',
          callback_data: `list_channels_page_${page + 1}`,
        });
      }
      
      if (navButtons.length > 0) {
        keyboard.push(navButtons);
      }

      await this.botService.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
      });
    } catch (error) {
      this.logger.error('Show list channels page error', error);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при загрузке списка каналов',
      );
    }
  }
  private async showListLinksPage(chatId: number, page: number = 0) {
    try {
      const links = await this.accessLinkModel
        .find()
        .lean()
        .exec();

      if (links.length === 0) {
        await this.botService.sendMessage(
          chatId,
          'Список ссылок доступа пуст.',
        );
        return;
      }

      const pageSize = 10;
      const totalPages = Math.ceil(links.length / pageSize);
      const startIdx = page * pageSize;
      const pageLinks = links.slice(startIdx, startIdx + pageSize);

      let message = `<b>Активные ссылки доступа (стр. ${page + 1}/${totalPages}):</b>\n\n`;
      pageLinks.forEach((link, idx) => {
        const globalIdx = startIdx + idx;
        message += `${globalIdx + 1}. ${link.url}\n`;
      });

      // Кнопки пагинации
      const keyboard = [];
      const navButtons = [];
      
      if (page > 0) {
        navButtons.push({
          text: '⬅️ Предыдущая',
          callback_data: `list_links_page_${page - 1}`,
        });
      }
      
      if (page < totalPages - 1) {
        navButtons.push({
          text: 'Следующая ➡️',
          callback_data: `list_links_page_${page + 1}`,
        });
      }
      
      if (navButtons.length > 0) {
        keyboard.push(navButtons);
      }

      await this.botService.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
      });
    } catch (error) {
      this.logger.error('Show list links page error', error);
      await this.botService.sendMessage(
        chatId,
        '❌ Ошибка при загрузке списка ссылок',
      );
    }
  }}
