// The membership page's calls (Census's membership-api.mjs). The server knows who is signed in, so nothing rides in a
// header. A 400, 403, 404 or 409 carries the server's own words.

export class MembershipApi {
    applications() { return this.#get('/api/membership/applications'); }
    members() { return this.#get('/api/membership/members'); }
    lists() { return this.#get('/api/membership/lists'); }
    recent() { return this.#get('/api/membership/audit/recent'); }
    appParts() { return this.#get('/api/membership/app-parts'); }
    audit(entity, id) { return this.#get(`/api/membership/audit/${entity}/${id}`); }
    requests() { return this.#get('/api/membership/requests'); }

    saveApplication(id, body) { return this.#post(id ? `/api/membership/applications/${id}` : '/api/membership/applications', body); }
    saveMember(id, body) { return this.#post(id ? `/api/membership/members/${id}` : '/api/membership/members', body); }
    deleteApplication(id) { return this.#post(`/api/membership/applications/${id}/delete`, {}); }
    deleteMember(id) { return this.#post(`/api/membership/members/${id}/delete`, {}); }
    savePart(body) { return this.#post('/api/membership/parts/save', body); }
    deletePart(body) { return this.#post('/api/membership/parts/delete', body); }
    grant(body) { return this.#post('/api/membership/grants/grant', body); }
    revoke(body) { return this.#post('/api/membership/grants/revoke', body); }
    approve(id, body) { return this.#post(`/api/membership/requests/${id}/approve`, body); }
    decline(id, body) { return this.#post(`/api/membership/requests/${id}/decline`, body); }

    async #get(url) {
        const response = await this.#fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`The membership tables did not answer (${response.status}).`);
        return response.json();
    }

    async #post(url, body) {
        const response = await this.#fetch(url, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((payload.errors ?? [`The change was refused (${response.status}).`]).join(' '));
        return payload;
    }

    async #fetch(url, init) {
        try {
            return await fetch(url, init);
        } catch {
            throw new Error('Gatehouse is not reachable — is the app still running?');
        }
    }
}
