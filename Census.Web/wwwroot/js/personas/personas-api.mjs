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

export function fetchOrderViolations() {
    return getJson('/api/personas/order-violations');
}

export function fetchStageMismatch() {
    return getJson('/api/personas/stage-mismatch');
}

// Who is signed in, who they act as, that member's access, and what the shell offers (census-on-apptrak.md §10).
export function fetchMe() {
    return getJson('/api/personas/me');
}

// A system administrator acts as a member, or stops (census-on-apptrak.md §10). The server's words on a refusal.
export async function impersonate(identifier) {
    return postJson(identifier ? '/api/impersonation' : '/api/impersonation/stop', identifier ? { identifier } : {});
}

async function postJson(url, body) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.errors?.join(' ') ?? `Refused (${response.status}).`);
    return payload;
}
