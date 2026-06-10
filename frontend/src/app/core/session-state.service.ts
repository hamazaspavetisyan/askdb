import { Injectable, computed, signal } from '@angular/core';
import { ConnectResponseDto, DbType } from '@mongo-mpc/shared';

/**
 * Holds the active connection session in memory (signals). Cleared on
 * disconnect. Intentionally not persisted — credentials live only on the
 * server for the session's lifetime.
 */
@Injectable({ providedIn: 'root' })
export class SessionStateService {
    private readonly _sessionId = signal<string | null>(null);
    private readonly _dbType = signal<DbType | null>(null);
    private readonly _databases = signal<string[]>([]);

    readonly sessionId = this._sessionId.asReadonly();
    readonly dbType = this._dbType.asReadonly();
    readonly databases = this._databases.asReadonly();
    readonly isConnected = computed(() => this._sessionId() !== null);

    start(res: ConnectResponseDto): void {
        this._sessionId.set(res.sessionId);
        this._dbType.set(res.dbType);
        this._databases.set(res.databases);
    }

    clear(): void {
        this._sessionId.set(null);
        this._dbType.set(null);
        this._databases.set([]);
    }
}
