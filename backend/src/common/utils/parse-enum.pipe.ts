import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

function getEnumValues<T extends Record<string, string | number>>(
    enumType: T
): (string | number)[] {
    return Object.values(enumType).filter(
        (value) => typeof value === 'string' || typeof value === 'number'
    );
}

@Injectable()
export class DynamicEnumValidationPipe implements PipeTransform {
    private readonly allowedValues: (string | number)[];

    constructor(enumType: Record<string, string | number>) {
        this.allowedValues = getEnumValues(enumType);
    }

    transform(value: any) {
        if (value === undefined || value === null) {
            throw new BadRequestException(
                'validation error: value is required'
            );
        }

        const isValueValid = this.allowedValues.includes(value);

        if (!isValueValid) {
            throw new BadRequestException(
                `invalid value '${value}', allowed values are: ${this.allowedValues.join(', ')}`
            );
        }

        return value;
    }
}

// This factory function allows you to use the pipe with a specific enum in your controllers
export function ParseEnumPipe<T extends Record<string, string | number>>(
    enumType: T
) {
    return new DynamicEnumValidationPipe(enumType);
}
