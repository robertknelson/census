const roleNames = snapshot => (snapshot?.roles ?? []).map(role => role.roleName);
const without = (list, removed) => list.filter(item => !removed.includes(item));

export function describeAuditEntry(entry) {
    const previous = entry.previousValue;
    const next = entry.newValue;
    switch (entry.action) {
        case 'create': {
            const roles = roleNames(next);
            const state = next.isEnabled ? 'Created and turned on' : 'Created, turned off';
            return roles.length ? `${state}, granted to ${roles.join(', ')}` : `${state}, with no roles`;
        }
        case 'update': {
            const changes = [];
            if (previous.displayName !== next.displayName) {
                changes.push(`Renamed from “${previous.displayName}” to “${next.displayName}”`);
            }
            if ((previous.description ?? '') !== (next.description ?? '')) {
                changes.push(next.description ? 'Changed the description' : 'Removed the description');
            }
            return changes.join('. ') || 'Saved with no changes';
        }
        case 'set-enabled':
            return next.isEnabled ? 'Turned on' : 'Turned off';
        case 'role.grant':
            return `Granted ${without(roleNames(next), roleNames(previous)).join(', ')}`;
        case 'role.revoke':
            return `Revoked ${without(roleNames(previous), roleNames(next)).join(', ')}`;
        case 'void':
            return next.voidReason ? `Voided: ${next.voidReason}` : 'Voided';
        default:
            return entry.action;
    }
}

// "FM2280.Harness.Areas.Manager.Controllers.RenewalsController.Index (FM2280.Harness)" -> "RenewalsController.Index"
export function shortLocation(location) {
    return location.replace(/\s*\([^)]*\)\s*$/, '').split('.').slice(-2).join('.');
}

// "manager.team-workload" -> "Team workload"
export function suggestDisplayName(name) {
    const segment = name.trim().split('.').filter(Boolean).at(-1) ?? '';
    const words = segment.split('-').filter(Boolean).join(' ');
    return words ? words[0].toUpperCase() + words.slice(1) : '';
}
