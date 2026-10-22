// The curate pages' calls (personas.md §6.3): every asserted Move It row as stored, and the writes
// that create, correct or delete one. Every request names the member viewed as (until sign-in).

export class EditApi {
    #headers;

    constructor(headers = {}) {
        this.#headers = headers;
    }

    async loadAll() {
        const names = ['releases', 'workitems', 'builds', 'events', 'links', 'audit-recent'];
        const [releases, workitems, builds, events, links, recent, lists] = await Promise.all([
            ...names.map((n) => this.#get(`/api/edit/${n}`)), this.#get('/api/moveit/lists'),
        ]);
        return { releases, workitems, builds, events, links, recent, lists };
    }

    releaseAudit(id) { return this.#get(`/api/edit/audit/release/${id}`); }

    save(entity, id, body) { return this.#post(id ? `/api/edit/${entity}/${id}` : `/api/edit/${entity}`, body); }
    remove(entity, id) { return this.#post(`/api/edit/${entity}/${id}/delete`, {}); }

    async #get(url) {
        let response;
        try { response = await fetch(url, { headers: { Accept: 'application/json', ...this.#headers } }); }
        catch { throw new Error('Census.Web is not reachable — is the app still running?'); }
        if (!response.ok) throw new Error(`The tracking database did not answer (${response.status}).`);
        return response.json();
    }

    async #post(url, body) {
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...this.#headers },
                body: JSON.stringify(body),
            });
        } catch { throw new Error('Census.Web is not reachable — is the app still running?'); }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((payload.errors ?? [`The change was refused (${response.status}).`]).join(' '));
        return payload;
    }
}
