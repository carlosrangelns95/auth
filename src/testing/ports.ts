import {
    IMembershipRecord,
    IMembershipRepositoryPort,
    IResourceRepositoryPort,
    IUserRepositoryPort,
    IUserResourceRepositoryPort,
} from '../contracts/ports';
import { IAuthRole, IResourceRecord } from '../contracts/identity';
import { IAuthModuleOptions } from '../contracts/options';

export interface ITestAuthData {
    resources?: IResourceRecord[];
    role?: IAuthRole | null;
    permissions?: string[];
    memberships?: IMembershipRecord[];
    version?: number;
    snapshot?: string | null;
}

export interface ITestPorts {
    resources: IResourceRepositoryPort;
    users: IUserRepositoryPort;
    userResources: IUserResourceRepositoryPort;
    memberships: IMembershipRepositoryPort;
}

export function createTestPorts(data: ITestAuthData = {}): ITestPorts {
    const memberships = data.memberships ?? [];

    return {
        resources: {
            findAll: async () => data.resources ?? [],
        },
        users: {
            findWithRole: async () => ({ role: data.role ?? null }),
        },
        userResources: {
            findPermissionKeys: async () => data.permissions ?? [],
        },
        memberships: {
            findMembership: async (_userId, companyId) =>
                memberships.find((membership) => membership.company_id === companyId) ?? null,
            findMemberships: async () => memberships,
        },
    };
}

export function createTestOptions(overrides: Partial<IAuthModuleOptions> = {}): IAuthModuleOptions {
    return {
        jwt: overrides.jwt ?? { accessSecret: 'access-secret', refreshSecret: 'refresh-secret' },
        cache: overrides.cache ?? {
            baseUrl: 'http://cache-service:3002',
            tokenDb: 0,
            authzDb: 2,
            authzTtlMs: 3_600_000,
        },
        ...overrides,
    };
}
