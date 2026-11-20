import { HttpException, HttpStatus } from '@nestjs/common';
import { IAuthIdentity, IResourceRecord } from '../contracts/identity';
import { createTestOptions, createTestPorts } from '../testing/ports';
import { AuthorizationService } from './authorization.service';
import { ResourceCatalogService } from './resource-catalog.service';

const resources: IResourceRecord[] = [
    { key: 'personal_record:view', context: 'personal', ownership: 'owner_only' },
    { key: 'driver_record:view', context: 'driver', ownership: 'company_admin' },
];

const identity: IAuthIdentity = {
    user: { id: 'user-1', name: 'User', email: 'user@example.com' },
    role: { id: 'role-1', slug: 'user', name: 'User', resources: [] },
    permissions: ['personal_record:view'],
    contexts: ['personal'],
};

interface IServiceOptions {
    roleSlug?: string;
    permissions?: string[];
    userIdFields?: string[];
    resources?: IResourceRecord[];
}

async function createService(options: IServiceOptions = {}) {
    const data = createTestPorts({
        resources: options.resources ?? resources,
        role: options.roleSlug
            ? { id: 'role-1', slug: options.roleSlug, name: 'Role' }
            : null,
        permissions: options.permissions ?? ['personal_record:view'],
        memberships: [{ company_id: 'company-1', role: 'admin' }],
    });

    const catalog = new ResourceCatalogService(
        data.resources,
        createTestOptions({ catalog: { failOnEmpty: false } }),
    );
    await catalog.onModuleInit();

    const service = new AuthorizationService(
        data.users,
        data.userResources,
        data.memberships,
        catalog,
        createTestOptions({
            roles: { adminSlug: 'admin', userSlug: 'user' },
            ownership: { userIdFields: options.userIdFields ?? ['user_id'] },
        }),
    );

    return { service, catalog, data };
}

function captureError(action: () => void): HttpException {
    let thrown: unknown;
    try {
        action();
    } catch (error: unknown) {
        thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    return thrown as HttpException;
}

describe('AuthorizationService', () => {
    it('gives every catalog key to admins', async () => {
        const { service } = await createService({ roleSlug: 'admin' });

        const result = await service.identityFor('user-1');

        expect(result.permissions).toEqual(['personal_record:view', 'driver_record:view']);
        expect(result.role_slug).toBe('admin');
    });

    it('resolves contexts from the granted permissions', async () => {
        const { service } = await createService({ roleSlug: 'user' });

        const result = await service.identityFor('user-1');

        expect(result.contexts).toEqual(['personal']);
        expect(result.role?.resources).toEqual(['personal_record:view']);
    });

    it('rejects unknown permissions with 500', async () => {
        const { service } = await createService();

        const error = captureError(() => service.assertPermissions(identity, ['unknown:action']));

        expect(error.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('rejects missing permissions with PERMISSION_DENIED', async () => {
        const { service } = await createService();

        const error = captureError(() => service.assertPermissions(identity, ['driver_record:view']));

        expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
        expect(error.getResponse()).toMatchObject({ code: 'PERMISSION_DENIED' });
    });

    it('accepts created_by as owner when configured', async () => {
        const { service } = await createService({ userIdFields: ['user_id', 'created_by'] });

        await expect(
            service.assertOwnership({ created_by: 'user-1' }, identity, 'personal_record:view'),
        ).resolves.toBeUndefined();
    });

    it('rejects ownership when the configured field does not match', async () => {
        const { service } = await createService({ userIdFields: ['user_id', 'created_by'] });

        await expect(
            service.assertOwnership({ created_by: 'another-user' }, identity, 'personal_record:view'),
        ).rejects.toBeInstanceOf(HttpException);
    });

    it('accepts a company admin for company_admin rules', async () => {
        const { service } = await createService();

        await expect(
            service.assertOwnership({ company_id: 'company-1' }, identity, 'driver_record:view'),
        ).resolves.toBeUndefined();
    });
});

describe('ResourceCatalogService', () => {
    it('fails on empty catalog when configured', async () => {
        const ports = createTestPorts();
        const catalog = new ResourceCatalogService(
            ports.resources,
            createTestOptions({ catalog: { failOnEmpty: true } }),
        );

        await expect(catalog.onModuleInit()).rejects.toThrow('Resource catalog is empty');
    });
});
