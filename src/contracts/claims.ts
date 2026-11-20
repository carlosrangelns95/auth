export type TTokenType = 'access' | 'refresh';

export interface IAccessClaims {
    sub: string;
    email: string;
    name: string;
    accepted_terms?: boolean;
    platform?: string;
    type?: string;
}
