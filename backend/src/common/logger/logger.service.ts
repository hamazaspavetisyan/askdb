import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LoggerService implements NestLoggerService {
    private readonly logger: winston.Logger;

    constructor() {
        const logsDir = path.join(process.cwd(), 'logs');
        const infoDir = path.join(logsDir, 'info');
        const errorsDir = path.join(logsDir, 'errors');

        if (!fs.existsSync(infoDir)) {
            fs.mkdirSync(infoDir, { recursive: true });
        }

        if (!fs.existsSync(errorsDir)) {
            fs.mkdirSync(errorsDir, { recursive: true });
        }

        // Define custom colors for log levels
        winston.addColors({
            info: 'green',
            error: 'red',
            warn: 'yellow',
            debug: 'blue',
            verbose: 'magenta',
            http: 'cyan' // Set HTTP logs to cyan
        });

        // Custom bold formatter
        const boldFormatter = winston.format.printf((info) => {
            const boldLevel = `\u001b[1m${info.level}\u001b[22m`; // ANSI escape codes for bold text
            return `${info.timestamp} ${boldLevel}: ${info.message}`;
        });

        this.logger = winston.createLogger({
            level: 'http',
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                winston.format.printf(
                    (info) => `${info.timestamp} ${info.level}: ${info.message}`
                )
            ),
            transports: [
                new DailyRotateFile({
                    filename: path.join(infoDir, 'info-%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    level: 'http',
                    maxSize: '100m',
                    maxFiles: '500'
                }),
                new DailyRotateFile({
                    filename: path.join(errorsDir, 'error-%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    level: 'error',
                    maxSize: '100m',
                    maxFiles: '500'
                }),
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize({ all: true }), // Apply color to all log levels
                        boldFormatter
                    )
                })
            ]
        });
    }

    log(message: any, context?: string) {
        const entry = `${context || ''}\t${message}`;
        this.logger.info(entry);
    }

    error(message: any, stack?: string, context?: string) {
        const entry = `${context || ''}\t${message}\n${stack || ''}`;
        this.logger.error(entry);
    }

    warn(message: any, context?: string) {
        const entry = `${context || ''}\t${message}`;
        this.logger.warn(entry);
    }

    debug(message: any, context?: string) {
        const entry = `${context || ''}\t${message}`;
        this.logger.debug(entry);
    }

    verbose(message: any, context?: string) {
        const entry = `${context || ''}\t${message}`;
        this.logger.verbose(entry);
    }

    http(message: any, context?: string) {
        const entry = `${context || ''}\t${message}`;
        this.logger.http(entry);
    }

    fatal(message: any, context?: string) {
        const entry = `${context || ''}\t${message}`;
        this.logger.error(entry);
    }
}
