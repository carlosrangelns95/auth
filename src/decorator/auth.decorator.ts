import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guard/auth.guard';
import { AUTH_KEY } from '../contracts/auth-key';
import { IAuthRouteOptions } from '../contracts/options';

export function Auth(options: IAuthRouteOptions = {}): MethodDecorator & ClassDecorator {
    return applyDecorators(SetMetadata(AUTH_KEY, options), UseGuards(AuthGuard));
}
