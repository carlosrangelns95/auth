import { IAuthRole, IResourceRecord } from './identity';

export const AUTH_TOKENS = {
    OPTIONS: Symbol('AUTH_OPTIONS'),
    HOOKS: Symbol('AUTH_HOOKS'),
} as const;

export const AUTH_PORTS = {
    RESOURCE_REPOSITORY: Symbol('AUTH_RESOURCE_REPOSITORY'),
    USER_REPOSITORY: Symbol('AUTH_USER_REPOSITORY'),
    USER_RESOURCE_REPOSITORY: Symbol('AUTH_USER_RESOURCE_REPOSITORY'),
    MEMBERSHIP_REPOSITORY: Symbol('AUTH_MEMBERSHIP_REPOSITORY'),
} as const;

export interface IResourceRepositoryPort {
    findAll(): Promise<IResourceRecord[]>;
}

export interface IUserRoleRecord {
    role: IAuthRole | null;
}

export interface IUserRepositoryPort {
    findWithRole(userId: string): Promise<IUserRoleRecord | null>;
}

export interface IUserResourceRepositoryPort {
    findPermissionKeys(userId: string): Promise<string[]>;
}

export interface IMembershipRecord {
    company_id: string;
    role: string;
}

export interface IMembershipRepositoryPort {
    findMembership(userId: string, companyId: string): Promise<IMembershipRecord | null>;
    findMemberships(userId: string): Promise<IMembershipRecord[]>;
}
