import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface
} from 'class-validator';

@ValidatorConstraint({ name: 'isNotBlank', async: false })
export class IsNotBlankConstraint implements ValidatorConstraintInterface {
    validate(value: any) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    defaultMessage(args: ValidationArguments) {
        return `${args.property} should not be empty or contain only spaces`;
    }
}

export function IsNotBlank(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            constraints: [],
            validator: IsNotBlankConstraint
        });
    };
}
