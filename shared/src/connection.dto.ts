export type DbType = 'mongodb' | 'mysql' | 'postgres';

/**
 * Optional SSH tunnel. When present, the backend opens an SSH connection and
 * forwards a local port to the database host/port, then connects through it.
 * The database `host`/`port` are interpreted relative to the SSH server.
 */
export interface SshConfig {
  host: string;
  port?: number; // default 22
  username: string;
  /** Private key as PEM text (the contents of the key file). */
  privateKey: string;
  /** Passphrase, if the key is encrypted. */
  passphrase?: string;
}

export interface ConnectRequestDto {
  dbType: DbType;
  host: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  /** Authentication database (e.g. "admin"); maps to MongoDB authSource. */
  authSource?: string;
  /** Optional SSH tunnel; omit for a direct connection (unchanged behavior). */
  ssh?: SshConfig;
}

export interface ConnectResponseDto {
  sessionId: string;
  dbType: DbType;
  databases: string[];
}
