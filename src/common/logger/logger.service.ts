import { Injectable, LogLevel } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LoggerService {
  private readonly logDir = path.join(process.cwd(), 'logs');
  private readonly isProduction = process.env.NODE_ENV === 'production';
  private readonly enableConsole = process.env.LOG_CONSOLE !== 'false';
  private readonly enableFile = process.env.LOG_FILE === 'true';
  private readonly logLevel = this.parseLogLevel(process.env.LOG_LEVEL || 'error');
  private readonly logRetentionHours = parseInt(process.env.LOG_RETENTION_HOURS || '48', 10);

  constructor() {
    if (this.enableFile) {
      this.ensureLogDirectory();
      this.cleanOldLogs();
      // Initialize log files
      this.writeToFile('application.log', `[${new Date().toISOString()}] [INFO] Logger initialized\n`);
      
      // Run cleanup every hour
      setInterval(() => this.cleanOldLogs(), 60 * 60 * 1000);
    }
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private cleanOldLogs(): void {
    try {
      if (!fs.existsSync(this.logDir)) return;

      const files = fs.readdirSync(this.logDir);
      const now = Date.now();
      const retentionMs = this.logRetentionHours * 60 * 60 * 1000;

      files.forEach((file) => {
        const filepath = path.join(this.logDir, file);
        const stats = fs.statSync(filepath);
        const fileAge = now - stats.mtimeMs;

        if (fileAge > retentionMs) {
          fs.unlinkSync(filepath);
          console.log(`[LogCleanup] Deleted old log: ${file}`);
        }
      });
    } catch (error) {
      console.error('[LogCleanup] Error cleaning old logs:', error);
    }
  }

  private parseLogLevel(level: string): number {
    const levels: { [key: string]: number } = {
      debug: 0,
      log: 1,
      warn: 2,
      error: 3,
    };
    return levels[level.toLowerCase()] ?? 1;
  }

  private getLevelName(level: LogLevel): string {
    return typeof level === 'string' ? level : 'log';
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: { [key: string]: number } = {
      debug: 0,
      log: 1,
      warn: 2,
      error: 3,
    };
    const levelName = this.getLevelName(level);
    return (levels[levelName] ?? 1) >= this.logLevel;
  }

  private formatMessage(
    context: string,
    level: string,
    message: string,
    error?: any,
  ): string {
    const timestamp = new Date().toISOString();
    const errorText = error ? `\n${JSON.stringify(error, null, 2)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}${errorText}`;
  }

  private writeToFile(filename: string, message: string): void {
    if (!this.enableFile) return;

    const filepath = path.join(this.logDir, filename);
    fs.appendFileSync(filepath, message + '\n', 'utf8');
  }

  log(message: any, context?: string, error?: any): void {
    if (!this.shouldLog('log')) return;

    const ctx = context || 'Application';
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    const formatted = this.formatMessage(ctx, 'log', msg, error);

    if (this.enableConsole && !this.isProduction) {
      console.log(formatted);
    }

    if (this.enableFile) {
      this.writeToFile('application.log', formatted);
    }
  }

  warn(message: any, context?: string, error?: any): void {
    if (!this.shouldLog('warn')) return;

    const ctx = context || 'Application';
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    const formatted = this.formatMessage(ctx, 'warn', msg, error);

    if (this.enableConsole && !this.isProduction) {
      console.warn(formatted);
    }

    if (this.enableFile) {
      this.writeToFile('application.log', formatted);
    }
  }

  error(message: any, context?: string, error?: any): void {
    if (!this.shouldLog('error')) return;

    const ctx = context || 'Application';
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    const formatted = this.formatMessage(ctx, 'error', msg, error);

    // Always show errors in production
    if (this.enableConsole) {
      console.error(formatted);
    }

    if (this.enableFile) {
      this.writeToFile('error.log', formatted);
    }
  }

  debug(message: any, context?: string, error?: any): void {
    if (!this.shouldLog('debug')) return;

    const ctx = context || 'Application';
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    const formatted = this.formatMessage(ctx, 'debug', msg, error);

    if (this.enableConsole && !this.isProduction) {
      console.log(formatted);
    }

    if (this.enableFile) {
      this.writeToFile('debug.log', formatted);
    }
  }

  verbose(message: any, context?: string): void {
    this.log(message, context);
  }

  fatal(message: any, context?: string, error?: any): void {
    const ctx = context || 'Application';
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    const formatted = this.formatMessage(ctx, 'fatal', msg, error);

    console.error(formatted);

    if (this.enableFile) {
      this.writeToFile('error.log', formatted);
    }
  }
}
