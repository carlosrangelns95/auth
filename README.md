# @carlosrangelns95/auth

Núcleo de autenticação e autorização reutilizável para serviços NestJS. Extraído de `auth-service` e `back-end-service` do sistema financeiro, sem vínculo com nenhum domínio específico (sem `financial`, `house`, `driver`, etc.).

> **Status:** Fase 1 da refatoração. O pacote está extraído, compilado e testado, mas os serviços originais **ainda não foram migrados** — continuam usando suas cópias locais. Nenhum arquivo dos serviços foi removido ou alterado nesta etapa.

## O que o pacote contém

- `AuthGuard` e o decorator `@Auth({ isPublic, skipTerms, permissions, plan })`
- `TokenVerifierService` (também exportado como `AuthCoreService`): assinatura JWT + whitelist no cache-service
- `CacheHttpClient`: cliente HTTP do cache-service (o serviço Redis continua separado)
- `AuthorizationService`: role, permissões, contextos e regras de ownership
- `AuthzCacheService`: snapshot `authz:{userId}` com read-through e invalidação por `authz:version`
- `ResourceCatalogService`: catálogo de resources carregado via port
- Contratos, constantes, erros e mocks de teste (`src/testing`)

**Fora do pacote** (continua nos serviços): entities, DTOs, emissão de tokens, aceite de termos, planos/contextos de negócio e limite de plano. As diferenças entre os serviços viram `ports` e `hooks`.

## Instalação

O pacote é publicado no GitHub Packages. Cada consumidor precisa apontar o scope para o registry:

```ini
# .npmrc
@carlosrangelns95:registry=https://npm.pkg.github.com
```

```bash
npm login --scope=@carlosrangelns95 --registry=https://npm.pkg.github.com
npm install @carlosrangelns95/auth
```

Peer dependencies: `@nestjs/common`, `@nestjs/core`, `@nestjs/jwt`, `reflect-metadata` e `rxjs`.

## Uso

### Configuração síncrona

```ts
import { HttpException, HttpStatus, Module } from '@nestjs/common';
import { AUTH_PORTS, AuthModule } from '@carlosrangelns95/auth';
import { ResourceRepository } from './repositories/resource.repository';
import { UserRepository } from './repositories/user.repository';
import { UserResourceRepository } from './repositories/user-resource.repository';
import { MembershipRepository } from './repositories/membership.repository';

@Module({
    imports: [
        AuthModule.forRoot(
            {
                jwt: { accessSecret: process.env.JWT_ACCESS_SECRET ?? '' },
                cache: {
                    baseUrl: process.env.CACHE_SERVICE_URL ?? 'http://localhost:3002',
                    tokenDb: 0,
                    authzDb: 2,
                    authzTtlMs: 3_600_000,
                },
                roles: { adminSlug: 'admin', userSlug: 'user' },
                ownership: { userIdFields: ['user_id', 'created_by'] },
                catalog: { failOnEmpty: true },
                hooks: {
                    validateTerms: (claims) => {
                        if (!claims.accepted_terms) {
                            throw new HttpException('Terms acceptance required', HttpStatus.FORBIDDEN);
                        }
                    },
                },
            },
            [
                { provide: AUTH_PORTS.RESOURCE_REPOSITORY, useClass: ResourceRepository },
                { provide: AUTH_PORTS.USER_REPOSITORY, useClass: UserRepository },
                { provide: AUTH_PORTS.USER_RESOURCE_REPOSITORY, useClass: UserResourceRepository },
                { provide: AUTH_PORTS.MEMBERSHIP_REPOSITORY, useClass: MembershipRepository },
            ],
        ),
    ],
})
export class AppModule {}
```

### Configuração assíncrona (hooks com dependências do serviço)

```ts
AuthModule.forRootAsync({
    imports: [PlanModule, UserContextModule],
    inject: [PlanService, UserContextService, ConfigService],
    ports: [
        { provide: AUTH_PORTS.RESOURCE_REPOSITORY, useClass: ResourceRepository },
        { provide: AUTH_PORTS.USER_REPOSITORY, useClass: UserRepository },
        { provide: AUTH_PORTS.USER_RESOURCE_REPOSITORY, useClass: UserResourceRepository },
        { provide: AUTH_PORTS.MEMBERSHIP_REPOSITORY, useClass: MembershipRepository },
    ],
    useFactory: (
        plan: PlanService,
        userContexts: UserContextService,
        config: ConfigService,
    ) => ({
        jwt: { accessSecret: config.getOrThrow<string>('JWT_ACCESS_SECRET') },
        cache: {
            baseUrl: config.getOrThrow<string>('CACHE_SERVICE_URL'),
            tokenDb: 0,
            authzDb: 2,
            authzTtlMs: 3_600_000,
        },
        hooks: {
            enrich: async (claims, identity) => ({
                ...identity,
                contexts: await userContexts.findForUser(claims.sub),
            }),
            checkPlan: async (options, identity) => {
                if (options.plan) {
                    await plan.assertLimit(identity, options.plan);
                }
            },
        },
    }),
});
```

