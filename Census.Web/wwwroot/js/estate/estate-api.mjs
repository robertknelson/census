async function getJson(url) {
    const response = await fetch(url);
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
