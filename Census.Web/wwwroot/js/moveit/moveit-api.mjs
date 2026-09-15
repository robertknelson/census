async function getJson(url) {
    let response;
    try {
        response = await fetch(url);
    } catch {
        throw new Error('Census.Web is not reachable — is the app still running?');
    }
    if (response.status === 404) {
        throw new Error('The board is not mounted: no tracking database is configured.');
    }
    if (!response.ok) {
        throw new Error(`The tracking database did not answer (${response.status}).`);
    }
    return response.json();
}

export function fetchStages() {
    return getJson('/api/moveit/stages');
}

export function fetchApplications() {
    return getJson('/api/moveit/applications');
}

export function fetchWhereIsEverything() {
    return getJson('/api/moveit/where-is-everything');
}

export function fetchReleaseStatus() {
    return getJson('/api/moveit/release-status');
}

export function fetchReadyToApprove() {
    return getJson('/api/moveit/ready-to-approve');
}

export function fetchApprovalVsProd() {
    return getJson('/api/moveit/approval-vs-prod');
}
