export interface IAuthRole {
    id: string;
    slug: string;
    name: string;
    resources?: string[];
    permissions?: string[];
}

export interface IAuthUser {
    id: string;
    name: string;
    email: string;
    accepted_terms?: boolean;
    platform?: string;
}

export interface IAuthIdentity {
    user: IAuthUser;
    role: IAuthRole | null;
    permissions: string[];
    contexts: string[];
}

export interface ILogger {
    log(context: string, message: string): void;
    error(context: string, message: string): void;
    warn(context: string, message: string): void;
    debug(context: string, message: string): void;
}

export interface IResourceRecord {
    key: string;
    context?: string;
    ownership?: string;
    default_on_register?: boolean;
}

export interface IOwnershipRecord {
    user_id?: string | null;
    created_by?: string | null;
    company_id?: string | null;
    [field: string]: string | null | undefined;
}
