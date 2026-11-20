import { InjectionToken, ModuleMetadata, Provider } from '@nestjs/common';
import { IAccessClaims } from './claims';
import { IAuthIdentity } from './identity';

export interface IAuthRouteOptions {
    isPublic?: boolean;
    skipTerms?: boolean;
    permissions?: string[];
    plan?: {
        context: string;
        resource: string;
    };
}

export interface IAuthGuardHooks {
    validateTerms?(claims: IAccessClaims): void;
    enrich?(
        claims: IAccessClaims,
        identity: IAuthIdentity,
    ): IAuthIdentity | Promise<IAuthIdentity>;
    checkPlan?(
        options: IAuthRouteOptions,
        identity: IAuthIdentity,
    ): void | Promise<void>;
}

export interface IAuthCacheOptions {
    baseUrl: string;
    tokenDb: number;
    authzDb: number;
    authzTtlMs: number;
    defaultPlatform?: string;
}

export interface IAuthModuleOptions {
    jwt: {
        accessSecret: string;
        refreshSecret?: string;
    };
    cache: IAuthCacheOptions;
    roles?: {
        adminSlug?: string;
        userSlug?: string;
    };
    ownership?: {
        userIdFields?: string[];
    };
    catalog?: {
        failOnEmpty?: boolean;
    };
    hooks?: IAuthGuardHooks;
}

export interface IAuthModuleAsyncOptions {
    imports?: ModuleMetadata['imports'];
    inject?: InjectionToken[];
    ports?: Provider[];
    useFactory: (...dependencies: unknown[]) => IAuthModuleOptions | Promise<IAuthModuleOptions>;
}
