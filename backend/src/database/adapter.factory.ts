import { HttpStatus, Injectable } from '@nestjs/common';
import { ConnectRequestDto } from '@mongo-mpc/shared';
import { FriendlyException, ErrorKeys } from '../common/errors';
import { DatabaseAdapter } from './database-adapter.interface';
import { MongoAdapter } from './adapters/mongo.adapter';

/**
 * Maps a connection request to a concrete {@link DatabaseAdapter}.
 * Adding a new database means adding one case here and one adapter class —
 * nothing above this layer changes.
 */
@Injectable()
export class AdapterFactory {
    create(params: ConnectRequestDto): DatabaseAdapter {
        switch (params.dbType) {
            case 'mongodb':
                return new MongoAdapter(params);
            // case 'mysql':    return new MysqlAdapter(params);   // future
            // case 'postgres': return new PostgresAdapter(params); // future
            default:
                throw new FriendlyException(
                    `Unsupported database type: ${String(params.dbType)}`,
                    'dbType',
                    ErrorKeys.UNSUPPORTED_DB_TYPE,
                    HttpStatus.BAD_REQUEST
                );
        }
    }
}
