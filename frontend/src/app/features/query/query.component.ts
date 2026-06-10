import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { QueryResponseDto } from '@mongo-mpc/shared';
import { ApiService } from '../../core/api.service';
import { SessionStateService } from '../../core/session-state.service';

type Row = Record<string, unknown>;

/** localStorage key for the last-selected database. */
const DATABASE_KEY = 'mongo-mpc.database';

@Component({
    selector: 'app-query',
    standalone: true,
    imports: [FormsModule],
    template: `
        <section class="wrap">
            <header class="bar">
                <div class="db">
                    <span class="badge">{{ session.dbType() }}</span>
                    <select
                        [(ngModel)]="database"
                        name="database"
                        (ngModelChange)="onDatabaseChange($event)"
                    >
                        @for (db of session.databases(); track db) {
                            <option [value]="db">{{ db }}</option>
                        }
                    </select>
                </div>
                <button class="ghost" (click)="disconnect()">Disconnect</button>
            </header>

            <div class="ask">
                <textarea
                    [(ngModel)]="question"
                    rows="2"
                    placeholder="Ask in plain English — e.g. get me the user named Samuel"
                    (keydown.meta.enter)="run()"
                    (keydown.control.enter)="run()"
                ></textarea>
                <button (click)="run()" [disabled]="loading() || !question.trim()">
                    {{ loading() ? 'Thinking…' : 'Run' }}
                </button>
            </div>

            @if (error()) {
                <p class="error">{{ error() }}</p>
            }

            @if (response(); as res) {
                <div class="meta">
                    @if (res.explanation) {
                        <p class="explain">{{ res.explanation }}</p>
                    }
                    <details>
                        <summary>
                            Generated query
                            <span class="pill">{{ res.executionTimeMs }} ms</span>
                            <span class="pill">{{ res.result.length }} rows</span>
                        </summary>
                        <pre>{{ res.generatedQuery }}</pre>
                    </details>
                </div>

                @if (res.result.length) {
                    <div class="toolbar">
                        <span class="count">
                            {{ displayColumns().length }} of
                            {{ allColumns().length }} fields
                        </span>
                        @if (allColumns().length > compactColumns().length) {
                            <button
                                class="link"
                                type="button"
                                (click)="showAll.set(!showAll())"
                            >
                                {{ showAll() ? 'Show key fields' : 'Show all fields' }}
                            </button>
                        }
                    </div>
                    <div class="results" [class.split]="selected() !== null">
                        <div
                            class="table-card"
                            [class.wide]="showAll()"
                            [style.--cols]="displayColumns().length"
                        >
                          <div class="table-scroll">
                            <div class="thead">
                                @for (col of displayColumns(); track col) {
                                    <div class="th">{{ col }}</div>
                                }
                            </div>
                            <div class="tbody">
                                @for (row of res.result; track $index) {
                                    <button
                                        type="button"
                                        class="tr"
                                        [class.active]="selected() === $index"
                                        (click)="select($index, row)"
                                    >
                                        @for (col of displayColumns(); track col) {
                                            <div class="td" [title]="cell(row, col)">
                                                {{ cell(row, col) || '—' }}
                                            </div>
                                        }
                                    </button>
                                }
                            </div>
                          </div>
                        </div>

                        @if (selectedRow(); as row) {
                            <aside class="detail">
                                <div class="detail-head">
                                    <strong>Document</strong>
                                    <button
                                        class="x"
                                        (click)="clearSelection()"
                                        aria-label="Close"
                                    >
                                        ✕
                                    </button>
                                </div>
                                <dl>
                                    @for (entry of entries(row); track entry[0]) {
                                        <dt>{{ entry[0] }}</dt>
                                        <dd>{{ format(entry[1]) }}</dd>
                                    }
                                </dl>
                            </aside>
                        }
                    </div>
                } @else {
                    <p class="empty">No rows matched.</p>
                }
            }
        </section>
    `,
    styles: [
        `
            .wrap {
                max-width: 1100px;
                margin: 1.5rem auto;
                padding: 0 1rem;
            }
            .bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
            }
            .db {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            .badge {
                text-transform: uppercase;
                font-size: 0.7rem;
                letter-spacing: 0.04em;
                font-weight: 700;
                color: #4338ca;
                background: #eef2ff;
                padding: 0.25rem 0.5rem;
                border-radius: 999px;
            }
            select,
            textarea {
                padding: 0.5rem 0.6rem;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                font: inherit;
                background: #fff;
            }
            .ask {
                display: flex;
                gap: 0.6rem;
                align-items: stretch;
            }
            .ask textarea {
                flex: 1;
                resize: vertical;
            }
            button {
                border: 0;
                border-radius: 8px;
                background: #4f46e5;
                color: #fff;
                font-weight: 600;
                padding: 0 1.1rem;
                cursor: pointer;
            }
            button:disabled {
                opacity: 0.6;
                cursor: default;
            }
            .ghost {
                background: transparent;
                color: #4f46e5;
                border: 1px solid #c7d2fe;
                padding: 0.45rem 0.9rem;
            }
            .meta {
                margin: 1.25rem 0 0.75rem;
            }
            summary {
                cursor: pointer;
                font-weight: 600;
                color: #374151;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            .pill {
                font-weight: 500;
                font-size: 0.72rem;
                color: #4338ca;
                background: #eef2ff;
                padding: 0.1rem 0.5rem;
                border-radius: 999px;
            }
            pre {
                background: #0f172a;
                color: #e2e8f0;
                padding: 0.75rem;
                border-radius: 8px;
                overflow: auto;
                font-size: 0.8rem;
                margin-top: 0.6rem;
            }
            .explain {
                color: #374151;
                margin: 0.6rem 0 0;
            }

            .results {
                display: grid;
                grid-template-columns: 1fr;
                gap: 1rem;
                margin-top: 0.5rem;
            }
            .results.split {
                grid-template-columns: 1.6fr 1fr;
            }
            @media (max-width: 760px) {
                .results.split {
                    grid-template-columns: 1fr;
                }
            }

            .toolbar {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                margin: 0.25rem 0 0.5rem;
            }
            .toolbar .count {
                font-size: 0.78rem;
                color: #6b7280;
            }
            .link {
                background: transparent;
                color: #4f46e5;
                border: 0;
                padding: 0;
                font-size: 0.8rem;
                font-weight: 600;
                cursor: pointer;
                text-decoration: underline;
            }
            .table-card {
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                overflow: hidden;
                background: #fff;
                align-self: start;
            }
            .table-scroll {
                max-height: 480px;
                overflow: auto;
            }
            .thead,
            .tr {
                display: grid;
                grid-template-columns: repeat(var(--cols, 1), minmax(0, 1fr));
            }
            /* When showing every field, give columns a min width so the
               table scrolls horizontally instead of squashing. */
            .table-card.wide .thead,
            .table-card.wide .tr {
                grid-template-columns: repeat(
                    var(--cols, 1),
                    minmax(150px, 1fr)
                );
            }
            .thead {
                background: #f8fafc;
                border-bottom: 1px solid #e5e7eb;
                position: sticky;
                top: 0;
                z-index: 1;
            }
            .th {
                padding: 0.6rem 0.8rem;
                font-size: 0.72rem;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                color: #6b7280;
                font-weight: 700;
                white-space: nowrap;
            }
            .tr {
                width: 100%;
                background: #fff;
                border: 0;
                border-bottom: 1px solid #f1f5f9;
                border-radius: 0;
                color: #111827;
                font-weight: 400;
                cursor: pointer;
                text-align: left;
                padding: 0;
            }
            .tr:hover {
                background: #f9fafb;
            }
            .tr.active {
                background: #eef2ff;
            }
            .td {
                padding: 0.55rem 0.8rem;
                font-size: 0.84rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-variant-numeric: tabular-nums;
            }

            .detail {
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                background: #fff;
                align-self: start;
                position: sticky;
                top: 1rem;
                max-height: 80vh;
                overflow: auto;
            }
            .detail-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.75rem 1rem;
                border-bottom: 1px solid #f1f5f9;
            }
            .x {
                background: transparent;
                color: #6b7280;
                padding: 0.2rem 0.5rem;
            }
            dl {
                margin: 0;
                padding: 0.5rem 1rem 1rem;
            }
            dt {
                font-size: 0.7rem;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                color: #6b7280;
                margin-top: 0.7rem;
                font-weight: 700;
            }
            dd {
                margin: 0.15rem 0 0;
                font-size: 0.86rem;
                color: #111827;
                word-break: break-word;
                white-space: pre-wrap;
                font-family: 'SFMono-Regular', ui-monospace, Menlo, monospace;
            }
            .error {
                color: #b91c1c;
            }
            .empty {
                color: #6b7280;
            }
        `
    ]
})
export class QueryComponent implements OnInit {
    private readonly api = inject(ApiService);
    readonly session = inject(SessionStateService);
    private readonly router = inject(Router);

