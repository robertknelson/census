// The membership page's arithmetic (Census's membership-model.mjs), pure so it is tested in node
// (Gatehouse.Tests/js/membership-model.test.mjs): members folded from their grant rows, the gaps the landing page
// names, and one audit row in words. Rows arrive camel-cased from the command/query handlers; an audit row's before
// and after are the scripts' own JSON, so their fields keep the tables' names.

const OWNER_ROLES = ['application-owner', 'product-owner'];

export function groupMembers(rows) {
    const members = new Map();
    for (const r of rows) {
        if (!members.has(r.memberId)) {
            members.set(r.memberId, {
                memberId: r.memberId, identifier: r.identifier, windowsIdentity: r.windowsIdentity,
                firstName: r.firstName, lastName: r.lastName, email: r.email ?? '',
                name: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.identifier,
                grants: [],
            });
        }
        if (r.role) {
            members.get(r.memberId).grants.push({ applicationId: r.applicationId, application: r.applicationName, role: r.role, roleId: r.roleId });
        }
    }
    return [...members.values()];
}

// What the landing page asks about. application: this application's identifier (Identity:Application); its
// system-administrators are the ones offered the administration.
export function findGaps({ applications, members, application }) {
    const holders = new Map();
    for (const m of members) {
        for (const g of m.grants) {
            if (!holders.has(g.applicationId)) holders.set(g.applicationId, []);
            holders.get(g.applicationId).push(g.role);
        }
    }
    const here = applications.find((a) => String(a.identifier).toLowerCase() === String(application).toLowerCase());
    const live = applications.filter((a) => a !== here && a.disposition !== 'retired');
    return {
        hereMissing: !here,
        hereNobody: here != null && !(holders.get(here.applicationId) ?? []).includes('system-administrator'),
        noRoles: members.filter((m) => m.grants.length === 0),
        nobodyOn: live.filter((a) => !holders.has(a.applicationId)),
        noOwner: live.filter((a) => holders.has(a.applicationId) && !holders.get(a.applicationId).some((r) => OWNER_ROLES.includes(r))),
    };
}

function parse(json) {
    try { return json ? JSON.parse(json) : null; } catch { return null; }
}

// One history line: what changed, in words. Field-by-field for an update.
export function describeAudit(entry) {
    const before = parse(entry.previousValue);
    const after = parse(entry.newValue);
    if (entry.entity === 'grant') {
        const g = after ?? before ?? {};
        return `${entry.action === 'granted' ? 'Granted' : 'Revoked'} ${g.Role} to ${g.Member} on ${g.Application}`;
    }
    if (entry.entity.startsWith('application-')) {
        const part = entry.entity.slice('application-'.length);
        const row = after ?? before ?? {};
        const detail = part === 'role' ? `role ${row.RoleId}${row.Alias ? ` (${row.Alias})` : ''}`
            : part === 'stage' ? `stage ${row.StageId} named ${row.Name}`
            : `service ${row.ServiceTypeId} since ${String(row.StartOn ?? '').slice(0, 10)}, ${row.Status}`;
        const verb = { created: 'Added', updated: 'Corrected', deleted: 'Removed' }[entry.action] ?? entry.action;
        return `${verb} ${detail} on application ${row.ApplicationId ?? entry.entityKey.split(':')[0]}`;
    }
    const what = entry.entity === 'application' ? 'application' : 'member';
    const label = (after ?? before ?? {}).Identifier ?? entry.entityKey;
    if (entry.action === 'created') return `Created ${what} ${label}`;
    if (entry.action === 'deleted') return `Deleted ${what} ${label}`;
    const changed = Object.keys(after ?? {})
        .filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before?.[k]))
        .map((k) => `${k} ${JSON.stringify(before?.[k] ?? '')} → ${JSON.stringify(after[k])}`);
    return `Updated ${what} ${label}${changed.length ? `: ${changed.join('; ')}` : ' (no field changed)'}`;
}
