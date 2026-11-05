import { escapeHtml, isoDate } from '../moveit/format.mjs';
import { MembershipApi } from './membership-api.mjs';
import { describeAudit, describeDrift, findGaps, groupMembers } from './membership-model.mjs';
import { readForm, renderForm, toPayload } from '../curate/record-form.mjs';

// The membership page (personas.md §6.2): AppTrak's applications, members, and who holds which role
// where. A landing page first — the counts, what needs a word, what changed lately — then the two
// lists and one page per application or member, where it is edited and its grants given or taken
// back. No deletes: an application is retired by its Disposition, a member loses access by losing
// their grants. Every write is audited (membership.MembershipAudit).
//
// The place inside the page rides in the URL as mb= (overview | applications | members | app:ID |
// member:ID | new-app | new-member), so a screen can be linked.

const DISPOSITIONS = ['current', 'retired'];

class MembershipPage {
    init(config = {}) {
        this.root = typeof config.root === 'string' ? document.querySelector(config.root) : config.root;
        this.api = new MembershipApi(config.headers);
        this.estate = config.estate ?? 'census';
        this.by = config.by ?? '';
        this.at = new URLSearchParams(location.search).get('mb') ?? 'overview';
        this.flash = '';
        this.load();
    }

    async load() {
        this.root.innerHTML = '<p class="ps-none">Reading membership…</p>';
        try {
            const [applications, memberRows, lists, recent, parts, drift] = await Promise.all([this.api.applications(), this.api.members(), this.api.lists(), this.api.recent(), this.api.appParts(), this.api.roleDrift()]);
            this.drift = drift;
            this.parts = parts;
            this.stages = lists.filter((l) => l.List === 'stages');
            this.serviceTypes = lists.filter((l) => l.List === 'service-types');
            this.applications = applications;
            this.members = groupMembers(memberRows);
            this.types = lists.filter((l) => l.List === 'application-types');
            this.roles = lists.filter((l) => l.List === 'member-types');
            this.recent = recent;
        } catch (e) {
            this.root.innerHTML = `<p class="ps-error">${escapeHtml(e.message)}</p>`;
            return;
        }
        await this.render();
    }

    go(at) {
        this.at = at;
        this.flash = '';
        this.render();
    }

    async render() {
        const params = new URLSearchParams(location.search);
        params.set('mb', this.at);
        history.replaceState(null, '', `${location.pathname}?${params}`);
        const [kind, id] = this.at.split(':');
        let body;
        if (kind === 'applications') body = this.applicationsHtml();
        else if (kind === 'members') body = this.membersHtml();
        else if (kind === 'app' || kind === 'new-app') body = await this.applicationHtml(kind === 'app' ? Number(id) : null);
        else if (kind === 'member' || kind === 'new-member') body = await this.memberHtml(kind === 'member' ? Number(id) : null);
        else body = this.overviewHtml();
        const tab = (at, label) => `<button type="button" class="mb-tab${kind === at || (at === 'applications' && kind.endsWith('app')) || (at === 'members' && kind.endsWith('member')) ? ' is-active' : ''}" data-go="${at}">${label}</button>`;
        this.root.innerHTML = `
            <div class="mb-page">
                <header class="mb-head">
                    <h2 class="mb-title">Membership</h2>
                    <nav class="mb-tabs">${tab('overview', 'Overview')}${tab('applications', `Applications <span class="mb-n">${this.applications.length}</span>`)}${tab('members', `Members <span class="mb-n">${this.members.length}</span>`)}</nav>
                </header>
                ${this.flash ? `<p class="mb-flash">${escapeHtml(this.flash)}</p>` : ''}
                ${body}
            </div>`;
        this.bind();
    }

    // ---- the landing page ----

