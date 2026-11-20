import { IAuthRole } from './identity';

export interface IAuthzSnapshot {
    version: number;
    role_slug: string | null;
    role: IAuthRole | null;
    permissions: string[];
    contexts: string[];
}

export type IAuthzIdentity = Omit<IAuthzSnapshot, 'version'>;
