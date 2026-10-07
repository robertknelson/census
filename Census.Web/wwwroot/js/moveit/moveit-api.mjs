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

export function fetchReleases() {
    return getJson('/api/moveit/releases');
}

export function fetchHistory() {
    return getJson('/api/moveit/history');
}

export function fetchCoverage() {
    return getJson('/api/moveit/coverage');
}

export function fetchCalendar() {
    return getJson('/api/moveit/calendar');
}

export function fetchLists() {
    return getJson('/api/moveit/lists');
}

export function fetchEvents() {
    return getJson('/api/moveit/events');
}

export function fetchReleaseBuilds() {
    return getJson('/api/moveit/release-builds');
}

// Question 13, every item (move-it.md §28): the register's story column.
export function fetchFeaturePicture() {
    return getJson('/api/moveit/feature-picture');
}

// The board's writes (move-it.md §15, §16). A 400 carries the server's validation messages.
export function postNameBuild(request) {
    return postJson('/api/moveit/name-build', request);
}

// The notebook (move-it.md §20): the board's one write.
export function postAddItem(request) {
    return postJson('/api/moveit/add-item', request);
}

export function postEvent(request) {
    return postJson('/api/moveit/event', request);
}

export function postPullItem(request) {
    return postJson('/api/moveit/pull-item', request);
}

export function postRetitle(request) {
    return postJson('/api/moveit/retitle', request);
}

export function postDeleteRelease(request) {
    return postJson('/api/moveit/delete-release', request);
}

async function postJson(url, request) {
    let response;
    try {
        response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
        });
    } catch {
        throw new Error('Census.Web is not reachable — is the app still running?');
    }
    if (response.status === 400) {
        const body = await response.json();
        throw new Error((body.errors ?? ['The entry was refused.']).join(' '));
    }
    if (!response.ok) {
        throw new Error(`The tracking database did not take the entry (${response.status}).`);
    }
    return response.json();
}
