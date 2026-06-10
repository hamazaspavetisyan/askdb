import { IoAdapter } from '@nestjs/platform-socket.io';
import { Injectable } from '@nestjs/common';
import { ServerOptions } from 'socket.io';

@Injectable()
export class CustomSocketIoAdapter extends IoAdapter {
    constructor(
        private readonly websocketListeningPort: number,
        private readonly path: string
    ) {
        super();
    }

    createIOServer(port: number, options?: ServerOptions): any {
        return super.createIOServer(this.websocketListeningPort | port, {
            ...options,
            path: this.path
        });
    }
}
