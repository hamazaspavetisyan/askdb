import { MiddlewareConsumer, Module } from '@nestjs/common';

import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { hours, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from './common/logger';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AllExceptionsFilter, HttpLoggerMiddleware } from './common/network';
import { ScheduleModule } from '@nestjs/schedule';
import { defaultThrottleLimit, numberOfHours } from './common/constants';
import { ThrottlerBehindProxyGuard } from './common/guards/throttler/throttler-behind-proxy.guard';
import { ConnectionModule } from './modules/connection/connection.module';
import { QueryModule } from './modules/query/query.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true
        }),
        ThrottlerModule.forRoot({
            throttlers: [
                {
                    name: 'default',
                    limit: defaultThrottleLimit,
                    ttl: hours(numberOfHours)
                }
            ]
        }),
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        LoggerModule,
        ConnectionModule,
        QueryModule
    ],
    controllers: [],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerBehindProxyGuard
        },
        {
            provide: APP_FILTER,
            useClass: AllExceptionsFilter
        }
    ]
})
export class AppModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(HttpLoggerMiddleware).forRoutes('/');
    }
}
