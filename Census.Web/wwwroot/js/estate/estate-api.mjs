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

export function fetchCanvas(asOf) {
    return getJson(`/api/canvas${asOf ? `?asOf=${encodeURIComponent(asOf)}` : ''}`);
}

export function fetchFleetDates() {
    return getJson('/api/canvas/dates');
}

export function fetchCompare(machines, aspects, asOf) {
    const params = new URLSearchParams();
    params.set('machines', machines.join(','));
    if (aspects?.length) params.set('aspects', aspects.join(','));
    if (asOf) params.set('asOf', asOf);
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

export function fetchBaselines() {
    return getJson('/api/baselines');
}

export function fetchMachineBaseline(machine) {
    return getJson(`/api/baselines/machines/${encodeURIComponent(machine)}`);
}

export function fetchCertificates(asOf) {
    return getJson(`/api/certificates${asOf ? `?asOf=${encodeURIComponent(asOf)}` : ''}`);
}

export function fetchChanges() {
    return getJson('/api/changes');
}

export function fetchSoftware() {
    return getJson('/api/software');
}

export function fetchHosting() {
    return getJson('/api/hosting');
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

export async function saveBaselines(config) {
    await send('/api/baselines', 'PUT', config);
}

export async function blessBaseline(request) {
    await send('/api/baselines/bless', 'POST', request);
}

export async function approveOnMachine(request) {
    await send('/api/baselines/approve', 'POST', request);
}

async function send(url, method, body) {
    let response;
    try {
        response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch {
        throw new Error('Census.Web is not reachable — is the app still running?');
    }
    if (!response.ok) {
        let detail = `save failed (${response.status})`;
        try {
            const payload = await response.json();
            if (payload.errors) detail = payload.errors.join('; ');
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
