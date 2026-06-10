import { readFileSync } from 'node:fs';
import { ConnectRequestDto, DbType, SshConfig } from '@mongo-mpc/shared';

export interface McpServerConfig {
    port: number;
    /** When set, clients must send `Authorization: Bearer <token>`. */
    authToken?: string;
}

function num(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

type Env = Record<string, string | undefined>;

/**
 * Build the target database connection from environment variables. The MCP
 * process serves one connection; credentials live in the client's MCP config,
 * never in the chat.
 */
export function parseConnectionFromEnv(
    env: Env = process.env
): ConnectRequestDto {
    const dbType = (env.DB_TYPE || 'mongodb') as DbType;
    const host = env.DB_HOST;
    if (!host) {
        throw new Error('DB_HOST is required to start the MCP server.');
    }

    const conn: ConnectRequestDto = {
        dbType,
        host,
        port: num(env.DB_PORT),
        username: env.DB_USER || undefined,
        password: env.DB_PASS || undefined,
        database: env.DB_DATABASE || undefined,
        authSource: env.DB_AUTH_SOURCE || undefined
    };

    const ssh = parseSshFromEnv(env);
    if (ssh) conn.ssh = ssh;
    return conn;
}

function parseSshFromEnv(env: Env): SshConfig | undefined {
    if (!env.SSH_HOST) return undefined;
    if (!env.SSH_USER) {
        throw new Error('SSH_USER is required when SSH_HOST is set.');
    }

    // Accept the key inline (SSH_PRIVATE_KEY) or as a file path
    // (SSH_PRIVATE_KEY_PATH) — handy for server deployments.
    let privateKey = env.SSH_PRIVATE_KEY;
    if (!privateKey && env.SSH_PRIVATE_KEY_PATH) {
        privateKey = readFileSync(env.SSH_PRIVATE_KEY_PATH, 'utf8');
    }
    if (!privateKey) {
        throw new Error(
            'Provide SSH_PRIVATE_KEY or SSH_PRIVATE_KEY_PATH when SSH_HOST is set.'
        );
    }

    return {
        host: env.SSH_HOST,
        port: num(env.SSH_PORT),
        username: env.SSH_USER,
        privateKey,
        passphrase: env.SSH_PASSPHRASE || undefined
    };
}

export function parseServerConfig(env: Env = process.env): McpServerConfig {
    return {
        port: num(env.MCP_PORT) ?? 3001,
        authToken: env.MCP_AUTH_TOKEN || undefined
    };
}
