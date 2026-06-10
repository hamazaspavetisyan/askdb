import { Module } from '@nestjs/common';
import { ConnectionModule } from '../connection/connection.module';
import { AgentModule } from '../agent/agent.module';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';

@Module({
    imports: [ConnectionModule, AgentModule],
    controllers: [QueryController],
    providers: [QueryService]
})
export class QueryModule {}
