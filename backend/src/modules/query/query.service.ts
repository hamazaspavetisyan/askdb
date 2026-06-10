import { Injectable } from '@nestjs/common';
import {
    ListCollectionsRequestDto,
    ListCollectionsResponseDto,
    QueryRequestDto,
    QueryResponseDto
} from '@mongo-mpc/shared';
import { SessionStore } from '../connection/session.store';
import { QueryAgentService } from '../agent/query-agent.service';

@Injectable()
export class QueryService {
    constructor(
        private readonly sessions: SessionStore,
        private readonly agent: QueryAgentService
    ) {}

    /** Run a natural-language query through the agent against the session's adapter. */
    async query(dto: QueryRequestDto): Promise<QueryResponseDto> {
        const session = this.sessions.get(dto.sessionId);
        const startedAt = Date.now();
        const { generatedQuery, explanation, rows } = await this.agent.run(
            session.adapter,
            dto.database,
            dto.naturalLanguage,
            session.history ?? []
        );

        // Remember this turn so the agent has context for follow-ups.
        this.sessions.appendHistory(dto.sessionId, {
            question: dto.naturalLanguage,
            generatedQuery,
            explanation,
            rowCount: rows.length,
            at: Date.now()
        });

        return {
            generatedQuery,
            explanation,
            result: rows,
            executionTimeMs: Date.now() - startedAt
        };
    }

    /** List the collections/tables of a database for the connected session. */
    async listCollections(
        dto: ListCollectionsRequestDto
    ): Promise<ListCollectionsResponseDto> {
        const session = this.sessions.get(dto.sessionId);
        const collections = await session.adapter.listEntities(dto.database);
        return { collections };
    }
}
