import {
    BadRequestException,
    INestApplication,
    ValidationError,
    ValidationPipe
} from '@nestjs/common';
import { setupSwagger } from '../utils';
import { LoggerService } from '../logger';
import { urlencoded } from 'express';
import { ConfigService } from '@nestjs/config';
import { CustomSocketIoAdapter } from './custom-socket-io.adapter';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';

export async function runServer(
    app: INestApplication & NestExpressApplication
): Promise<INestApplication> {
    const configService = app.get(ConfigService);
    const version = configService.get<string>('API_VERSION');
    const port = configService.get<number>('LISTENING_PORT');
    const websocketPort = configService.get<number>('WEBSOCKET_LISTENING_PORT');
    const websocketPath = configService.get<string>('WEBSOCKET_PATH');
    app.useWebSocketAdapter(
        new CustomSocketIoAdapter(websocketPort, websocketPath)
    );

    const applicationDocumentationTitle =
        configService.get<string>('API_DOC_TITLE');
    const applicationDocumentationDescription =
        configService.get<string>('API_DOC_DESC');

    app.setGlobalPrefix('api');
    //app.use(json({ limit: '3mb' }));
    app.use(
        bodyParser.json({
            limit: '3mb',
            verify: (req, res, buf) => {
                // This 'verify' function is where rawBody is typically attached
                // It's called *before* parsing the JSON
                // We need to explicitly cast req to include rawBody
                (req as any).rawBody = buf;
            }
        })
    );
    app.use(urlencoded({ extended: true, limit: '3mb' }));
    app.enableCors();

    setupSwagger(
        app,
        applicationDocumentationTitle,
        applicationDocumentationDescription,
        version
    );

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            exceptionFactory: (validationErrors: ValidationError[] = []) => {
                return new BadRequestException(
                    validationErrors.map((error) => ({
                        field: error.property,
                        errors: Object.values(error.constraints)
                    }))
                );
            }
        })
    );
    app.set('trust proxy', 'loopback');
    const logger = app.get(LoggerService);

    await app.listen(port);

    logger.log(`REST application server is listening on port ${port} 🌎`);
    logger.log(`WS server is listening on port ${websocketPort} 🧦`);

    return app;
}
