export const DEFAULT_ROLE_SLUGS = {
    USER: 'user',
    ADMIN: 'admin',
} as const;

export const OWNERSHIP_RULES = {
    OWNER_ONLY: 'owner_only',
    ADMIN_ONLY: 'admin_only',
    ANY_AUTHENTICATED: 'any_authenticated',
    COMPANY_MEMBER: 'company_member',
    COMPANY_ADMIN: 'company_admin',
} as const;

export type TOwnershipRule = (typeof OWNERSHIP_RULES)[keyof typeof OWNERSHIP_RULES];
