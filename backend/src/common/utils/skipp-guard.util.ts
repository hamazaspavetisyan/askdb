import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_GUARD_KEY } from '../decorators';

export function shouldSkipGuard(
    context: ExecutionContext,
    reflector: Reflector,
    guardKey: string
): boolean {
    const skipGuards =
        reflector.get<string[]>(SKIP_GUARD_KEY, context.getHandler()) || [];
    return skipGuards.includes(guardKey);
}
