import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

export class DtoWithEntityId {
    @ApiProperty({
        example: 'b4f8ecdc-841e-4c10-9f84-3bd51b5ad26f',
        description: 'The UUID of the user'
    })
    @Expose()
    @Transform(({ obj }) => obj.entityId)
    id: string;

    @ApiProperty({
        example: '2024-06-20T12:55:24',
        description: 'Document creation date'
    })
    @Expose()
    created: Date;

    @ApiProperty({
        example: '2024-07-18T06:41:30',
        description: 'Document last update date'
    })
    @Expose()
    updated: Date;
}
