export { fetchCanvas, fetchFleetDates } from '../estate/estate-api.mjs';

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

/// when: { day } | { from, to } | null for the latest fleet date.
export function fetchDay(when) {
    const params = new URLSearchParams();
    if (when?.day) params.set('day', when.day);
    if (when?.from) { params.set('from', when.from); params.set('to', when.to); }
    const query = params.toString();
    return getJson(`/api/day${query ? `?${query}` : ''}`);
}

export function fetchMonth(month) {
    return getJson(`/api/day/month?month=${encodeURIComponent(month)}`);
}
