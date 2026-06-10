import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../dto/pagination';

/**
 * Sets up Swagger documentation for a NestJS application.
 *
 * @param app - The NestJS application instance.
 * @param title - The title of the API documentation.
 * @param description - A brief description of the API.
 * @param version - The version of the API. Format is open.
 */
export function setupSwagger(
    app: INestApplication,
    title: string,
    description: string,
    version: string
) {
    // Configuring Swagger using DocumentBuilder
    const config = new DocumentBuilder()
        .setTitle(title) // Setting the title of the API documentation
        .setDescription(description) // Setting the description of the API
        .setVersion(version) // Setting the version of the API
        .addBearerAuth() // Adding Bearer authentication scheme
        .build();

    // Creating the Swagger document
    const document = SwaggerModule.createDocument(app, config);

    // Setting up the Swagger module at the '/docs' endpoint
    SwaggerModule.setup('docs', app, document);
}

export const ApiPaginatedResponse = <TModel extends Type<any>>(
    model: TModel
) => {
    return applyDecorators(
        ApiExtraModels(PaginatedResponseDto, model),
        ApiOkResponse({
            schema: {
                allOf: [
                    { $ref: getSchemaPath(PaginatedResponseDto) },
                    {
                        properties: {
                            items: {
                                type: 'array',
                                items: { $ref: getSchemaPath(model) }
                            },
                            total: {
                                type: 'number',
                                example: 100
                            }
                        }
                    }
                ]
            }
        })
    );
};
