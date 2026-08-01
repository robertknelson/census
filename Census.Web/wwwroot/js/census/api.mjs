async function getJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url} failed (${response.status})`);
    }
    return response.json();
}

export function fetchMachines() {
    return getJson('/api/machines');
}

export function fetchMachineDates(machine) {
    return getJson(`/api/machines/${encodeURIComponent(machine)}/dates`);
}

export function fetchSnapshot(machine, date) {
    return getJson(`/api/machines/${encodeURIComponent(machine)}/snapshots/${encodeURIComponent(date)}`);
}

export function fetchDiff(machine, fromDate, toDate) {
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    const query = params.toString();
    return getJson(`/api/machines/${encodeURIComponent(machine)}/diff${query ? `?${query}` : ''}`);
}

export function fetchComplianceSummary() {
    return getJson('/api/compliance/summary');
}

export function fetchCertificates() {
    return getJson('/api/certificates');
}

export function fetchCoverage() {
    return getJson('/api/coverage');
}

export function fetchCompare(machines, aspects) {
    const params = new URLSearchParams();
    params.set('machines', machines.join(','));
    if (aspects?.length) params.set('aspects', aspects.join(','));
    return getJson(`/api/compare?${params}`);
}

export function fetchBlacklist() {
    return getJson('/api/blacklist');
}

export async function saveBlacklist(config) {
    const response = await fetch('/api/blacklist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
    if (!response.ok) {
        let detail = `save failed (${response.status})`;
        try {
            const body = await response.json();
            if (body.errors) detail = body.errors.join('; ');
        } catch { /* keep the status-based message */ }
        throw new Error(detail);
    }
}
