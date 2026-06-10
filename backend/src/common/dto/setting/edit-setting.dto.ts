import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, Validate } from 'class-validator';
import { IsStringOrObject } from '../../utils';

export class EditSettingDto {
    @ApiProperty({
        description: 'New setting value',
        oneOf: [
            { type: 'string', example: 'dark' },
            { type: 'object', example: { mode: 'dark', fontSize: 14 } }
        ]
    })
    @IsDefined()
    @Validate(IsStringOrObject)
    @Type(() => Object)
    value: string | Record<string, any>;
}
