import { Injectable, NestMiddleware } from '@nestjs/common';

import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '../logger';
import { humanFileSize } from '../utils';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
    constructor(private readonly logger: LoggerService) {}
    use(request: Request, response: Response, next: NextFunction): void {
        const { ip, method, url } = request;
        const userAgent = request.get('user-agent');

        const start = Date.now();

        response.on('close', () => {
            const { statusCode } = response;
            const contentLength = response.get('content-length') || '0';

            const duration = Date.now() - start;
            this.logger.http(
                `${method} ${url} ${statusCode} ${ip} - ${humanFileSize(parseInt(contentLength, 10))} (${userAgent}) - ${duration} ms`
            );
        });

        next();
    }
}
