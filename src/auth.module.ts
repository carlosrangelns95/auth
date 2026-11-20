import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { AuthzCacheService } from './authorization/authz-cache.service';
import { AuthorizationService } from './authorization/authorization.service';
import { ResourceCatalogService } from './authorization/resource-catalog.service';
import { CacheHttpClient } from './cache/cache-http.client';
import { IAuthModuleAsyncOptions, IAuthModuleOptions } from './contracts/options';
import { AUTH_TOKENS } from './contracts/ports';
import { AuthGuard } from './guard/auth.guard';
import { TokenVerifierService } from './token/token-verifier.service';

const AUTH_CONFIG = 'AUTH_MODULE_CONFIG';

interface IResolvedAuthConfig {
    options: IAuthModuleOptions;
    ports: Provider[];
}

const coreProviders: Provider[] = [
    CacheHttpClient,
    TokenVerifierService,
    AuthzCacheService,
    ResourceCatalogService,
    AuthorizationService,
    AuthGuard,
];

function buildProviders(config: Provider, ports: Provider[]): Provider[] {
    return [
        config,
        {
            provide: AUTH_TOKENS.OPTIONS,
            useFactory: (resolved: IResolvedAuthConfig): IAuthModuleOptions => resolved.options,
            inject: [AUTH_CONFIG],
        },
        {
            provide: AUTH_TOKENS.HOOKS,
            useFactory: (resolved: IResolvedAuthConfig) => resolved.options.hooks ?? {},
            inject: [AUTH_CONFIG],
        },
        ...ports,
        ...coreProviders,
    ];
}

@Global()
@Module({})
export class AuthModule {
    static forRoot(options: IAuthModuleOptions, ports: Provider[] = []): DynamicModule {
        const config: Provider = {
            provide: AUTH_CONFIG,
            useValue: { options, ports } satisfies IResolvedAuthConfig,
        };

        return {
            module: AuthModule,
            global: true,
            providers: buildProviders(config, ports),
            exports: [AUTH_TOKENS.OPTIONS, AUTH_TOKENS.HOOKS, ...coreProviders],
        };
    }

    static forRootAsync(options: IAuthModuleAsyncOptions): DynamicModule {
        const config: Provider = {
            provide: AUTH_CONFIG,
            useFactory: async (...dependencies: unknown[]): Promise<IResolvedAuthConfig> => ({
                options: await options.useFactory(...dependencies),
                ports: [],
            }),
            inject: options.inject ?? [],
        };

        const ports = options.ports ?? [];

        return {
            module: AuthModule,
            global: true,
            imports: options.imports ?? [],
            providers: buildProviders(config, ports),
            exports: [AUTH_TOKENS.OPTIONS, AUTH_TOKENS.HOOKS, ...coreProviders],
        };
    }
}
