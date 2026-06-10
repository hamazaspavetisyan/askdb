import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ListCollectionsRequestDto, QueryRequestDto } from '@mongo-mpc/shared';

export class QueryDto implements QueryRequestDto {
    @IsString()
    @IsNotEmpty()
    sessionId: string;

    @IsString()
    @IsNotEmpty()
    database: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    naturalLanguage: string;
}

export class ListCollectionsQueryDto implements ListCollectionsRequestDto {
    @IsString()
    @IsNotEmpty()
    sessionId: string;

    @IsString()
    @IsNotEmpty()
    database: string;
}