    overviewHtml() {
        const gaps = findGaps({ applications: this.applications, members: this.members, estate: this.estate });
        const grants = this.members.reduce((n, m) => n + m.grants.length, 0);
        const retired = this.applications.filter((a) => a.Disposition === 'retired').length;
        const tile = (n, label, go) => `<button type="button" class="ps-tile mb-tile" data-go="${go}"><span class="ps-tile-label">${label}</span><span class="ps-tile-value">${n}</span></button>`;
        const appLink = (a) => `<a href="#" class="ps-link" data-go="app:${a.ApplicationId}">${escapeHtml(a.Name)}</a>`;
        const memberLink = (m) => `<a href="#" class="ps-link" data-go="member:${m.memberId}">${escapeHtml(m.name)}</a>`;
        const needs = [];
        if (gaps.estateMissing) needs.push(`<li><strong>Census is not registered as an application</strong> (identifier <code>${escapeHtml(this.estate)}</code>), so no one can hold an estate-wide role. <a href="#" class="ps-link" data-go="new-app">Register it</a></li>`);
        else if (gaps.estateNobody) needs.push('<li><strong>No one is system-administrator on Census.</strong> Without one, no one is offered this page from a sign-in.</li>');
        if (gaps.noRoles.length) needs.push(`<li><strong>${gaps.noRoles.length} member${gaps.noRoles.length === 1 ? ' holds' : 's hold'} no role anywhere</strong>, so ${gaps.noRoles.length === 1 ? 'sees' : 'see'} nothing: ${gaps.noRoles.map(memberLink).join(', ')}</li>`);
        if (gaps.nobodyOn.length) needs.push(`<li><strong>${gaps.nobodyOn.length} application${gaps.nobodyOn.length === 1 ? ' has' : 's have'} nobody</strong> holding a role: ${gaps.nobodyOn.map(appLink).join(', ')}</li>`);
        if (this.drift.length) needs.push(`<li><strong>${this.drift.length} role${this.drift.length === 1 ? ' is' : 's are'} named that the member-types list does not offer</strong>, so roles, membership and feature access disagree: <ul class="mb-needs">${this.drift.map((d) => `<li>${escapeHtml(describeDrift(d))}</li>`).join('')}</ul></li>`);
        if (gaps.noOwner.length) needs.push(`<li><strong>${gaps.noOwner.length} application${gaps.noOwner.length === 1 ? ' has' : 's have'} no owner</strong> (application-owner or product-owner): ${gaps.noOwner.map(appLink).join(', ')}</li>`);
        return `
            <section class="ps-section">
                <div class="ps-tiles">
                    ${tile(this.applications.length, `Applications${retired ? ` <span class="mb-n">${retired} retired</span>` : ''}`, 'applications')}
                    ${tile(this.members.length, 'Members', 'members')}
                    ${tile(grants, 'Roles held', 'members')}
                </div>
                <div class="mb-actions">
                    <button type="button" class="ps-save" data-go="new-app">New application</button>
                    <button type="button" class="ps-save" data-go="new-member">New member</button>
                </div>
            </section>
            <div class="ps-grid ps-grid-2">
            <section class="ps-section">
                <h3 class="ps-h3">Needs a word</h3>
                ${needs.length ? `<ul class="mb-needs">${needs.join('')}</ul>` : '<p class="ps-none">Nothing: every application has someone, every member has a role.</p>'}
            </section>
            <section class="ps-section">
                <h3 class="ps-h3">Recent changes</h3>
                ${this.historyHtml(this.recent, 'No change has been made from this page yet.')}
            </section>
            </div>`;
    }

    historyHtml(entries, empty) {
        if (!entries.length) return `<p class="ps-none">${empty}</p>`;
        return `<ul class="ps-list">${entries.map((e) => `
            <li><span class="ps-list-main">${escapeHtml(describeAudit(e))}</span>
                <span class="ps-list-end">${escapeHtml(isoDate(e.ChangedAt))} ${escapeHtml(new Date(e.ChangedAt).toTimeString().slice(0, 5))} · ${escapeHtml(e.ChangedBy)}${e.ImpersonatedBy ? ` <span class="ps-imp-by" title="Done by ${escapeHtml(e.ImpersonatedBy)} while acting as ${escapeHtml(e.ChangedBy)}">(by ${escapeHtml(e.ImpersonatedBy)})</span>` : ''}</span></li>`).join('')}</ul>`;
    }

