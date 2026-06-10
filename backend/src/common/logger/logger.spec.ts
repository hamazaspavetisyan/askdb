import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from './logger.module';
import { LoggerService } from './logger.service';

describe('Logger', () => {
    let app: TestingModule;

    beforeAll(async () => {
        app = await Test.createTestingModule({
            imports: [LoggerModule],
            controllers: [],
            providers: [LoggerService]
        }).compile();
    });

    describe('log-something', () => {
        it('should return message uuid', () => {
            const logService = app.get(LoggerService);
            logService.log('info log');
            logService.error('error log');
            logService.warn('warning log');
            logService.verbose('verbose log');
            logService.http('http log');
        });
    });
});
