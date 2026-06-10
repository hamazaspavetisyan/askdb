import {
    ForbiddenException,
    HttpException,
    HttpStatus,
    UnauthorizedException
} from '@nestjs/common';
import { ErrorKeys } from './error-keys';

export class FriendlyException extends HttpException {
    constructor(
        message: string,
        field: string,
        errorMessage: ErrorKeys,
        status: HttpStatus = HttpStatus.BAD_REQUEST
    ) {
        super(
            {
                message,
                data: [
                    {
                        field,
                        errors: [errorMessage]
                    }
                ],
                statusCode: status
            },
            status
        );
    }
}

export class FriendlyForbiddenException extends ForbiddenException {
    constructor(message: string, permission: string) {
        super({
            message,
            permission
        });
    }
}

export class FriendlyUnauthorizedException extends UnauthorizedException {
    constructor(message: string, type: ErrorKeys) {
        super({ message, type });
    }
}
