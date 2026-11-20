import { HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthorizationService } from '../authorization/authorization.service';
import { CacheHttpClient } from '../cache/cache-http.client';
import { IAccessClaims } from '../contracts/claims';
import { AUTH_ERRORS } from '../contracts/errors';
import { createTestOptions } from '../testing/ports';
import { TokenVerifierService } from './token-verifier.service';

const claims: IAccessClaims = {
    sub: 'user-1',
    email: 'user@example.com',
    name: 'User',
    accepted_terms: true,
    platform: 'web',
};

function createService(overrides: {
    token?: string;
    cached?: string | null;
    options?: Partial<ReturnType<typeof createTestOptions>>;
} = {}) {
    const token = overrides.token ?? 'signed-token';
    const verify = jest.fn(() => claims);
    const getToken = jest.fn(async () => ('cached' in overrides ? overrides.cached : token));

    const service = new TokenVerifierService(
        { verify } as unknown as JwtService,
        { getToken } as unknown as CacheHttpClient,
        { assertPermissions: jest.fn() } as unknown as AuthorizationService,
        createTestOptions(overrides.options),
    );

    return { service, verify, getToken };
}

describe('TokenVerifierService', () => {
    it('extracts the bearer token', () => {
        const { service } = createService();

        expect(service.extractBearer({ headers: { authorization: 'Bearer abc' } })).toBe('abc');
    });

    it('rejects a request without bearer token', () => {
        const { service } = createService();

        expect(() => service.extractBearer({ headers: {} })).toThrow(HttpException);
    });

    it('returns claims when signature and whitelist match', async () => {
        const { service } = createService();

        await expect(service.verify('signed-token')).resolves.toEqual(claims);
    });

    it('rejects an invalid signature', async () => {
        const verify = jest.fn(() => {
            throw new Error('invalid signature');
        });
        const service = new TokenVerifierService(
            { verify } as unknown as JwtService,
            { getToken: jest.fn() } as unknown as CacheHttpClient,
            { assertPermissions: jest.fn() } as unknown as AuthorizationService,
            createTestOptions(),
        );

        await expect(service.verify('bad')).rejects.toMatchObject({
            message: AUTH_ERRORS.INVALID_TOKEN,
            status: HttpStatus.UNAUTHORIZED,
        });
    });

    it('rejects a token that is not in the whitelist', async () => {
        const { service } = createService({ cached: null });

        await expect(service.verify('signed-token')).rejects.toMatchObject({
            message: AUTH_ERRORS.TOKEN_NOT_FOUND,
        });
    });

    it('rejects a token that differs from the cached one', async () => {
        const { service } = createService({ cached: 'other-token' });

        await expect(service.verify('signed-token')).rejects.toMatchObject({
            message: AUTH_ERRORS.TOKEN_MISMATCH,
        });
    });

    it('uses the refresh secret for refresh tokens', async () => {
        const verify = jest.fn(() => claims);
        const service = new TokenVerifierService(
            { verify } as unknown as JwtService,
            { getToken: jest.fn(async () => 'refresh-token') } as unknown as CacheHttpClient,
            { assertPermissions: jest.fn() } as unknown as AuthorizationService,
            createTestOptions(),
        );

        await service.verify('refresh-token', 'refresh');

        expect(verify).toHaveBeenCalledWith('refresh-token', { secret: 'refresh-secret' });
    });
});
