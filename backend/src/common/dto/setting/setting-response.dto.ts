import { ApiProperty } from '@nestjs/swagger';
import { DtoWithEntityId } from '../dto-with-entity-id';
import { Expose } from 'class-transformer';

export class SettingResponseDto extends DtoWithEntityId {
    @ApiProperty({ example: 'theme' })
    @Expose()
    name: string;

    @ApiProperty({ example: 'dark' })
    @Expose()
    value: string | Record<string, any>;

    @ApiProperty({ example: '2025-01-01T00:00:00Z' })
    @Expose()
    updated: Date;
}
