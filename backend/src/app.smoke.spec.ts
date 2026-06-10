import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConnectionController } from './modules/connection/connection.controller';
import { QueryController } from './modules/query/query.controller';

/**
 * Boots the full AppModule (without listening on a port) to verify the
 * dependency-injection graph resolves — every provider, controller and
 * cross-module import wires up cleanly.
 */
describe('AppModule (DI smoke test)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        // LlmService.onModuleInit requires a key; a dummy is fine (no API call here).
        process.env.ANTHROPIC_API_KEY ||= 'sk-test-dummy';
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule]
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
    }, 30_000);

    afterAll(async () => {
        await app?.close();
    });

    it('resolves the controllers', () => {
        expect(app.get(ConnectionController)).toBeDefined();
        expect(app.get(QueryController)).toBeDefined();
    });
});
