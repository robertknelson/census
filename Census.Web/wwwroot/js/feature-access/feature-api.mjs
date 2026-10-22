const STATUS_MESSAGES = {
    401: 'Your session has ended. Sign in again to keep working.',
    403: "You don't have permission to manage feature access.",
    404: 'That feature no longer exists.',
    409: 'Someone else changed this feature.'
};

export class FeatureApiError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'FeatureApiError';
        this.status = status;
    }
}

export class FeatureApi {
    #baseUrl;
    #headers;

    // headers: sent with every request (Census: the member the persona UX is viewing as).
    constructor(baseUrl, headers = {}) {
        this.#baseUrl = baseUrl.replace(/\/$/, '');
        this.#headers = headers;
    }

    listFeatures(includeVoided = false) {
        return this.#request('GET', `/features?includeVoided=${includeVoided}`);
    }

    getFeature(featureId) {
        return this.#request('GET', `/features/${featureId}`);
    }

    getAudit(featureId) {
        return this.#request('GET', `/features/${featureId}/audit`);
    }

    getRoles() {
        return this.#request('GET', '/roles');
    }

    getGateScan() {
        return this.#request('GET', '/gate-scan');
    }

    createFeature(data) {
        return this.#request('POST', '/features', data);
    }

    updateFeature(featureId, data) {
        return this.#request('POST', `/features/${featureId}/update`, data);
    }

    setEnabled(featureId, isEnabled, rowVersion) {
        return this.#request('POST', `/features/${featureId}/set-enabled`, { isEnabled, rowVersion });
    }

    grantRole(featureId, roleName) {
        return this.#request('POST', `/features/${featureId}/roles/grant`, { roleName });
    }

    revokeRole(featureId, roleName) {
        return this.#request('POST', `/features/${featureId}/roles/revoke`, { roleName });
    }

    async #request(method, path, body) {
        let response;
        try {
            response = await fetch(this.#baseUrl + path, {
                method,
                credentials: 'same-origin',
                headers: body === undefined
                    ? { Accept: 'application/json', ...this.#headers }
                    : { Accept: 'application/json', 'Content-Type': 'application/json', ...this.#headers },
                body: body === undefined ? undefined : JSON.stringify(body)
            });
        } catch {
            throw new FeatureApiError(0, "The server can't be reached. Check your connection and try again.");
        }

        const text = await response.text();
        let payload = null;
        try {
            payload = text ? JSON.parse(text) : null;
        } catch {
            payload = null;
        }

        if (!response.ok) {
            const message = payload?.message ?? STATUS_MESSAGES[response.status] ?? `The server returned an error (${response.status}).`;
            throw new FeatureApiError(response.status, message);
        }
        return payload;
    }
}