### Protegendo rotas

```ts
@Controller('records')
export class RecordsController {
    @Get()
    @Auth({ permissions: ['record:view'] })
    findAll(): Promise<IRecord[]> {
        return this.service.findAll();
    }

    @Post()
    @Auth({ permissions: ['record:create'], plan: { context: 'personal', resource: 'record' } })
    create(@Body() dto: CreateRecordDto): Promise<IRecord> {
        return this.service.create(dto);
    }
}
```

Opções do `@Auth`:

| Opção | Efeito |
|---|---|
| `isPublic` | Libera a rota sem token |
| `skipTerms` | Não executa `hooks.validateTerms` |
| `permissions` | Exige todas as chaves `resource:action` |
| `plan` | Encaminha `{ context, resource }` para `hooks.checkPlan` |

## Ports

O pacote não conhece as entities do serviço. Cada repositório é registrado com o token correspondente:

| Token | Interface | Métodos |
|---|---|---|
| `AUTH_PORTS.RESOURCE_REPOSITORY` | `IResourceRepositoryPort` | `findAll(): Promise<IResourceRecord[]>` |
| `AUTH_PORTS.USER_REPOSITORY` | `IUserRepositoryPort` | `findWithRole(userId): Promise<IUserRoleRecord \| null>` |
| `AUTH_PORTS.USER_RESOURCE_REPOSITORY` | `IUserResourceRepositoryPort` | `findPermissionKeys(userId): Promise<string[]>` |
| `AUTH_PORTS.MEMBERSHIP_REPOSITORY` | `IMembershipRepositoryPort` | `findMembership(userId, companyId)`, `findMemberships(userId)` |

`IResourceRecord` = `{ key, context?, ownership?, default_on_register? }`. `IUserRoleRecord` = `{ role }`.

## Hooks

| Hook | Quando roda | Uso típico |
|---|---|---|
| `validateTerms(claims)` | Após verificar o JWT | Exigir aceite dos termos (auth-service) |
| `enrich(claims, identity)` | Após resolver o snapshot de ACL | Adicionar planos e contexts ao `ILoggedUser` (back-end) |
| `checkPlan(options, identity)` | Após validar permissões | Verificar limite do plano (back-end) |

## Opções de configuração

| Campo | Descrição |
|---|---|
| `jwt.accessSecret` | Segredo do access token |
| `jwt.refreshSecret` | Segredo do refresh token (necessário para `verify(token, 'refresh')`) |
| `cache.baseUrl` | URL do cache-service |
| `cache.tokenDb` | DB da whitelist de tokens (padrão do sistema: `0`) |
| `cache.authzDb` | DB do snapshot de autorização (padrão do sistema: `2`) |
| `cache.authzTtlMs` | TTL do snapshot em milissegundos (convertido para segundos) |
| `cache.defaultPlatform` | Plataforma usada quando o claim `platform` está ausente |
| `roles.adminSlug` / `roles.userSlug` | Slugs de role (padrão: `admin` / `user`) |
| `ownership.userIdFields` | Campos considerados como dono do registro (padrão: `['user_id']`) |
| `catalog.failOnEmpty` | Falha na inicialização se o catálogo estiver vazio |
| `hooks` | Ver tabela acima |

## Fluxo do guard

1. Lê as opções do decorator via `Reflector`.
2. Se `isPublic`, retorna `true` imediatamente.
3. Extrai o `Bearer` e verifica assinatura + whitelist (`access_token:{sub}:{platform}`).
4. Executa `validateTerms` (a menos que `skipTerms`).
5. Busca `authz:{userId}` e `authz:version`; usa o snapshot se a versão for igual, senão reconstrói via `AuthorizationService.identityFor` e salva.
6. Monta o `ILoggedUser`, aplica `enrich` e grava em `request.user`.
7. Valida `permissions` e executa `checkPlan`.

## Testes

```bash
npm test -- --runInBand   # 3 suites / 20 testes
npm run build             # gera dist/ com declarações
```

Helpers em `src/testing` (`createTestPorts`, `createTestOptions`) são exportados pelo barrel para testes de consumidores.

## Publicação

O workflow `.github/workflows/publish.yml` publica no GitHub Packages quando uma tag `v*` é enviada:

```bash
git tag v0.1.0
git push origin v0.1.0
```

O `GITHUB_TOKEN` da Action já tem permissão `packages: write`. Para publicar manualmente, use um PAT com `write:packages` em `NODE_AUTH_TOKEN`.
