import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DEFAULT_ROLE_SLUGS, OWNERSHIP_RULES } from '../contracts/authorization.constants';
import { IAuthzIdentity } from '../contracts/authorization.types';
import { IAuthIdentity, IAuthRole, IOwnershipRecord } from '../contracts/identity';
import { IAuthModuleOptions } from '../contracts/options';
import {
    AUTH_TOKENS,
    AUTH_PORTS,
    IMembershipRecord,
    IMembershipRepositoryPort,
    IUserRepositoryPort,
    IUserResourceRepositoryPort,
} from '../contracts/ports';
import { ResourceCatalogService } from './resource-catalog.service';

@Injectable()
export class AuthorizationService {
    private readonly adminSlug: string;
    private readonly userSlug: string;
    private readonly ownerFields: string[];

    constructor(
        @Inject(AUTH_PORTS.USER_REPOSITORY)
        private readonly userRepository: IUserRepositoryPort,
        @Inject(AUTH_PORTS.USER_RESOURCE_REPOSITORY)
        private readonly userResourceRepository: IUserResourceRepositoryPort,
        @Inject(AUTH_PORTS.MEMBERSHIP_REPOSITORY)
        private readonly membershipRepository: IMembershipRepositoryPort,
        private readonly resourceCatalog: ResourceCatalogService,
        @Inject(AUTH_TOKENS.OPTIONS) options: IAuthModuleOptions,
    ) {
        this.adminSlug = options.roles?.adminSlug ?? DEFAULT_ROLE_SLUGS.ADMIN;
        this.userSlug = options.roles?.userSlug ?? DEFAULT_ROLE_SLUGS.USER;
        this.ownerFields = options.ownership?.userIdFields ?? ['user_id'];
    }

    async getRole(userId: string): Promise<IAuthRole | null> {
        const user = await this.userRepository.findWithRole(userId);
        return user?.role ?? null;
    }

    async isAdmin(userId: string): Promise<boolean> {
        const role = await this.getRole(userId);
        return role?.slug === this.adminSlug;
    }

    async permissionsFor(userId: string): Promise<string[]> {
        const role = await this.getRole(userId);
        if (role?.slug === this.adminSlug) return this.resourceCatalog.keys();
        return this.userResourceRepository.findPermissionKeys(userId);
    }

    async contextsFor(userId: string): Promise<string[]> {
        const permissions = await this.permissionsFor(userId);
        return Array.from(
            new Set(
                permissions
                    .map((key) => this.resourceCatalog.contextFor(key))
                    .filter((context): context is string => !!context),
            ),
        );
    }

    async identityFor(userId: string): Promise<IAuthzIdentity> {
        const role = await this.getRole(userId);
        const isAdmin = role?.slug === this.adminSlug;
        const permissions = isAdmin
            ? this.resourceCatalog.keys()
            : await this.userResourceRepository.findPermissionKeys(userId);
        const contexts = Array.from(
            new Set(
                permissions
                    .map((key) => this.resourceCatalog.contextFor(key))
                    .filter((context): context is string => !!context),
            ),
        );

        return {
            role_slug: role?.slug ?? this.userSlug,
            role: role ? { ...role, resources: permissions } : null,
            permissions,
            contexts,
        };
    }

    async can(userId: string, permission: string): Promise<boolean> {
        const permissions = await this.permissionsFor(userId);
        return permissions.includes(permission);
    }

    assertPermissions(identity: IAuthIdentity, required: string[] = []): void {
        for (const permission of required) {
            if (!this.resourceCatalog.has(permission)) {
                throw new HttpException(
                    `Unknown permission: ${permission}`,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                );
            }
            if (!identity.permissions.includes(permission)) {
                this.throwDenied(permission);
            }
        }
    }

    async assertOwnership(
        record: IOwnershipRecord,
        identity: IAuthIdentity,
        permission: string,
    ): Promise<void> {
        const ownership = this.resourceCatalog.ownershipFor(permission);

        if (!ownership) return;
        if (ownership === OWNERSHIP_RULES.ADMIN_ONLY) return;
        if (ownership === OWNERSHIP_RULES.ANY_AUTHENTICATED) return;
        if (identity.role?.slug === this.adminSlug) return;

        const isOwner = this.ownerFields
            .map((field) => record[field])
            .some((value) => !!value && value === identity.user.id);

        if (ownership === OWNERSHIP_RULES.OWNER_ONLY) {
            if (!isOwner) this.throwDenied(permission);
            return;
        }

        const isCompanyRule =
            ownership === OWNERSHIP_RULES.COMPANY_MEMBER ||
            ownership === OWNERSHIP_RULES.COMPANY_ADMIN;

        if (isCompanyRule) {
            if (isOwner) return;
            const membership = record.company_id
                ? await this.getCompanyMembership(identity.user.id, record.company_id)
                : null;

            if (ownership === OWNERSHIP_RULES.COMPANY_MEMBER && membership) return;

            if (
                ownership === OWNERSHIP_RULES.COMPANY_ADMIN &&
                membership &&
                (membership.role === 'owner' || membership.role === 'admin')
            ) {
                return;
            }
        }

        this.throwDenied(permission);
    }

    async getCompanyMembership(
        userId: string,
        companyId: string,
    ): Promise<IMembershipRecord | null> {
        return this.membershipRepository.findMembership(userId, companyId);
    }

    async isCompanyMember(userId: string, companyId: string): Promise<boolean> {
        return !!(await this.getCompanyMembership(userId, companyId));
    }

    async isCompanyAdmin(userId: string, companyId: string): Promise<boolean> {
        const membership = await this.getCompanyMembership(userId, companyId);
        return !!membership && (membership.role === 'owner' || membership.role === 'admin');
    }

    async companiesFor(userId: string): Promise<string[]> {
        const memberships = await this.membershipRepository.findMemberships(userId);
        return memberships.map((membership) => membership.company_id);
    }

    private throwDenied(permission: string): never {
        throw new HttpException(
            {
                message: `Sem permissão para "${permission}"`,
                code: 'PERMISSION_DENIED',
                resource: permission,
            },
            HttpStatus.FORBIDDEN,
        );
    }
}
