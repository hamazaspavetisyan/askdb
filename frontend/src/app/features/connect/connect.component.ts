import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConnectRequestDto, DbType } from '@mongo-mpc/shared';
import { ApiService } from '../../core/api.service';
import { SessionStateService } from '../../core/session-state.service';

/** localStorage key for the remembered connection form. */
const CONNECTION_KEY = 'mongo-mpc.connection';

@Component({
    selector: 'app-connect',
    standalone: true,
    imports: [FormsModule],
    template: `
        <section class="card">
            <h2>Connect to a database</h2>
            <p class="hint">
                Connect with a read-only account where possible — queries are
                read-only, but it's the safest setup.
            </p>

            <form (ngSubmit)="submit()">
                <label>
                    Database type
                    <select [(ngModel)]="form.dbType" name="dbType">
                        <option value="mongodb">MongoDB</option>
                        <option value="mysql" disabled>MySQL (coming soon)</option>
                        <option value="postgres" disabled>
                            PostgreSQL (coming soon)
                        </option>
                    </select>
                </label>

                <label>
                    Host
                    <input
                        [(ngModel)]="form.host"
                        name="host"
                        placeholder="localhost or mongodb+srv://..."
                        required
                    />
                </label>

                <label>
                    Port
                    <input
                        [(ngModel)]="form.port"
                        name="port"
                        type="number"
                        placeholder="27017"
                    />
                </label>

                <div class="row">
                    <label>
                        Username
                        <input
                            [(ngModel)]="form.username"
                            name="username"
                            autocomplete="off"
                        />
                    </label>
                    <label>
                        Password
                        <input
                            [(ngModel)]="form.password"
                            name="password"
                            type="password"
                            autocomplete="off"
                        />
                    </label>
                </div>

                <label>
                    Auth DB <span class="muted">(authSource, optional)</span>
                    <input
                        [(ngModel)]="form.authSource"
                        name="authSource"
                        placeholder="admin"
                        autocomplete="off"
                    />
                </label>

                <label class="check">
                    <input
                        type="checkbox"
                        [(ngModel)]="form.useSsh"
                        name="useSsh"
                    />
                    Connect via SSH tunnel
                </label>

                @if (form.useSsh) {
                    <fieldset class="ssh">
                        <legend>SSH tunnel</legend>
                        <div class="row">
                            <label style="flex:2">
                                SSH host
                                <input
                                    [(ngModel)]="form.ssh.host"
                                    name="sshHost"
                                    placeholder="46.4.13.102"
                                    autocomplete="off"
                                />
                            </label>
                            <label style="flex:1">
                                Port
                                <input
                                    [(ngModel)]="form.ssh.port"
                                    name="sshPort"
                                    type="number"
                                    placeholder="22"
                                />
                            </label>
                        </div>
                        <label>
                            SSH username
                            <input
                                [(ngModel)]="form.ssh.username"
                                name="sshUser"
                                placeholder="sky"
                                autocomplete="off"
                            />
                        </label>
                        <label>
                            Private key (PEM)
                            <span class="muted">— paste the contents of your key file</span>
                            <textarea
                                [(ngModel)]="form.ssh.privateKey"
                                name="sshKey"
                                rows="5"
                                spellcheck="false"
                                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                            ></textarea>
                        </label>
                        <label>
                            Passphrase <span class="muted">(if the key is encrypted)</span>
                            <input
                                [(ngModel)]="form.ssh.passphrase"
                                name="sshPass"
                                type="password"
                                autocomplete="off"
                            />
                        </label>
                    </fieldset>
                }

                @if (error()) {
                    <p class="error">{{ error() }}</p>
                }

                <button
                    type="submit"
                    [disabled]="loading() || !form.host || !sshReady()"
                >
                    {{ loading() ? 'Connecting…' : 'Connect' }}
                </button>
            </form>
        </section>
    `,
    styles: [
        `
            .card {
                max-width: 520px;
                margin: 2rem auto;
                padding: 1.5rem;
                border: 1px solid #e3e3e8;
                border-radius: 12px;
                background: #fff;
            }
            h2 {
                margin: 0 0 0.25rem;
            }
            .hint {
                color: #6b7280;
                font-size: 0.85rem;
                margin: 0 0 1rem;
            }
            form {
                display: flex;
                flex-direction: column;
                gap: 0.85rem;
            }
            label {
                display: flex;
                flex-direction: column;
                gap: 0.3rem;
                font-size: 0.85rem;
                color: #374151;
            }
            .row {
                display: flex;
                gap: 0.85rem;
            }
            .row label {
                flex: 1;
            }
            input,
            select {
                padding: 0.55rem 0.65rem;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                font-size: 0.95rem;
            }
            button {
                margin-top: 0.5rem;
                padding: 0.65rem;
                border: 0;
                border-radius: 8px;
                background: #4f46e5;
                color: #fff;
                font-weight: 600;
                cursor: pointer;
            }
            button:disabled {
                opacity: 0.6;
                cursor: default;
            }
            .error {
                color: #b91c1c;
                font-size: 0.85rem;
                margin: 0;
            }
            .muted {
                color: #9ca3af;
                font-weight: 400;
            }
            .check {
                flex-direction: row;
                align-items: center;
                gap: 0.5rem;
                color: #374151;
                font-size: 0.9rem;
            }
            .check input {
                width: auto;
            }
            fieldset.ssh {
                border: 1px solid #e3e3e8;
                border-radius: 10px;
                padding: 0.75rem 1rem 1rem;
                display: flex;
                flex-direction: column;
                gap: 0.85rem;
                margin: 0;
            }
            fieldset.ssh legend {
                font-size: 0.8rem;
                font-weight: 700;
                color: #4338ca;
                padding: 0 0.4rem;
            }
            textarea {
                padding: 0.55rem 0.65rem;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                font-family: 'SFMono-Regular', ui-monospace, Menlo, monospace;
                font-size: 0.8rem;
                resize: vertical;
            }
        `
    ]
})
export class ConnectComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly session = inject(SessionStateService);
    private readonly router = inject(Router);

    readonly loading = signal(false);
    readonly error = signal<string | null>(null);

    form: {
        dbType: DbType;
        host: string;
        port?: number;
        username?: string;
        password?: string;
        authSource?: string;
        useSsh: boolean;
        ssh: {
            host: string;
            port?: number;
            username: string;
            privateKey: string;
            passphrase?: string;
        };
    } = {
        dbType: 'mongodb',
        host: '',
        useSsh: false,
        ssh: { host: '', username: '', privateKey: '' }
    };

    ngOnInit(): void {
        // Pre-populate the form from the last successful connection.
        try {
            const saved = localStorage.getItem(CONNECTION_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.form = {
                    ...this.form,
                    ...parsed,
                    ssh: { ...this.form.ssh, ...(parsed.ssh ?? {}) }
                };
            }
        } catch {
            /* ignore malformed storage */
        }
    }

    /** SSH fields are complete enough to attempt a connection (or SSH is off). */
    sshReady(): boolean {
        if (!this.form.useSsh) return true;
        const s = this.form.ssh;
        return !!(s.host && s.username && s.privateKey);
    }

    submit(): void {
        if (!this.form.host || this.loading() || !this.sshReady()) return;
        this.loading.set(true);
        this.error.set(null);

        // Remember the inputs so the form is pre-filled next time.
        try {
            localStorage.setItem(CONNECTION_KEY, JSON.stringify(this.form));
        } catch {
            /* storage may be unavailable; non-fatal */
        }

        const body: ConnectRequestDto = {
            dbType: this.form.dbType,
            host: this.form.host.trim(),
            port: this.form.port ? Number(this.form.port) : undefined,
            username: this.form.username || undefined,
            password: this.form.password || undefined,
            authSource: this.form.authSource?.trim() || undefined
        };

        if (this.form.useSsh) {
            const s = this.form.ssh;
            body.ssh = {
                host: s.host.trim(),
                port: s.port ? Number(s.port) : undefined,
                username: s.username.trim(),
                privateKey: s.privateKey,
                passphrase: s.passphrase || undefined
            };
        }

        this.api.connect(body).subscribe({
            next: (res) => {
                this.session.start(res);
                this.loading.set(false);
                void this.router.navigate(['/query']);
            },
            error: (err) => {
                this.loading.set(false);
                this.error.set(extractError(err));
            }
        });
    }
}

/** Pull a human message out of an HttpErrorResponse from the Nest API. */
function extractError(err: unknown): string {
    const e = err as { error?: { message?: unknown }; message?: string };
    const apiMsg = e?.error?.message;
    if (typeof apiMsg === 'string') return apiMsg;
    if (Array.isArray(apiMsg)) return JSON.stringify(apiMsg);
    return e?.message || 'Connection failed.';
}
