import { Module } from '@nestjs/common';
import { LoggerModule } from '../../common/logger';
import { LlmService } from './llm.service';
import { QueryAgentService } from './query-agent.service';

@Module({
    imports: [LoggerModule],
    providers: [LlmService, QueryAgentService],
    exports: [QueryAgentService]
})
export class AgentModule {}
