import {
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
    ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConnectRequestDto, DbType, SshConfig } from '@mongo-mpc/shared';

const DB_TYPES: DbType[] = ['mongodb', 'mysql', 'postgres'];

/** Validated SSH tunnel config (optional). */
export class SshConfigDto implements SshConfig {
    @IsString()
    @IsNotEmpty()
    host: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(65535)
    port?: number;

    @IsString()
    @IsNotEmpty()
    username: string;

    @IsString()
    @IsNotEmpty()
    privateKey: string;

    @IsOptional()
    @IsString()
    passphrase?: string;
}

/**
 * Validated request body for POST /connection.
 * Implements the shared contract so backend and frontend stay in lockstep.
 */
export class ConnectDto implements ConnectRequestDto {
    @IsIn(DB_TYPES)
    dbType: DbType;

    @IsString()
    host: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(65535)
    port?: number;

    @IsOptional()
    @IsString()
    username?: string;

    @IsOptional()
    @IsString()
    password?: string;

    @IsOptional()
    @IsString()
    database?: string;

    @IsOptional()
    @IsString()
    authSource?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => SshConfigDto)
    ssh?: SshConfigDto;
}
