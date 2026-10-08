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

export function fetchSystemsOverview() {
    return getJson('/api/systems/overview');
}

export function fetchSystemsConfig() {
    return getJson('/api/systems');
}

export function fetchSystemGraph(system, grouping = 'canonical') {
    return getJson(`/api/system-graph/${encodeURIComponent(system)}?grouping=${encodeURIComponent(grouping)}`);
}

export function fetchStageCrossings() {
    return getJson('/api/stage-crossings');
}

export async function saveStageCrossings(config) {
    let response;
    try {
        response = await fetch('/api/stage-crossings', {
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

export function fetchViews() {
    return getJson('/api/views');
}

export async function saveViews(config) {
    let response;
    try {
        response = await fetch('/api/views', {
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

export async function saveSystems(config) {
    let response;
    try {
        response = await fetch('/api/systems', {
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
