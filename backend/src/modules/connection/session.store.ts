import {
    HttpStatus,
    Injectable,
    OnModuleDestroy,
    OnModuleInit
} from '@nestjs/common';
import { DbType } from '@mongo-mpc/shared';
import { FriendlyException, ErrorKeys } from '../../common/errors';
import { DatabaseAdapter } from '../../database/database-adapter.interface';

/**
 * One past natural-language turn within a session. Kept small on purpose
 * (no result rows) so the per-session history stays well under its cap.
 */
export interface QueryHistoryEntry {
    question: string;
    generatedQuery: string;
    explanation: string;
    rowCount: number;
    at: number;
}

export interface Session {
    id: string;
    dbType: DbType;
    adapter: DatabaseAdapter;
    createdAt: number;
    lastUsedAt: number;
    /** Prior turns in this session, oldest first. */
    history?: QueryHistoryEntry[];
}

/** Evict sessions idle longer than this (ms). */
const IDLE_TTL_MS = 30 * 60 * 1000;
/** How often to sweep for idle sessions (ms). */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
/** Hard caps on per-session history, per the product requirement. */
const MAX_HISTORY_ENTRIES = 100;
const MAX_HISTORY_BYTES = 1_000_000; // ~1 MB

/**
 * In-memory pool of live database connections, keyed by sessionId.
 *
 * Single-instance by design (per current scope). Credentials live only
 * inside the adapter for the session's lifetime and are never persisted.
 * Idle sessions are disconnected and evicted on a timer.
 */
@Injectable()
export class SessionStore implements OnModuleInit, OnModuleDestroy {
    private readonly sessions = new Map<string, Session>();
    private sweepTimer?: ReturnType<typeof setInterval>;

    onModuleInit(): void {
        this.sweepTimer = setInterval(
            () => void this.evictIdle(),
            SWEEP_INTERVAL_MS
        );
        // Don't keep the process alive solely for the sweep.
        this.sweepTimer.unref?.();
    }

    async onModuleDestroy(): Promise<void> {
        if (this.sweepTimer) clearInterval(this.sweepTimer);
        await Promise.all(
            [...this.sessions.values()].map((s) =>
                s.adapter.disconnect().catch(() => undefined)
            )
        );
        this.sessions.clear();
    }

    set(session: Session): void {
        if (!session.history) session.history = [];
        this.sessions.set(session.id, session);
    }

    /**
     * Append a turn to a session's history, then enforce the caps:
     * at most {@link MAX_HISTORY_ENTRIES} entries and {@link MAX_HISTORY_BYTES}
     * bytes (oldest entries dropped first).
     */
    appendHistory(sessionId: string, entry: QueryHistoryEntry): void {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        const history = session.history ?? (session.history = []);
        history.push(entry);

        while (history.length > MAX_HISTORY_ENTRIES) history.shift();
        while (
            history.length > 1 &&
            Buffer.byteLength(JSON.stringify(history), 'utf8') >
                MAX_HISTORY_BYTES
        ) {
            history.shift();
        }
    }

    /** Look up a session and refresh its last-used timestamp. */
    get(sessionId: string): Session {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new FriendlyException(
                'Session not found or expired. Reconnect to continue.',
                'sessionId',
                ErrorKeys.SESSION_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }
        session.lastUsedAt = Date.now();
        return session;
    }

    has(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }

    /** Disconnect and remove a session. Idempotent. */
    async remove(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        this.sessions.delete(sessionId);
        await session.adapter.disconnect().catch(() => undefined);
    }

    get size(): number {
        return this.sessions.size;
    }

    /** Disconnect and drop sessions idle beyond the TTL. */
    async evictIdle(now: number = Date.now()): Promise<void> {
        const expired = [...this.sessions.values()].filter(
            (s) => now - s.lastUsedAt > IDLE_TTL_MS
        );
        await Promise.all(expired.map((s) => this.remove(s.id)));
    }
}
