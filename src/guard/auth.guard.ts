import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthzCacheService } from '../authorization/authz-cache.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { AUTH_KEY } from '../contracts/auth-key';
import { IAuthzIdentity } from '../contracts/authorization.types';
import { IAuthIdentity } from '../contracts/identity';
import { IHttpRequest } from '../contracts/http';
import { IAuthGuardHooks, IAuthRouteOptions } from '../contracts/options';
import { AUTH_TOKENS } from '../contracts/ports';
import { TokenVerifierService } from '../token/token-verifier.service';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly verifier: TokenVerifierService,
        private readonly authzCache: AuthzCacheService,
        private readonly authorization: AuthorizationService,
        @Inject(AUTH_TOKENS.HOOKS) private readonly hooks: IAuthGuardHooks,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const options = this.reflector.getAllAndOverride<IAuthRouteOptions>(AUTH_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (options?.isPublic) return true;

        const request = context.switchToHttp().getRequest<IHttpRequest>();
        const claims = await this.verifier.verify(this.verifier.extractBearer(request));

        if (!options?.skipTerms) this.hooks.validateTerms?.(claims);

        const [version, cachedSnapshot] = await Promise.all([
            this.authzCache.getVersion(),
            this.authzCache.getSnapshot(claims.sub),
        ]);

        let identity: IAuthzIdentity;
        if (cachedSnapshot && cachedSnapshot.version === version) {
            identity = cachedSnapshot;
        } else {
            identity = await this.authorization.identityFor(claims.sub);
            await this.authzCache.saveSnapshot(claims.sub, identity, version);
        }

        const baseIdentity: IAuthIdentity = {
            user: {
                id: claims.sub,
                name: claims.name,
                email: claims.email,
                accepted_terms: claims.accepted_terms,
                platform: claims.platform,
            },
            role: identity.role,
            permissions: identity.permissions,
            contexts: identity.contexts,
        };

        const logged = this.hooks.enrich
            ? await this.hooks.enrich(claims, baseIdentity)
            : baseIdentity;

        request.user = logged;

        this.authorization.assertPermissions(logged, options?.permissions);
        await this.hooks.checkPlan?.(options ?? {}, logged);

        return true;
    }
}
