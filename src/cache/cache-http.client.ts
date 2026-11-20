import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { TTokenType } from '../contracts/claims';
import { AUTH_ERRORS } from '../contracts/errors';
import { IAuthModuleOptions } from '../contracts/options';
import { AUTH_TOKENS } from '../contracts/ports';

@Injectable()
export class CacheHttpClient {
    private readonly logger = new Logger(CacheHttpClient.name, { timestamp: true });

    constructor(
        @Inject(AUTH_TOKENS.OPTIONS) private readonly options: IAuthModuleOptions,
    ) {}

    async getStatus(): Promise<boolean> {
        try {
            const response = await fetch(`${this.options.cache.baseUrl}/health`);
            return response.ok;
        } catch (error: unknown) {
            this.logger.error(`cache-service health check failed: ${this.errorMessage(error)}`);
            return false;
        }
    }

    async getToken(type: TTokenType, userId: string, platform?: string): Promise<string | null> {
        return this.get(this.buildTokenKey(type, userId, platform), this.options.cache.tokenDb);
    }

    async setToken(
        token: string,
        userId: string,
        ttlMs: number,
        platform?: string,
        type: TTokenType = 'access',
    ): Promise<void> {
        await this.set(
            this.buildTokenKey(type, userId, platform),
            token,
            this.ttlSeconds(ttlMs),
            this.options.cache.tokenDb,
        );
    }

    async deleteToken(
        userId: string,
        platform?: string,
        type: TTokenType = 'access',
    ): Promise<void> {
        await this.del(this.buildTokenKey(type, userId, platform), this.options.cache.tokenDb);
    }

    async get(key: string, db: number): Promise<string | null> {
        const response = await fetch(
            `${this.options.cache.baseUrl}/cache/${encodeURIComponent(key)}?db=${db}`,
        );
        if (response.status === 404) return null;
        if (!response.ok) this.throwUnavailable(`get ${key}`);
        const data = (await response.json()) as { value: string };
        return data.value;
    }

    async set(key: string, value: string, ttlSeconds: number, db: number): Promise<void> {
        const response = await fetch(
            `${this.options.cache.baseUrl}/cache/${encodeURIComponent(key)}?db=${db}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value, ttl: ttlSeconds }),
            },
        );
        if (!response.ok) this.throwUnavailable(`set ${key}`);
    }

    async del(key: string, db: number): Promise<void> {
        const response = await fetch(
            `${this.options.cache.baseUrl}/cache/${encodeURIComponent(key)}?db=${db}`,
            { method: 'DELETE' },
        );
        if (!response.ok) this.throwUnavailable(`delete ${key}`);
    }

    async incr(key: string, db: number, ttlSeconds?: number): Promise<number> {
        const response = await fetch(
            `${this.options.cache.baseUrl}/cache/${encodeURIComponent(key)}/incr?db=${db}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ttl: ttlSeconds }),
            },
        );
        if (!response.ok) this.throwUnavailable(`incr ${key}`);
        const data = (await response.json()) as { value: number };
        return data.value;
    }

    private buildTokenKey(type: TTokenType, userId: string, platform?: string): string {
        const rawPlatform = platform ?? this.options.cache.defaultPlatform ?? '';
        const normalizedPlatform = rawPlatform.replace(/[^a-z0-9_-]/gi, '');
        return `${type}_token:${userId}:${normalizedPlatform}`;
    }

    private ttlSeconds(ttlMs: number): number {
        return Math.max(1, Math.ceil(ttlMs / 1000));
    }

    private throwUnavailable(operation: string): never {
        this.logger.error(`cache-service failed to ${operation}`);
        throw new HttpException(AUTH_ERRORS.CACHE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
