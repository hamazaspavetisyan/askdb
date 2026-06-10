import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { runServer } from './common/network';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {});
    await runServer(app);
}
bootstrap();
