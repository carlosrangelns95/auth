import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthzCacheService } from '../authorization/authz-cache.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { IAccessClaims } from '../contracts/claims';
import { IAuthIdentity } from '../contracts/identity';
import { IAuthGuardHooks, IAuthRouteOptions } from '../contracts/options';
import { IHttpRequest } from '../contracts/http';
import { TokenVerifierService } from '../token/token-verifier.service';
import { AuthGuard } from './auth.guard';

const claims: IAccessClaims = {
    sub: 'user-1',
    email: 'user@example.com',
    name: 'User',
    accepted_terms: true,
    platform: 'web',
};

const identity = {
    role_slug: 'user',
    role: { id: 'role-1', slug: 'user', name: 'User', resources: ['record:view'] },
    permissions: ['record:view'],
    contexts: ['personal'],
};

interface ISetupOptions {
    routeOptions?: IAuthRouteOptions;
    snapshotVersion?: number;
    currentVersion?: number;
    hooks?: IAuthGuardHooks;
}

function createGuard(options: ISetupOptions = {}) {
    const request: IHttpRequest = { headers: { authorization: 'Bearer token' } };
    const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const reflector = {
        getAllAndOverride: jest.fn(() => options.routeOptions ?? {}),
    } as unknown as Reflector;

    const verifier = {
        extractBearer: jest.fn(() => 'token'),
        verify: jest.fn(async () => claims),
    } as unknown as TokenVerifierService;

    const authzCache = {
        getVersion: jest.fn(async () => options.currentVersion ?? 1),
        getSnapshot: jest.fn(async () =>
            options.snapshotVersion === undefined
                ? null
                : { version: options.snapshotVersion, ...identity },
        ),
        saveSnapshot: jest.fn(async () => undefined),
    } as unknown as AuthzCacheService;

    const authorization = {
        identityFor: jest.fn(async () => identity),
        assertPermissions: jest.fn(),
    } as unknown as AuthorizationService;

    const hooks: IAuthGuardHooks = options.hooks ?? {};
    const guard = new AuthGuard(reflector, verifier, authzCache, authorization, hooks);

    return { guard, context, request, verifier, authzCache, authorization };
}

describe('AuthGuard', () => {
    it('skips public routes', async () => {
        const { guard, context, verifier } = createGuard({ routeOptions: { isPublic: true } });

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(verifier.verify).not.toHaveBeenCalled();
    });

    it('reuses a valid authz snapshot and attaches the identity', async () => {
        const { guard, context, request, authorization, authzCache } = createGuard({
            snapshotVersion: 1,
            currentVersion: 1,
        });

        await expect(guard.canActivate(context)).resolves.toBe(true);

        expect(authorization.identityFor).not.toHaveBeenCalled();
        expect(authzCache.saveSnapshot).not.toHaveBeenCalled();
        expect(request.user?.permissions).toEqual(['record:view']);
    });

    it('rebuilds the snapshot when its version is stale', async () => {
        const { guard, context, authzCache, authorization } = createGuard({
            snapshotVersion: 0,
            currentVersion: 1,
        });

        await guard.canActivate(context);

        expect(authorization.identityFor).toHaveBeenCalledWith('user-1');
        expect(authzCache.saveSnapshot).toHaveBeenCalledWith('user-1', identity, 1);
    });

    it('runs validateTerms, enrich and checkPlan in order', async () => {
        const calls: string[] = [];
        const { guard, context, request } = createGuard({
            hooks: {
                validateTerms: () => calls.push('terms'),
                enrich: (claimsInput, base) => {
                    calls.push('enrich');
                    expect(claimsInput.sub).toBe('user-1');
                    return {
                        ...base,
                        user: { ...base.user, accepted_terms: true },
                    } as IAuthIdentity;
                },
                checkPlan: () => {
                    calls.push('plan');
                },
            },
        });

        await guard.canActivate(context);

        expect(calls).toEqual(['terms', 'enrich', 'plan']);
        expect(request.user).toBeDefined();
    });

    it('propagates permission denials', async () => {
        const { guard, context, authorization } = createGuard({
            routeOptions: { permissions: ['record:delete'] },
        });
        (authorization.assertPermissions as jest.Mock).mockImplementation(() => {
            throw new HttpException('PERMISSION_DENIED', 403);
        });

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);
    });
});
