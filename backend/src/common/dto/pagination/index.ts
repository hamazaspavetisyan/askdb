import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResponseDto<T> {
    @ApiProperty({
        description: 'Array of items of a generic type',
        type: 'array',
        isArray: true
    })
    items: T[];

    @ApiProperty({
        example: 100,
        description: 'Total number of items available'
    })
    total: number;

    constructor(items: T[], total: number) {
        this.items = items;
        this.total = total;
    }
}

export class PaginatedStartBasedResponseDto<T> {
    @ApiProperty({
        description: 'Array of items of a generic type',
        type: 'array',
        isArray: true
    })
    items: T[];

    @ApiProperty({
        example: true,
        description: 'Shows if there are more items available'
    })
    hasMore: boolean;

    constructor(items: T[], hasMore: boolean) {
        this.items = items;
        this.hasMore = hasMore;
    }
}
