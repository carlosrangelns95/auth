import { IAuthIdentity } from './identity';

export interface IHttpRequest {
    headers: {
        authorization?: string;
    };
    user?: IAuthIdentity;
}
