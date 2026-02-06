import { Injectable, Logger } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);

  constructor(private nestConfigService: NestConfigService) {
    this.validateConfig();
  }

  private validateConfig(): void {
    const required = ['BOT_TOKEN', 'MONGODB_URI', 'ADMIN_IDS'];
    const missing: string[] = [];

    for (const key of required) {
      if (!this.nestConfigService.get<string>(key)) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      this.logger.error(
        `❌ Ошибка: отсутствуют обязательные переменные окружения: ${missing.join(', ')}`,
      );
      this.logger.error(
        '   Пожалуйста, создайте файл .env на основе .env.example',
      );
      process.exit(1);
    }

    this.logger.log('✅ Конфигурация успешно загружена и проверена');
  }

  get botToken(): string {
    return this.nestConfigService.get<string>('BOT_TOKEN')!;
  }

  get mongodbUri(): string {
    return this.nestConfigService.get<string>('MONGODB_URI')!;
  }

  get adminIds(): number[] {
    const adminIdsString =
      this.nestConfigService.get<string>('ADMIN_IDS') || '';
    return adminIdsString
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id));
  }

  isAdmin(userId: number): boolean {
    return this.adminIds.includes(userId);
  }
}
