// The membership page's calls (personas.md §6.2). Every request carries the member the persona UX is
// viewing as, so a change is attributed until Census has sign-in. A 400, 404 or 409 carries the
// server's own words.

export class MembershipApi {
    #headers;

    constructor(headers = {}) {
        this.#headers = headers;
    }

    applications() { return this.#get('/api/membership/applications'); }
    members() { return this.#get('/api/membership/members'); }
    lists() { return this.#get('/api/membership/lists'); }
    recent() { return this.#get('/api/membership/audit/recent'); }
    appParts() { return this.#get('/api/membership/app-parts'); }
    audit(entity, id) { return this.#get(`/api/membership/audit/${entity}/${id}`); }

    saveApplication(id, body) { return this.#post(id ? `/api/membership/applications/${id}` : '/api/membership/applications', body); }
    saveMember(id, body) { return this.#post(id ? `/api/membership/members/${id}` : '/api/membership/members', body); }
    deleteApplication(id) { return this.#post(`/api/membership/applications/${id}/delete`, {}); }
    deleteMember(id) { return this.#post(`/api/membership/members/${id}/delete`, {}); }
    savePart(body) { return this.#post('/api/membership/parts/save', body); }
    deletePart(body) { return this.#post('/api/membership/parts/delete', body); }
    grant(body) { return this.#post('/api/membership/grants/grant', body); }
    revoke(body) { return this.#post('/api/membership/grants/revoke', body); }

    async #get(url) {
        const response = await this.#fetch(url, { headers: { Accept: 'application/json', ...this.#headers } });
        if (!response.ok) throw new Error(`The membership tables did not answer (${response.status}).`);
        return response.json();
    }

    async #post(url, body) {
        const response = await this.#fetch(url, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...this.#headers },
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
            throw new Error('Census.Web is not reachable — is the app still running?');
        }
    }
}
