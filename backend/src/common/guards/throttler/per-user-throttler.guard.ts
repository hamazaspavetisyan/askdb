import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class PerUserThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, any>): Promise<string> {
        const userId = req.user?.sub;
        if (userId) {
            return userId;
        }

        return req.ips?.length ? req.ips[0] : req.ip;
    }
}