    // ---- the lists ----

    applicationsHtml() {
        const rows = [...this.applications].sort((a, b) => String(a.Name).localeCompare(String(b.Name)));
        return `
            <section class="ps-section">
                <div class="mb-actions"><button type="button" class="ps-save" data-go="new-app">New application</button></div>
                <div class="ps-scroll"><table class="ps-table">
                    <thead><tr><th>Name</th><th>Identifier</th><th>Type</th><th>Disposition</th><th>Members</th><th>Tags</th></tr></thead>
                    <tbody>${rows.map((a) => `
                        <tr class="${a.Disposition === 'retired' ? 'mb-retired' : ''}">
                            <td><a href="#" class="ps-link" data-go="app:${a.ApplicationId}">${escapeHtml(a.Name)}</a></td>
                            <td class="ps-mono">${escapeHtml(a.Identifier)}</td>
                            <td>${escapeHtml(a.ApplicationType ?? '—')}</td>
                            <td>${escapeHtml(a.Disposition)}</td>
                            <td>${a.Members}</td>
                            <td>${escapeHtml(a.Tags ?? '')}</td>
                        </tr>`).join('')}</tbody>
                </table></div>
            </section>`;
    }

    membersHtml() {
        const rows = [...this.members].sort((a, b) => a.name.localeCompare(b.name));
        const summary = (m) => {
            if (!m.grants.length) return '<span class="ps-flag is-alert">no role</span>';
            const byRole = new Map();
            for (const g of m.grants) byRole.set(g.role, [...(byRole.get(g.role) ?? []), g.application]);
            return escapeHtml([...byRole].map(([r, apps]) => `${r} on ${apps.join(', ')}`).join('; '));
        };
        return `
            <section class="ps-section">
                <div class="mb-actions"><button type="button" class="ps-save" data-go="new-member">New member</button></div>
                <div class="ps-scroll"><table class="ps-table">
                    <thead><tr><th>Name</th><th>Identifier</th><th>Windows identity</th><th>Roles</th></tr></thead>
                    <tbody>${rows.map((m) => `
                        <tr>
                            <td><a href="#" class="ps-link" data-go="member:${m.memberId}">${escapeHtml(m.name)}</a></td>
                            <td class="ps-mono">${escapeHtml(m.identifier)}</td>
                            <td class="ps-mono">${escapeHtml(m.windowsIdentity)}</td>
                            <td class="mb-wrap">${summary(m)}</td>
                        </tr>`).join('')}</tbody>
                </table></div>
            </section>`;
    }

    // ---- one application, one member ----

