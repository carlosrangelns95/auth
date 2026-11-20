import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IAuthModuleOptions } from '../contracts/options';
import { AUTH_PORTS, AUTH_TOKENS, IResourceRepositoryPort } from '../contracts/ports';
import { IResourceRecord } from '../contracts/identity';

@Injectable()
export class ResourceCatalogService implements OnModuleInit {
    private readonly logger = new Logger(ResourceCatalogService.name, { timestamp: true });
    private catalog = new Map<string, IResourceRecord>();

    constructor(
        @Inject(AUTH_PORTS.RESOURCE_REPOSITORY)
        private readonly repository: IResourceRepositoryPort,
        @Inject(AUTH_TOKENS.OPTIONS) private readonly options: IAuthModuleOptions,
    ) {}

    async onModuleInit(): Promise<void> {
        const records = await this.repository.findAll();
        this.catalog = new Map(records.map((record) => [record.key, record]));

        if (this.options.catalog?.failOnEmpty && this.catalog.size === 0) {
            throw new Error('Resource catalog is empty');
        }

        this.logger.log(`Resource catalog loaded with ${this.catalog.size} entries`);
    }

    async reload(): Promise<void> {
        await this.onModuleInit();
    }

    has(key: string): boolean {
        return this.catalog.has(key);
    }

    get(key: string): IResourceRecord | undefined {
        return this.catalog.get(key);
    }

    all(): IResourceRecord[] {
        return Array.from(this.catalog.values());
    }

    keys(): string[] {
        return Array.from(this.catalog.keys());
    }

    contextFor(key: string): string | undefined {
        return this.catalog.get(key)?.context;
    }

    ownershipFor(key: string): string | undefined {
        return this.catalog.get(key)?.ownership;
    }
}
