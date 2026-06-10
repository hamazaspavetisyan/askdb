import {
    Body,
    Controller,
    Delete,
    HttpCode,
    HttpStatus,
    Param,
    Post
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConnectResponseDto } from '@mongo-mpc/shared';
import { ConnectionService } from './connection.service';
import { ConnectDto } from './dto/connect.dto';

@ApiTags('connection')
@Controller('connection')
export class ConnectionController {
    constructor(private readonly connectionService: ConnectionService) {}

    @Post()
    @ApiOperation({
        summary: 'Open a database connection and start a session'
    })
    connect(@Body() body: ConnectDto): Promise<ConnectResponseDto> {
        return this.connectionService.connect(body);
    }

    @Delete(':sessionId')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Close a session and disconnect' })
    async disconnect(@Param('sessionId') sessionId: string): Promise<void> {
        await this.connectionService.disconnect(sessionId);
    }
}
