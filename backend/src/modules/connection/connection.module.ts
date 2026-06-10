import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ConnectionController } from './connection.controller';
import { ConnectionService } from './connection.service';
import { SessionStore } from './session.store';

@Module({
    imports: [DatabaseModule],
    controllers: [ConnectionController],
    providers: [ConnectionService, SessionStore],
    // SessionStore is shared with the query module.
    exports: [SessionStore]
})
export class ConnectionModule {}
