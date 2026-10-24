# Porting identity

Port after command/query. Spec: `.docs/features/gatehouse.md` §5 and §11.1.

## What the live app already has

A claims transformation of xf-dashboard's shape (G-R11): an `IClaimsTransformation` that splits `DOMAIN\username`, keeps
a session per user in `IMemoryCache`, asks an auth provider on a miss, adds `ClaimTypes.Role` claims, and grafts
`system-administrator` for `Authorization:SystemAdministrators`. Gatehouse's `ClaimsTransformer` is that shape without
impersonation (G-R2).

**Do not replace the live transformation.** Add to it the few things the other components read.

## What the components read from the signed-in user

| Claim | Read by | Value |
|---|---|---|
| `ClaimTypes.Role`, one per role | FM2280's targeting (`ClaimsTargetingContextAccessor`), the admin policy | The role identifiers features are granted to |
| `identifier` (`ClaimsTransformer.IdentifierClaim`) | Every write's actor (Feature access, Membership), the welcome | `username` from `DOMAIN\username` = `membership.Member.Identifier` |
| `display-name` | The sidebar's name | First and last name |
| `member` (`true` / `false`) | The `Visitor` policy, Home's redirect to the welcome, the sidebar | Whether a `membership.Member` row exists for the identifier |
| `session` | The transformation itself: present means already transformed this request | Any id |

If the live transformation names its claims differently, change the three constants in `ClaimsTransformer.cs` (or the
readers) rather than the live claims.

## Where the roles come from (open item G7: decide when porting)

**A. Membership's roles (Gatehouse's way).** Port `MembershipAuthProvider` and `sql/member-roles.sql`: the member by
`Identifier`, and their `member-types` identifiers held on the application named by `Identity:Application`. Features are
granted to `member-types` roles (Product Owner, Technical Lead, …), and the Membership page grants them. Use this when the
live app's own roles can move to membership.

**B. The live app's own roles.** Keep the live auth provider; features are then granted to whatever its role claims
carry, and the Feature access page's role list must offer those names: replace `MemberTypesRoleCatalog` (in
`feature-management/FeatureManagementSetup.cs`) with a catalog of the live roles. The `member` claim then means "the live
provider found this person". Membership's grants would not reach the live app's sign-in; the Membership page still
administers AppTrak's membership for the other applications.

## Copy (A)

| File | Note |
|---|---|
| `MembershipAuthProvider.cs` | The provider and `IdentitySqlCommandInitializer` (key `…identity.member`), `IdentityOptions` |
| `sql/member-roles.sql` | Read-only; one member, their roles on one application, as one JSON document |
| `UserSession.cs` | Only the fields the live session lacks: `IsMember`, `Roles` |
| `ClaimsTransformer.cs` | Reference only: copy the `member` and `identifier` claim lines into the live transformation |

## Program.cs

```csharp
builder.Services.Configure<IdentityOptions>(builder.Configuration.GetSection(IdentityOptions.SectionName));
builder.Services.AddTransient<ISqlCommandInitializer, IdentitySqlCommandInitializer>();   // A only
builder.Services.AddScoped<IAuthProvider, MembershipAuthProvider>();                       // A only
```

## Settings

```json
"Identity": { "Application": "<the live app's membership.Application identifier>", "SessionMinutes": 5 }
```

`SessionMinutes` is how long a grant or an approval takes to reach someone already signed in.

## Windows sign-in on IIS (open item G5)

Gatehouse runs on Kestrel with `AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate()`, as
xf-dashboard does. Hosted in IIS, the Negotiate handler defers to IIS's Windows authentication, so the code is the same;
in the site's IIS settings, Windows authentication is on and anonymous authentication is off. The fallback policy (every
request signed in) stays.

## Check after porting

- Home (or the live app's equivalent) shows the identifier and the roles for yourself.
- Revoke one of your roles on the Membership page (A): it is gone within `SessionMinutes`, without a restart.
- A Windows account with no member row gets `member` = `false` (the welcome, if Membership is ported).
