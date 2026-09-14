import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

const HEX_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valide un UUID RFC 412 OU la forme hex 8-4-4-4-12 (UUID version nulle).
 * Les seeds de démo utilisent de faux UUIDs (version 0, ex: 00000000-…-0004)
 * alors que gen_random_uuid() en prod produit de vrais v4. Ce validateur
 * accepte donc la forme hex standard, sans exiger la version/variant bits.
 */
export function IsFlexibleUuid(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFlexibleUuid',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && HEX_UUID_REGEX.test(value);
        },
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be a valid UUID (format hex 8-4-4-4-12)`,
      },
    });
  };
}