async function getJson(url) {
    let response;
    try {
        response = await fetch(url);
    } catch {
        throw new Error('Census.Web is not reachable — is the app still running?');
    }
    if (!response.ok) {
        throw new Error(`${url} failed (${response.status})`);
    }
    return response.json();
}

export function fetchCanvas() {
    return getJson('/api/canvas');
}

export function fetchCompare(machines, aspects) {
    const params = new URLSearchParams();
    params.set('machines', machines.join(','));
    if (aspects?.length) params.set('aspects', aspects.join(','));
    return getJson(`/api/compare?${params}`);
}

export function fetchSnapshot(machine, date) {
    return getJson(`/api/machines/${encodeURIComponent(machine)}/snapshots/${encodeURIComponent(date)}`);
}

export function fetchMachineDates(machine) {
    return getJson(`/api/machines/${encodeURIComponent(machine)}/dates`);
}

export function fetchMachineDiff(machine, fromDate, toDate) {
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    return getJson(`/api/machines/${encodeURIComponent(machine)}/diff?${params}`);
}

export function fetchBlacklist() {
    return getJson('/api/blacklist');
}

export function fetchCertificates() {
    return getJson('/api/certificates');
}

export async function saveBlacklist(config) {
    let response;
    try {
        response = await fetch('/api/blacklist', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
        });
    } catch {
        throw new Error('Census.Web is not reachable — is the app still running?');
    }
    if (!response.ok) {
        let detail = `save failed (${response.status})`;
        try {
            const body = await response.json();
            if (body.errors) detail = body.errors.join('; ');
        } catch { /* keep the status-based message */ }
        throw new Error(detail);
    }
}

export async function saveAssignment(machine, assignment) {
    let response;
    try {
        response = await fetch(`/api/assets/${encodeURIComponent(machine)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(assignment),
        });
    } catch {
        throw new Error('Census.Web is not reachable — is the app still running?');
    }
    if (!response.ok) {
        let detail = `save failed (${response.status})`;
        try {
            const body = await response.json();
            if (body.errors) detail = body.errors.join('; ');
        } catch { /* keep the status-based message */ }
        throw new Error(detail);
    }
}
