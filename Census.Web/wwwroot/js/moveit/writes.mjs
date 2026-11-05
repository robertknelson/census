// Where the member acted as may write (census-on-apptrak.md §7), as the server decided it: per curate feature, "all"
// or a list of application ids. The pages offer a form or a button only where the server would accept it.

export const RELEASES = 'curate.releases';
export const ITEMS = 'curate.feature-sets';
export const ASSOCIATIONS = 'curate.associations';
export const EVENTS = 'curate.events';

let pending = null;

export function fetchWrites() {
    pending ??= fetch('/api/moveit/writes', { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}));
    return pending;
}

export function may(writes, feature, applicationId) {
    const on = writes?.[feature];
    return on === 'all' || (Array.isArray(on) && on.includes(Number(applicationId)));
}

// The applications a form may offer for one feature.
export function writable(writes, feature, applications) {
    return applications.filter((a) => may(writes, feature, a.ApplicationId));
}
