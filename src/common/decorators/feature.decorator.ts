import { SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const FEATURE_KEY = 'required_feature';

/**
 * Marque l'endpoint comme exigeant une feature RBAC.
 * Ajoute aussi l'extension OpenAPI `x-feature` (utilisée par le
 * générateur Postman pour ranger les routes par profil).
 */
export const RequireFeature =
  (feature: string): MethodDecorator =>
  (
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    SetMetadata(FEATURE_KEY, feature)(target, propertyKey, descriptor);
    try {
      ApiExtension('x-feature', feature)(target, propertyKey, descriptor);
    } catch {
      // ignore — l'extension Swagger n'est pas critique
    }
    return descriptor;
  };