    database = '';
    question = '';
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);
    readonly response = signal<QueryResponseDto | null>(null);
    readonly selected = signal<number | null>(null);
    readonly selectedRow = signal<Row | null>(null);
    readonly showAll = signal(false);

    /** Every field present across the returned rows. */
    readonly allColumns = computed<string[]>(() => {
        const res = this.response();
        if (!res || !res.result.length) return [];
        return Array.from(new Set(res.result.flatMap((r) => Object.keys(r))));
    });

    /**
     * Compact column set: the id field, a created/createdAt field, then the
     * next three fields (in document order) that aren't already shown.
     */
    readonly compactColumns = computed<string[]>(() => {
        const keys = this.allColumns();
        if (!keys.length) return [];
        const idKey = keys.find((k) => /^_?id$/i.test(k));
        const createdKey = keys.find((k) => /^created(_?at)?$/i.test(k));
        const used = new Set([idKey, createdKey].filter(Boolean) as string[]);
        const extras = keys.filter((k) => !used.has(k)).slice(0, 3);
        return [
            ...(idKey ? [idKey] : []),
            ...(createdKey ? [createdKey] : []),
            ...extras
        ];
    });

    /** Columns actually rendered: all fields when "Show all" is on, else compact. */
    readonly displayColumns = computed<string[]>(() =>
        this.showAll() ? this.allColumns() : this.compactColumns()
    );

    ngOnInit(): void {
        if (!this.session.isConnected()) {
            void this.router.navigate(['/']);
            return;
        }
        const dbs = this.session.databases();
        const saved = safeGet(DATABASE_KEY);
        this.database = saved && dbs.includes(saved) ? saved : (dbs[0] ?? '');
    }

    onDatabaseChange(db: string): void {
        safeSet(DATABASE_KEY, db);
        this.clearSelection();
        this.response.set(null);
    }

    run(): void {
        const naturalLanguage = this.question.trim();
        const sessionId = this.session.sessionId();
        if (!naturalLanguage || !sessionId || this.loading()) return;

        this.loading.set(true);
        this.error.set(null);
        this.clearSelection();

        this.api
            .query({ sessionId, database: this.database, naturalLanguage })
            .subscribe({
                next: (res) => {
                    this.response.set(res);
                    this.loading.set(false);
                },
                error: (err) => {
                    this.loading.set(false);
                    this.error.set(extractError(err));
                }
            });
    }

    select(index: number, row: Row): void {
        if (this.selected() === index) {
            this.clearSelection();
            return;
        }
        this.selected.set(index);
        this.selectedRow.set(row);
    }

    clearSelection(): void {
        this.selected.set(null);
        this.selectedRow.set(null);
    }

    disconnect(): void {
        const sessionId = this.session.sessionId();
        if (sessionId) this.api.disconnect(sessionId).subscribe();
        this.session.clear();
        void this.router.navigate(['/']);
    }

    entries(row: Row): [string, unknown][] {
        return Object.entries(row);
    }

    /** Compact, single-line value for a table cell. */
    cell(row: Row, col: string): string {
        return this.format(row[col]).replace(/\s+/g, ' ').slice(0, 120);
    }

    /** Full value rendering for the detail panel. */
    format(v: unknown): string {
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v, null, 2);
        return String(v);
    }
}

function extractError(err: unknown): string {
    const e = err as { error?: { message?: unknown }; message?: string };
    const apiMsg = e?.error?.message;
    if (typeof apiMsg === 'string') return apiMsg;
    if (Array.isArray(apiMsg)) return JSON.stringify(apiMsg);
    return e?.message || 'Query failed.';
}

function safeGet(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSet(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* storage may be unavailable; non-fatal */
    }
}
