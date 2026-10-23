const STATUS_MESSAGES = {
    401: 'Your session has ended. Sign in again to keep working.',
    403: "You don't have permission to read the logs.",
    404: 'That log model does not exist.'
};

export class LogApiError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'LogApiError';
        this.status = status;
    }
}

// Two reads: facets (column profiles with counts) and search (a page of rows). Both take the date window as
// local days with an exclusive end, sent as the moments those days start here; the page owns the "through the end
// of that day" rule. Facet days bucket in the browser's day (offset, minutes east of UTC).
const moment = day => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date).toISOString();
};

export class LogApi {
    #baseUrl;

    constructor(baseUrl) {
        this.#baseUrl = baseUrl.replace(/\/$/, '');
    }

    async facets(model, { start, endExclusive, profileFields, flags = {} }) {
        const query = new URLSearchParams({ start: moment(start), end: moment(endExclusive), offset: String(-new Date().getTimezoneOffset()), 'profile-fields': profileFields.join(','), ...flags });
        const data = await this.#request(`/${model}/facets?${query}`);
        return data?.items ?? (Array.isArray(data) ? data : []);
    }

    async search(model, { start, endExclusive, operator, selections, pageIndex, pageSize, sortBy, flags = {} }) {
        const query = new URLSearchParams({
            'log-start': moment(start),
            'log-end': moment(endExclusive),
            'logical-operator': operator,
            pageIndex: String(pageIndex),
            pageSize: String(pageSize),
            ...flags
        });
        if (sortBy) query.set('sortBy', sortBy);
        for (const [param, values] of selections) {
            query.set(param, values.join(','));
        }
        const data = await this.#request(`/${model}/search?${query}`);
        return { items: data?.items ?? [], total: data?.total ?? 0 };
    }

    async #request(path) {
        let response;
        try {
            response = await fetch(this.#baseUrl + path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        } catch {
            throw new LogApiError(0, "The server can't be reached. Check your connection and try again.");
        }
        const text = await response.text();
        let payload = null;
        try {
            payload = text ? JSON.parse(text) : null;
        } catch {
            payload = null;
        }
        if (!response.ok) {
            const message = payload?.message ?? payload?.status?.message ?? STATUS_MESSAGES[response.status] ?? `The server returned an error (${response.status}).`;
            throw new LogApiError(response.status, message);
        }
        return payload;
    }
}
