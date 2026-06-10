import { SetMetadata } from '@nestjs/common';

export const SKIP_GUARD_KEY = 'skipGuard';

export const SkipGuard = (...guardsToSkip: string[]) =>
    SetMetadata(SKIP_GUARD_KEY, guardsToSkip);
