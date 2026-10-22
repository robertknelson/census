// The membership page's arithmetic (personas.md §6.2), pure so it is tested in node
// (tests/Test-Membership.mjs): members folded from their grant rows, the gaps the landing page
// names, and one audit row in words.

const OWNER_ROLES = ['application-owner', 'product-owner'];

export function groupMembers(rows) {
    const members = new Map();
    for (const r of rows) {
        if (!members.has(r.MemberId)) {
            members.set(r.MemberId, {
                memberId: r.MemberId, identifier: r.Identifier, windowsIdentity: r.WindowsIdentity,
                firstName: r.FirstName, lastName: r.LastName, email: r.Email ?? '',
                name: `${r.FirstName ?? ''} ${r.LastName ?? ''}`.trim() || r.Identifier,
                grants: [],
            });
        }
        if (r.Role) {
            members.get(r.MemberId).grants.push({ applicationId: r.ApplicationId, application: r.ApplicationName, role: r.Role, roleId: r.RoleId });
        }
    }
    return [...members.values()];
}

// What the landing page asks about. estate: the Identifier whose roles are estate-wide (§4).
export function findGaps({ applications, members, estate }) {
    const holders = new Map();
    for (const m of members) {
        for (const g of m.grants) {
            if (!holders.has(g.applicationId)) holders.set(g.applicationId, []);
            holders.get(g.applicationId).push(g.role);
        }
    }
    const census = applications.find((a) => String(a.Identifier).toLowerCase() === String(estate).toLowerCase());
    const live = applications.filter((a) => a !== census && a.Disposition !== 'retired');
    return {
        estateMissing: !census,
        estateNobody: census != null && !(holders.get(census.ApplicationId) ?? []).includes('system-administrator'),
        noRoles: members.filter((m) => m.grants.length === 0),
        nobodyOn: live.filter((a) => !holders.has(a.ApplicationId)),
        noOwner: live.filter((a) => holders.has(a.ApplicationId) && !holders.get(a.ApplicationId).some((r) => OWNER_ROLES.includes(r))),
    };
}

function parse(json) {
    try { return json ? JSON.parse(json) : null; } catch { return null; }
}

// One history line: what changed, in words. Field-by-field for an update.
export function describeAudit(entry) {
    const before = parse(entry.PreviousValue);
    const after = parse(entry.NewValue);
    if (entry.Entity === 'grant') {
        const g = after ?? before ?? {};
        return `${entry.Action === 'granted' ? 'Granted' : 'Revoked'} ${g.Role} to ${g.Member} on ${g.Application}`;
    }
    const what = entry.Entity === 'application' ? 'application' : 'member';
    const label = (after ?? before ?? {}).Identifier ?? entry.EntityKey;
    if (entry.Action === 'created') return `Created ${what} ${label}`;
    const changed = Object.keys(after ?? {})
        .filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before?.[k]))
        .map((k) => `${k} ${JSON.stringify(before?.[k] ?? '')} → ${JSON.stringify(after[k])}`);
    return `Updated ${what} ${label}${changed.length ? `: ${changed.join('; ')}` : ' (no field changed)'}`;
}
