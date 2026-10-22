async function getJson(url) {
    let response;
    try {
        response = await fetch(url);
    } catch {
        throw new Error('Census.Web is not reachable — is the app still running?');
    }
    if (response.status === 404) {
        throw new Error('Not found: no AppTrak database is configured, or that member is gone.');
    }
    if (!response.ok) {
        throw new Error(`AppTrak did not answer (${response.status}).`);
    }
    return response.json();
}

export function fetchMembers() {
    return getJson('/api/personas/members');
}

export function fetchLeadTime() {
    return getJson('/api/personas/lead-time');
}

export function fetchReleaseStatus() {
    return getJson('/api/moveit/release-status');
}

export function fetchCalendar() {
    return getJson('/api/moveit/calendar');
}

export function fetchAccess(identifier) {
    return getJson(`/api/personas/members/${encodeURIComponent(identifier)}`);
}
