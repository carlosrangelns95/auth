import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CacheHttpClient } from '../cache/cache-http.client';
import { IAccessClaims, TTokenType } from '../contracts/claims';
import { AUTH_ERRORS } from '../contracts/errors';
import { IAuthIdentity } from '../contracts/identity';
import { IHttpRequest } from '../contracts/http';
import { IAuthModuleOptions } from '../contracts/options';
import { AUTH_TOKENS } from '../contracts/ports';
import { AuthorizationService } from '../authorization/authorization.service';

@Injectable()
export class TokenVerifierService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly cache: CacheHttpClient,
        private readonly authorization: AuthorizationService,
        @Inject(AUTH_TOKENS.OPTIONS) private readonly options: IAuthModuleOptions,
    ) {}

    extractBearer(request: IHttpRequest): string {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        if (type !== 'Bearer' || !token) {
            throw new HttpException(AUTH_ERRORS.MISSING_TOKEN, HttpStatus.UNAUTHORIZED);
        }
        return token;
    }

    async verify(token: string, type: TTokenType = 'access'): Promise<IAccessClaims> {
        const secret = type === 'access'
            ? this.options.jwt.accessSecret
            : this.options.jwt.refreshSecret;

        if (!secret) {
            throw new HttpException('REFRESH_SECRET_NOT_CONFIGURED', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        let claims: IAccessClaims;
        try {
            claims = this.jwtService.verify<IAccessClaims>(token, { secret });
        } catch {
            throw new HttpException(AUTH_ERRORS.INVALID_TOKEN, HttpStatus.UNAUTHORIZED);
        }

        const cached = await this.cache.getToken(type, claims.sub, claims.platform);
        if (!cached) {
            throw new HttpException(AUTH_ERRORS.TOKEN_NOT_FOUND, HttpStatus.UNAUTHORIZED);
        }
        if (cached !== token) {
            throw new HttpException(AUTH_ERRORS.TOKEN_MISMATCH, HttpStatus.UNAUTHORIZED);
        }

        return claims;
    }

    validatePermissions(identity: IAuthIdentity | undefined, required: string[]): void {
        if (!identity?.user?.id) {
            throw new HttpException(
                { message: 'Não autenticado', code: 'PERMISSION_DENIED' },
                HttpStatus.FORBIDDEN,
            );
        }
        this.authorization.assertPermissions(identity, required);
    }
}

export { TokenVerifierService as AuthCoreService };
