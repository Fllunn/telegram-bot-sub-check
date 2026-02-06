import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Channel, ChannelDocument } from '../schemas/channel.schema';
import { BotService } from './bot.service';

export interface SubscriptionCheckResult {
  ok: boolean;
  failedChannels: string[];
  errors: Array<{ channel: string; errorMsg: string }>;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectModel(Channel.name) private channelModel: Model<ChannelDocument>,
    private botService: BotService,
  ) {}

  async checkSubscription(userId: number): Promise<SubscriptionCheckResult> {
    const result: SubscriptionCheckResult = {
      ok: true,
      failedChannels: [],
      errors: [],
    };

    try {
      const channels = await this.channelModel
        .find()
        .lean()
        .exec();

      if (channels.length === 0) {
        this.logger.warn('Нет каналов для проверки');
        return result;
      }

      for (const channel of channels) {
        try {
          const member = await this.botService.getChatMember(
            channel.channelId,
            userId,
          );

          const isSubscribed = ['member', 'administrator', 'creator'].includes(
            member.status,
          );

          if (!isSubscribed) {
            result.failedChannels.push(channel.channelId);
            result.ok = false;
          }
        } catch (error) {
          const errorMsg = (error as Error).message || 'Неизвестная ошибка';
          this.logger.error(
            `❌ Ошибка при проверке подписки на ${channel.channelId}: ${errorMsg}`,
          );

          result.failedChannels.push(channel.channelId);
          result.errors.push({
            channel: channel.channelId,
            errorMsg: this.formatErrorMessage(errorMsg, channel.channelId),
          });
          result.ok = false;
        }
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Критическая ошибка при проверке подписки: ${error}`,
      );
      return {
        ok: false,
        failedChannels: [],
        errors: [
          {
            channel: 'system',
            errorMsg: 'Ошибка при получении списка каналов',
          },
        ],
      };
    }
  }

  private formatErrorMessage(errorMsg: string, channel: string): string {
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
}