    async applicationHtml(id) {
        const a = id ? this.applications.find((x) => x.ApplicationId === id) : null;
        if (id && !a) return '<p class="ps-error">That application is not in membership.Application.</p>';
        const option = (value, label, selected) => `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
        const form = `
            <form class="mb-form" data-form="app">
                <label>Name <input name="name" required maxlength="100" value="${escapeHtml(a?.Name ?? '')}" /></label>
                <label>Identifier <input name="identifier" required maxlength="50" value="${escapeHtml(a?.Identifier ?? '')}" placeholder="kebab-case" /></label>
                <label>Type <select name="applicationTypeId" required>${this.types.map((t) => option(t.Id, t.Display, t.Id === a?.ApplicationTypeId)).join('')}</select></label>
                <label>Disposition <input name="disposition" required maxlength="30" list="mb-dispositions" value="${escapeHtml(a?.Disposition ?? 'current')}" /></label>
                <label class="mb-wide">Tags <input name="tags" maxlength="510" value="${escapeHtml(a?.Tags ?? '')}" /></label>
                <label class="mb-wide">Settings (JSON) <textarea name="settings" rows="3">${escapeHtml(a?.Settings ?? '{ "settings":null}')}</textarea></label>
                <datalist id="mb-dispositions">${DISPOSITIONS.map((d) => `<option value="${d}"></option>`).join('')}</datalist>
                <div class="mb-wide mb-actions"><button type="submit" class="ps-save">${a ? 'Save' : 'Create'}</button>${a ? '<button type="button" class="ps-cancel cu-delete" data-delete-record="application">Delete</button>' : ''}<span class="ps-form-status" data-status></span></div>
            </form>`;
        if (!a) return `<section class="ps-section"><h3 class="ps-h3">New application</h3>${form}</section>`;
        const holders = this.members.flatMap((m) => m.grants.filter((g) => g.applicationId === id).map((g) => ({ m, g })))
            .sort((x, y) => x.g.role.localeCompare(y.g.role) || x.m.name.localeCompare(y.m.name));
        const history = await this.api.audit('application', id);
        return `
            <div class="ps-grid ps-grid-3"><div class="ps-stack">
            <section class="ps-section"><p class="ps-crumb"><a href="#" class="ps-link" data-go="applications">Applications</a></p><h3 class="ps-h">${escapeHtml(a.Name)}</h3>${form}</section>
            <section class="ps-section"><h3 class="ps-h3">History</h3>${this.historyHtml(history, 'No change has been made to it from this page.')}</section>
            </div><div class="ps-stack">
            <section class="ps-section">
                <h3 class="ps-h3">Who holds a role here</h3>
                ${holders.length ? `<ul class="ps-list">${holders.map(({ m, g }) => `
                    <li><span class="ps-list-main"><a href="#" class="ps-link" data-go="member:${m.memberId}">${escapeHtml(m.name)}</a> · ${escapeHtml(g.role)}</span>
                        <button type="button" class="ps-cancel" data-revoke="${m.memberId}:${id}:${g.roleId}">Revoke</button></li>`).join('')}</ul>` : '<p class="ps-none">Nobody yet.</p>'}
                <form class="ps-form" data-form="grant" data-application="${id}">
                    <select name="memberId" required>${this.members.map((m) => option(m.memberId, `${m.name} (${m.identifier})`)).join('')}</select>
                    <select name="roleId" required>${this.roles.map((r) => option(r.Id, r.Identifier)).join('')}</select>
                    <button type="submit" class="ps-save">Grant</button><span class="ps-form-status" data-status></span>
                </form>
            </section>
            ${this.partsHtml(id)}
            </div></div>`;
    }

    async memberHtml(id) {
        const m = id ? this.members.find((x) => x.memberId === id) : null;
        if (id && !m) return '<p class="ps-error">That member is not in membership.Member.</p>';
        const option = (value, label) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
        const form = `
            <form class="mb-form" data-form="member">
                <label>First name <input name="firstName" required maxlength="100" value="${escapeHtml(m?.firstName ?? '')}" /></label>
                <label>Last name <input name="lastName" required maxlength="100" value="${escapeHtml(m?.lastName ?? '')}" /></label>
                <label>Identifier <input name="identifier" required maxlength="100" value="${escapeHtml(m?.identifier ?? '')}" /></label>
                <label>Windows identity <input name="windowsIdentity" required maxlength="72" value="${escapeHtml(m?.windowsIdentity ?? '')}" placeholder="DOMAIN\\user" /></label>
                <label class="mb-wide">Email <input name="email" type="email" maxlength="100" value="${escapeHtml(m?.email ?? '')}" /></label>
                <div class="mb-wide mb-actions"><button type="submit" class="ps-save">${m ? 'Save' : 'Create'}</button>${m ? '<button type="button" class="ps-cancel cu-delete" data-delete-record="member">Delete</button>' : ''}<span class="ps-form-status" data-status></span></div>
            </form>`;
        if (!m) return `<section class="ps-section"><h3 class="ps-h3">New member</h3>${form}</section>`;
        const grants = [...m.grants].sort((x, y) => String(x.application).localeCompare(String(y.application)) || x.role.localeCompare(y.role));
        const history = await this.api.audit('member', id);
        return `
            <div class="ps-grid ps-grid-2"><div class="ps-stack">
            <section class="ps-section"><p class="ps-crumb"><a href="#" class="ps-link" data-go="members">Members</a></p><h3 class="ps-h">${escapeHtml(m.name)}</h3>${form}</section>
            <section class="ps-section"><h3 class="ps-h3">History</h3>${this.historyHtml(history, 'No change has been made to this member from this page.')}</section>
            </div><div class="ps-stack">
            <section class="ps-section">
                <h3 class="ps-h3">Roles held</h3>
                ${grants.length ? `<ul class="ps-list">${grants.map((g) => `
                    <li><span class="ps-list-main">${escapeHtml(g.role)} on <a href="#" class="ps-link" data-go="app:${g.applicationId}">${escapeHtml(g.application)}</a>${String(this.applications.find((a) => a.ApplicationId === g.applicationId)?.Identifier).toLowerCase() === this.estate ? ' <span class="ps-tag">estate-wide</span>' : ''}</span>
                        <button type="button" class="ps-cancel" data-revoke="${id}:${g.applicationId}:${g.roleId}">Revoke</button></li>`).join('')}</ul>` : '<p class="ps-none">No role anywhere: this member sees nothing.</p>'}
                <form class="ps-form" data-form="grant" data-member="${id}">
                    <select name="applicationId" required>${[...this.applications].sort((a, b) => String(a.Name).localeCompare(String(b.Name))).map((a) => option(a.ApplicationId, a.Name)).join('')}</select>
                    <select name="roleId" required>${this.roles.map((r) => option(r.Id, r.Identifier)).join('')}</select>
                    <button type="submit" class="ps-save">Grant</button><span class="ps-form-status" data-status></span>
                </form>
            </section>
            </div></div>`;
    }

    // ---- an application's parts: the roles it uses, its stages, its services ----

    partFields(part) {
        const opts = (list) => list.map((x) => ({ value: x.Id, label: x.Identifier }));
        if (part === 'role') return [
            { name: 'roleId', label: 'Role', type: 'select', int: true, required: true, options: opts(this.roles) },
            { name: 'alias', label: 'What this application calls it', type: 'text' },
        ];
        if (part === 'stage') return [
            { name: 'stageId', label: 'Stage', type: 'select', int: true, required: true, options: opts(this.stages) },
            { name: 'name', label: 'Its name for it (10)', type: 'text', required: true },
        ];
        return [
            { name: 'serviceTypeId', label: 'Service', type: 'select', int: true, required: true, options: opts(this.serviceTypes) },
            { name: 'startOn', label: 'Since', type: 'date', required: true },
            { name: 'status', label: 'Status', type: 'text', required: true },
        ];
    }

    partsHtml(id) {
        const mine = this.parts.filter((p) => p.ApplicationId === id);
        const section = (part, title, hint, values, summary, blank) => {
            const rows = mine.filter((p) => p.Part === part);
            return `
                <section class="ps-section">
                    <h3 class="ps-h3">${title} <span class="mb-n">${rows.length}</span></h3>
                    <p class="ps-sub">${hint}</p>
                    ${rows.map((p) => `<details class="cu-row"><summary>${summary(p)}</summary>${renderForm(this.partFields(part), values(p), { key: `part:${part}:${p.PartKey}`, canDelete: true })}</details>`).join('')}
                    <details class="cu-row cu-add"><summary>+ Add</summary>${renderForm(this.partFields(part), blank, { key: `part:${part}:new`, saveLabel: 'Add' })}</details>
                </section>`;
        };
        // The roles it uses stay in the middle column under who holds them; stages and services
        // take the right-hand column.
        return section('role', 'Roles it uses', 'Which member-types roles this application recognises, and what it calls each.',
                (p) => ({ roleId: p.ListId, alias: p.Detail }), (p) => `${escapeHtml(p.Value)}${p.Detail ? ` · called ${escapeHtml(p.Detail)}` : ''}`, {})
            + '</div><div class="ps-stack">'
            + section('stage', 'Stages', 'The stages it deploys to, and its own name for each.',
                (p) => ({ stageId: p.ListId, name: p.Detail }), (p) => `${escapeHtml(p.Value)} · ${escapeHtml(p.Detail ?? '')}`, {})
            + section('service', 'Services', 'What it carries (health check, structured logging…), since when, in what state.',
                (p) => ({ serviceTypeId: p.ListId, startOn: p.StartOn, status: p.Status }), (p) => `${escapeHtml(p.Value)} · since ${escapeHtml(isoDate(p.StartOn))} · ${escapeHtml(p.Status)}`, { status: 'none' });
    }

    // ---- events ----

    bind() {
        for (const el of this.root.querySelectorAll('[data-go]')) {
            el.addEventListener('click', (e) => { e.preventDefault(); this.go(el.dataset.go); });
        }
        for (const b of this.root.querySelectorAll('[data-revoke]')) {
            b.addEventListener('click', () => {
                const [memberId, applicationId, roleId] = b.dataset.revoke.split(':').map(Number);
                this.write(() => this.api.revoke({ memberId, applicationId, roleId }), 'Revoked.', b.closest('section'));
            });
        }
        const [kind, id] = this.at.split(':');
        const app = this.root.querySelector('[data-form="app"]');
        app?.addEventListener('submit', (e) => {
            e.preventDefault();
            const v = Object.fromEntries(new FormData(app));
            this.write(() => this.api.saveApplication(kind === 'app' ? Number(id) : null, { ...v, applicationTypeId: Number(v.applicationTypeId) }),
                kind === 'app' ? 'Saved.' : 'Created.', app, (r) => `app:${r.key}`);
        });
        const member = this.root.querySelector('[data-form="member"]');
        member?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.write(() => this.api.saveMember(kind === 'member' ? Number(id) : null, Object.fromEntries(new FormData(member))),
                kind === 'member' ? 'Saved.' : 'Created.', member, (r) => `member:${r.key}`);
        });
        for (const form of this.root.querySelectorAll('form[data-record^="part:"]')) {
            const [, part, key] = form.dataset.record.split(':');
            const oldKey = key === 'new' ? null : Number(key);
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const body = { part, applicationId: Number(id), oldKey, ...toPayload(this.partFields(part), readForm(form)) };
                this.write(() => this.api.savePart(body), oldKey ? 'Saved.' : 'Added.', form);
            });
            form.querySelector('[data-delete]')?.addEventListener('click', (e) => {
                if (!this.armed(e.currentTarget)) return;
                this.write(() => this.api.deletePart({ part, applicationId: Number(id), oldKey }), 'Removed. The history keeps what it was.', form);
            });
        }
        for (const b of this.root.querySelectorAll('[data-delete-record]')) {
            b.addEventListener('click', () => {
                if (!this.armed(b)) return;
                const call = b.dataset.deleteRecord === 'application' ? () => this.api.deleteApplication(Number(id)) : () => this.api.deleteMember(Number(id));
                this.write(call, 'Deleted. The history keeps what it was.', b.closest('form'), () => (b.dataset.deleteRecord === 'application' ? 'applications' : 'members'));
            });
        }
        const grant = this.root.querySelector('[data-form="grant"]');
        grant?.addEventListener('submit', (e) => {
            e.preventDefault();
            const v = Object.fromEntries(new FormData(grant));
            const body = {
                memberId: Number(grant.dataset.member ?? v.memberId),
                applicationId: Number(grant.dataset.application ?? v.applicationId),
                roleId: Number(v.roleId),
            };
            this.write(() => this.api.grant(body), 'Granted.', grant);
        });
    }

    // Delete asks twice, inline: the first click arms the button, the second acts.
    armed(button) {
        if (button.textContent === 'Really delete?') return true;
        button.textContent = 'Really delete?';
        button.classList.add('is-armed');
        return false;
    }

    // Write, then read everything again (the lists are small), so the page shows what the tables hold.
    async write(call, done, near, next = null) {
        const status = near?.querySelector('[data-status]');
        if (status) { status.textContent = 'Saving…'; status.className = 'ps-form-status'; }
        try {
            const result = await call();
            this.flash = done;
            if (next) this.at = next(result);
            await this.load();
        } catch (e) {
            if (status) { status.textContent = e.message; status.className = 'ps-form-status is-error'; }
            else { this.flash = e.message; this.render(); }
        }
    }
}

export default new MembershipPage();
