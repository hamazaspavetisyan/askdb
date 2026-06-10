import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    ListCollectionsResponseDto,
    QueryResponseDto
} from '@mongo-mpc/shared';
import { QueryService } from './query.service';
import { ListCollectionsQueryDto, QueryDto } from './dto/query.dto';

@ApiTags('query')
@Controller('query')
export class QueryController {
    constructor(private readonly queryService: QueryService) {}

    @Post()
    @ApiOperation({ summary: 'Run a natural-language query' })
    query(@Body() body: QueryDto): Promise<QueryResponseDto> {
        return this.queryService.query(body);
    }

    @Get('collections')
    @ApiOperation({ summary: 'List collections/tables for a database' })
    listCollections(
        @Query() query: ListCollectionsQueryDto
    ): Promise<ListCollectionsResponseDto> {
        return this.queryService.listCollections(query);
    }
}
