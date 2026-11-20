import { Inject, Injectable, Logger } from '@nestjs/common';
import { CacheHttpClient } from '../cache/cache-http.client';
import { IAuthzIdentity, IAuthzSnapshot } from '../contracts/authorization.types';
import { IAuthModuleOptions } from '../contracts/options';
import { AUTH_TOKENS } from '../contracts/ports';

const VERSION_KEY = 'authz:version';
const SNAPSHOT_KEY_PREFIX = 'authz:';

@Injectable()
export class AuthzCacheService {
    private readonly logger = new Logger(AuthzCacheService.name, { timestamp: true });

    constructor(
        private readonly cache: CacheHttpClient,
        @Inject(AUTH_TOKENS.OPTIONS) private readonly options: IAuthModuleOptions,
    ) {}

    async getVersion(): Promise<number> {
        const raw = await this.cache.get(VERSION_KEY, this.options.cache.authzDb);
        const version = raw === null ? 0 : Number(raw);
        return Number.isFinite(version) ? version : 0;
    }

    async getSnapshot(userId: string): Promise<IAuthzSnapshot | null> {
        const raw = await this.cache.get(`${SNAPSHOT_KEY_PREFIX}${userId}`, this.options.cache.authzDb);
        if (!raw) return null;

        try {
            return JSON.parse(raw) as IAuthzSnapshot;
        } catch {
            this.logger.warn(`Invalid authz snapshot for user ${userId}`);
            return null;
        }
    }

    async saveSnapshot(userId: string, identity: IAuthzIdentity, version: number): Promise<void> {
        const snapshot: IAuthzSnapshot = { version, ...identity };
        const ttlSeconds = Math.max(1, Math.ceil(this.options.cache.authzTtlMs / 1000));
        await this.cache.set(
            `${SNAPSHOT_KEY_PREFIX}${userId}`,
            JSON.stringify(snapshot),
            ttlSeconds,
            this.options.cache.authzDb,
        );
    }

    async invalidateUser(userId: string): Promise<void> {
        await this.cache.del(`${SNAPSHOT_KEY_PREFIX}${userId}`, this.options.cache.authzDb);
    }

    async invalidateAll(): Promise<void> {
        const version = await this.cache.incr(VERSION_KEY, this.options.cache.authzDb);
        this.logger.log(`authz version incremented to ${version}`);
    }
}
