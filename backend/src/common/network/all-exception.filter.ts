import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    BadRequestException,
    Inject
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ErrorResponse } from './error-response';
import { LoggerService } from '../logger';
import { FriendlyException, FriendlyUnauthorizedException } from '../errors';
import { Validator } from '../utils/validator';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    constructor(
        private readonly httpAdapterHost: HttpAdapterHost,
        @Inject() private readonly logger: LoggerService
    ) {}

    catch(exception: unknown, host: ArgumentsHost): void {
        // Resolve `httpAdapter` here to ensure it's available
        const { httpAdapter } = this.httpAdapterHost;

        // Switch context to HTTP to get request/response objects
        const ctx = host.switchToHttp();
        let message: string;
        let data: any;

        // Check if the exception is an instance of Error to extract the message
        if (exception instanceof Error) {
            message = exception.message;
        } else if (typeof exception === 'string') {
            message = exception;
        }

        this.logger.error(message);

        // Determine the HTTP status code
        let httpStatus =
            exception instanceof HttpException
                ? exception.getStatus() // If it's an HttpException, use its status
                : HttpStatus.INTERNAL_SERVER_ERROR; // Otherwise, default to 500 Internal Server Error

        // If the exception has additional data, extract it
        if (exception['data']) {
            data = exception['data'];
        }

        // Specifically, handle BadRequestException to get detailed error information
        if (exception instanceof BadRequestException) {
            const deepErrorInfo = exception.getResponse(); // Get the full error response
            data = deepErrorInfo['message']; // Extract the detailed message
        }

        if (exception instanceof FriendlyException) {
            const errorInfo = exception.getResponse();
            httpStatus = errorInfo['statusCode'];
            data = errorInfo['data']; // Extract the data
        }

        if (exception instanceof FriendlyUnauthorizedException) {
            const errorInfo = exception.getResponse();
            data = errorInfo['type']; // Extract the data
        }

        // Create a structured error response
        const responseBody = new ErrorResponse(message, httpStatus, data);

        const req = ctx.getRequest<Request>();
        if (req['rawBody']) {
            try {
                const raw = JSON.parse(req['rawBody']);
                if (Validator.isValidObject(raw)) {
                    for (const field of Object.keys(raw)) {
                        if (field.includes('password')) {
                            raw[field] = '********';
                        } else if (field.includes('secret')) {
                            raw[field] = '********';
                        } else if (field.includes('token')) {
                            raw[field] = '********';
                        } else if (field.includes('private')) {
                            raw[field] = '********';
                        } else if (field.includes('refreshToken')) {
                            raw[field] = '********';
                        }
                    }
                }

                this.logger.error(
                    `Request body at exception: ${JSON.stringify(raw, null, 2)}`
                );
            } catch {
                this.logger.error(
                    `Request raw body at exception (non-JSON) for app ${req.headers['x-app-version']}: ${req['rawBody']}`
                );
            }
        }

        // Send the response using the HTTP adapter
        httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
    }
}
