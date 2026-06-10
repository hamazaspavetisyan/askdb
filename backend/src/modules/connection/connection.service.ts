import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { ConnectRequestDto, ConnectResponseDto } from '@mongo-mpc/shared';
import { AdapterFactory } from '../../database/adapter.factory';
import { SessionStore } from './session.store';

@Injectable()
export class ConnectionService {
    constructor(
        private readonly adapterFactory: AdapterFactory,
        private readonly sessions: SessionStore
    ) {}

    /**
     * Open a connection, register a session, and return the visible databases.
     * The live adapter is held in the session pool; nothing sensitive is
     * persisted beyond process memory.
     */
    async connect(params: ConnectRequestDto): Promise<ConnectResponseDto> {
        const adapter = this.adapterFactory.create(params);
        await adapter.connect();

        let databases: string[];
        try {
            databases = await adapter.listDatabases();
        } catch (err) {
            await adapter.disconnect().catch(() => undefined);
            throw err;
        }

        const id = uuid();
        const now = Date.now();
        this.sessions.set({
            id,
            dbType: params.dbType,
            adapter,
            createdAt: now,
            lastUsedAt: now,
            history: []
        });

        return { sessionId: id, dbType: params.dbType, databases };
    }

    async disconnect(sessionId: string): Promise<void> {
        await this.sessions.remove(sessionId);
    }
}
