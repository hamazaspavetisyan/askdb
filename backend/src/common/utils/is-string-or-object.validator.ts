import {
    registerDecorator,
    ValidationOptions,
    ValidationArguments
} from 'class-validator';
import { Validator } from './validator';

export function IsStringOrObject(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: 'IsStringOrObject',
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value: any) {
                    return (
                        Validator.isValidString(value) ||
                        Validator.isValidObject(value)
                    );
                },
                defaultMessage(args: ValidationArguments) {
                    return `'${args.property}' must be a non-empty string or an object`;
                }
            }
        });
    };
}
