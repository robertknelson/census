import { escapeHtml, isoDate } from './utils/format.mjs';
import { MembershipApi } from './membership-api.mjs';
import { describeAudit, findGaps, groupMembers } from './membership-model.mjs';
import { readForm, renderForm, toPayload } from './components/record-form.mjs';

// Census's membership page (gatehouse.md §7): AppTrak's applications, members, and who holds which role
// where. A landing page first — the counts, what needs a word, what changed lately — then the two
// lists and one page per application or member, where it is edited, its grants given or taken
// back, and it is deleted (asked twice). Every write is audited (membership.MembershipAudit). A
// grant on this application reaches its holder within Identity:SessionMinutes.
//
// The place inside the page rides in the URL as mb= (overview | applications | members | app:ID |
// member:ID | new-app | new-member), so a screen can be linked.

const DISPOSITIONS = ['current', 'retired'];

class MembershipPage {
    init(config = {}) {
        this.root = typeof config.root === 'string' ? document.querySelector(config.root) : config.root;
        this.api = new MembershipApi();
        this.application = config.application ?? 'gatehouse';
        this.at = new URLSearchParams(location.search).get('mb') ?? 'overview';
        this.flash = '';
        this.load();
    }

    async load() {
        this.root.innerHTML = '<p class="ps-none">Reading membership…</p>';
        try {
            const [applications, memberRows, lists, recent, parts, requests] = await Promise.all([this.api.applications(), this.api.members(), this.api.lists(), this.api.recent(), this.api.appParts(), this.api.requests()]);
            this.requests = requests;
            this.parts = parts;
            this.stages = lists.filter((l) => l.list === 'stages');
            this.serviceTypes = lists.filter((l) => l.list === 'service-types');
            this.applications = applications;
            this.members = groupMembers(memberRows);
            this.types = lists.filter((l) => l.list === 'application-types');
            this.roles = lists.filter((l) => l.list === 'member-types');
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
        else if (kind === 'requests') body = this.requestsHtml();
        else if (kind === 'app' || kind === 'new-app') body = await this.applicationHtml(kind === 'app' ? Number(id) : null);
        else if (kind === 'member' || kind === 'new-member') body = await this.memberHtml(kind === 'member' ? Number(id) : null);
        else body = this.overviewHtml();
        const tab = (at, label) => `<button type="button" class="mb-tab${kind === at || (at === 'applications' && kind.endsWith('app')) || (at === 'members' && kind.endsWith('member')) ? ' is-active' : ''}" data-go="${at}">${label}</button>`;
        this.root.innerHTML = `
            <div class="mb-page">
                <header class="mb-head">
                    <h2 class="mb-title">Membership</h2>
                    <nav class="mb-tabs">${tab('overview', 'Overview')}${tab('applications', `Applications <span class="mb-n">${this.applications.length}</span>`)}${tab('members', `Members <span class="mb-n">${this.members.length}</span>`)}${tab('requests', `Requests <span class="mb-n">${this.pending().length}</span>`)}</nav>
                </header>
                ${this.flash ? `<p class="mb-flash">${escapeHtml(this.flash)}</p>` : ''}
                ${body}
            </div>`;
        this.bind();
    }

    // ---- the landing page ----

    overviewHtml() {
        const gaps = findGaps({ applications: this.applications, members: this.members, application: this.application });
        const grants = this.members.reduce((n, m) => n + m.grants.length, 0);
        const retired = this.applications.filter((a) => a.disposition === 'retired').length;
        const tile = (n, label, go) => `<button type="button" class="ps-tile mb-tile" data-go="${go}"><span class="ps-tile-label">${label}</span><span class="ps-tile-value">${n}</span></button>`;
        const appLink = (a) => `<a href="#" class="ps-link" data-go="app:${a.applicationId}">${escapeHtml(a.name)}</a>`;
        const memberLink = (m) => `<a href="#" class="ps-link" data-go="member:${m.memberId}">${escapeHtml(m.name)}</a>`;
        const needs = [];
        const waiting = this.pending();
        if (waiting.length) needs.push(`<li><strong>${waiting.length} request${waiting.length === 1 ? '' : 's'} to join ${waiting.length === 1 ? 'is' : 'are'} waiting</strong>: ${waiting.map((r) => escapeHtml(`${r.firstName} ${r.lastName}`)).join(', ')}. <a href="#" class="ps-link" data-go="requests">Decide</a></li>`);
        if (gaps.hereMissing) needs.push(`<li><strong>This application is not registered</strong> (identifier <code>${escapeHtml(this.application)}</code>), so no one can hold a role on it. <a href="#" class="ps-link" data-go="new-app">Register it</a></li>`);
        else if (gaps.hereNobody) needs.push('<li><strong>No one is system-administrator here.</strong> Without one, only the configured list (Authorization:SystemAdministrators) reaches the administration.</li>');
        if (gaps.noRoles.length) needs.push(`<li><strong>${gaps.noRoles.length} member${gaps.noRoles.length === 1 ? ' holds' : 's hold'} no role anywhere</strong>, so ${gaps.noRoles.length === 1 ? 'sees' : 'see'} nothing: ${gaps.noRoles.map(memberLink).join(', ')}</li>`);
        if (gaps.nobodyOn.length) needs.push(`<li><strong>${gaps.nobodyOn.length} application${gaps.nobodyOn.length === 1 ? ' has' : 's have'} nobody</strong> holding a role: ${gaps.nobodyOn.map(appLink).join(', ')}</li>`);
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
                <span class="ps-list-end">${escapeHtml(isoDate(e.changedAt))} ${escapeHtml(new Date(e.changedAt).toTimeString().slice(0, 5))} · ${escapeHtml(e.changedBy)}</span></li>`).join('')}</ul>`;
    }

    // ---- the lists ----

    applicationsHtml() {
        const rows = [...this.applications].sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return `
            <section class="ps-section">
                <div class="mb-actions"><button type="button" class="ps-save" data-go="new-app">New application</button></div>
                <div class="ps-scroll"><table class="ps-table">
                    <thead><tr><th>Name</th><th>Identifier</th><th>Type</th><th>Disposition</th><th>Members</th><th>Tags</th></tr></thead>
                    <tbody>${rows.map((a) => `
                        <tr class="${a.disposition === 'retired' ? 'mb-retired' : ''}">
                            <td><a href="#" class="ps-link" data-go="app:${a.applicationId}">${escapeHtml(a.name)}</a></td>
                            <td class="ps-mono">${escapeHtml(a.identifier)}</td>
                            <td>${escapeHtml(a.applicationType ?? '—')}</td>
                            <td>${escapeHtml(a.disposition)}</td>
                            <td>${a.members}</td>
                            <td>${escapeHtml(a.tags ?? '')}</td>
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

    // ---- the requests to join (gatehouse.md §11.4) ----

    pending() {
        return this.requests.filter((r) => r.status === 'pending');
    }

    requestsHtml() {
        const appName = (id) => this.applications.find((a) => a.applicationId === id)?.name ?? `application ${id}`;
        const ids = (r) => { try { return JSON.parse(r.applicationIds); } catch { return []; } };
        const card = (r) => {
            const asked = ids(r);
            const head = `<p><strong>${escapeHtml(`${r.firstName} ${r.lastName}`)}</strong> <span class="ps-mono">${escapeHtml(r.windowsIdentity)}</span> · ${escapeHtml(r.email)} · asked ${escapeHtml(isoDate(r.requestedAt))}</p>
                <p>${escapeHtml(r.reason)}</p>
                <p class="ps-sub">Asks for <strong>${escapeHtml(r.role ?? '?')}</strong> on ${asked.map((id) => escapeHtml(appName(id))).join(', ')}</p>`;
            if (r.status !== 'pending') {
                return `<div class="rq-card">${head}<p class="ps-sub">${r.status === 'approved' ? 'Approved' : 'Declined'} by ${escapeHtml(r.decidedBy ?? '')} on ${escapeHtml(isoDate(r.decidedAt))}${r.decisionNote ? `: ${escapeHtml(r.decisionNote)}` : ''}</p></div>`;
            }
            return `<div class="rq-card">${head}
                <form class="rq-decide" data-request="${r.membershipRequestId}">
                    <select name="roleId" aria-label="Role to grant">${this.roles.map((x) => `<option value="${x.id}"${x.id === r.roleId ? ' selected' : ''}>${escapeHtml(x.identifier)}</option>`).join('')}</select>
                    ${asked.map((id) => `<label class="wl-check"><input type="checkbox" name="applicationIds" value="${id}" checked /> ${escapeHtml(appName(id))}</label>`).join('')}
                    <input type="text" name="note" maxlength="1000" placeholder="Note (required to decline)" aria-label="Note" />
                    <button type="submit" class="ps-save">Approve</button>
                    <button type="button" class="ps-cancel" data-decline>Decline</button>
                    <span class="ps-form-status" data-status></span>
                </form></div>`;
        };
        const waiting = this.pending();
        const decided = this.requests.filter((r) => r.status !== 'pending');
        return `
            <section class="ps-section">
                <h3 class="ps-h3">Waiting <span class="mb-n">${waiting.length}</span></h3>
                <p class="ps-sub">Approving makes them a member and grants the role on each application ticked; they see it at their next sign-in, within minutes.</p>
                ${waiting.length ? waiting.map(card).join('') : '<p class="ps-none">No request is waiting.</p>'}
            </section>
            <section class="ps-section">
                <h3 class="ps-h3">Decided</h3>
                ${decided.length ? decided.map(card).join('') : '<p class="ps-none">None yet.</p>'}
            </section>`;
    }

    // ---- one application, one member ----

    async applicationHtml(id) {
        const a = id ? this.applications.find((x) => x.applicationId === id) : null;
        if (id && !a) return '<p class="ps-error">That application is not in membership.Application.</p>';
        const option = (value, label, selected) => `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
        const form = `
            <form class="mb-form" data-form="app">
                <label>Name <input name="name" required maxlength="100" value="${escapeHtml(a?.name ?? '')}" /></label>
                <label>Identifier <input name="identifier" required maxlength="50" value="${escapeHtml(a?.identifier ?? '')}" placeholder="kebab-case" /></label>
                <label>Type <select name="applicationTypeId" required>${this.types.map((t) => option(t.id, t.display, t.id === a?.applicationTypeId)).join('')}</select></label>
                <label>Disposition <input name="disposition" required maxlength="30" list="mb-dispositions" value="${escapeHtml(a?.disposition ?? 'current')}" /></label>
                <label class="mb-wide">Tags <input name="tags" maxlength="510" value="${escapeHtml(a?.tags ?? '')}" /></label>
                <label class="mb-wide">Settings (JSON) <textarea name="settings" rows="3">${escapeHtml(a?.settings ?? '{ "settings":null}')}</textarea></label>
                <datalist id="mb-dispositions">${DISPOSITIONS.map((d) => `<option value="${d}"></option>`).join('')}</datalist>
                <div class="mb-wide mb-actions"><button type="submit" class="ps-save">${a ? 'Save' : 'Create'}</button>${a ? '<button type="button" class="ps-cancel cu-delete" data-delete-record="application">Delete</button>' : ''}<span class="ps-form-status" data-status></span></div>
            </form>`;
        if (!a) return `<section class="ps-section"><h3 class="ps-h3">New application</h3>${form}</section>`;
        const holders = this.members.flatMap((m) => m.grants.filter((g) => g.applicationId === id).map((g) => ({ m, g })))
            .sort((x, y) => x.g.role.localeCompare(y.g.role) || x.m.name.localeCompare(y.m.name));
        const history = await this.api.audit('application', id);
        return `
            <div class="ps-grid ps-grid-3"><div class="ps-stack">
            <section class="ps-section"><p class="ps-crumb"><a href="#" class="ps-link" data-go="applications">Applications</a></p><h3 class="ps-h">${escapeHtml(a.name)}</h3>${form}</section>
            <section class="ps-section"><h3 class="ps-h3">History</h3>${this.historyHtml(history, 'No change has been made to it from this page.')}</section>
            </div><div class="ps-stack">
            <section class="ps-section">
                <h3 class="ps-h3">Who holds a role here</h3>
                ${holders.length ? `<ul class="ps-list">${holders.map(({ m, g }) => `
                    <li><span class="ps-list-main"><a href="#" class="ps-link" data-go="member:${m.memberId}">${escapeHtml(m.name)}</a> · ${escapeHtml(g.role)}</span>
                        <button type="button" class="ps-cancel" data-revoke="${m.memberId}:${id}:${g.roleId}">Revoke</button></li>`).join('')}</ul>` : '<p class="ps-none">Nobody yet.</p>'}
                <form class="ps-form" data-form="grant" data-application="${id}">
                    <select name="memberId" required>${this.members.map((m) => option(m.memberId, `${m.name} (${m.identifier})`)).join('')}</select>
                    <select name="roleId" required>${this.roles.map((r) => option(r.id, r.identifier)).join('')}</select>
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
                    <li><span class="ps-list-main">${escapeHtml(g.role)} on <a href="#" class="ps-link" data-go="app:${g.applicationId}">${escapeHtml(g.application)}</a>${String(this.applications.find((a) => a.applicationId === g.applicationId)?.identifier).toLowerCase() === this.application.toLowerCase() ? ' <span class="ps-tag">here</span>' : ''}</span>
                        <button type="button" class="ps-cancel" data-revoke="${id}:${g.applicationId}:${g.roleId}">Revoke</button></li>`).join('')}</ul>` : '<p class="ps-none">No role anywhere: this member sees nothing.</p>'}
                <form class="ps-form" data-form="grant" data-member="${id}">
                    <select name="applicationId" required>${[...this.applications].sort((a, b) => String(a.name).localeCompare(String(b.name))).map((a) => option(a.applicationId, a.name)).join('')}</select>
                    <select name="roleId" required>${this.roles.map((r) => option(r.id, r.identifier)).join('')}</select>
                    <button type="submit" class="ps-save">Grant</button><span class="ps-form-status" data-status></span>
                </form>
            </section>
            </div></div>`;
    }

    // ---- an application's parts: the roles it uses, its stages, its services ----

    partFields(part) {
        const opts = (list) => list.map((x) => ({ value: x.id, label: x.identifier }));
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
        const mine = this.parts.filter((p) => p.applicationId === id);
        const section = (part, title, hint, values, summary, blank) => {
            const rows = mine.filter((p) => p.part === part);
            return `
                <section class="ps-section">
                    <h3 class="ps-h3">${title} <span class="mb-n">${rows.length}</span></h3>
                    <p class="ps-sub">${hint}</p>
                    ${rows.map((p) => `<details class="cu-row"><summary>${summary(p)}</summary>${renderForm(this.partFields(part), values(p), { key: `part:${part}:${p.partKey}`, canDelete: true })}</details>`).join('')}
                    <details class="cu-row cu-add"><summary>+ Add</summary>${renderForm(this.partFields(part), blank, { key: `part:${part}:new`, saveLabel: 'Add' })}</details>
                </section>`;
        };
        // The roles it uses stay in the middle column under who holds them; stages and services
        // take the right-hand column.
        return section('role', 'Roles it uses', 'Which member-types roles this application recognises, and what it calls each.',
                (p) => ({ roleId: p.listId, alias: p.detail }), (p) => `${escapeHtml(p.value)}${p.detail ? ` · called ${escapeHtml(p.detail)}` : ''}`, {})
            + '</div><div class="ps-stack">'
            + section('stage', 'Stages', 'The stages it deploys to, and its own name for each.',
                (p) => ({ stageId: p.listId, name: p.detail }), (p) => `${escapeHtml(p.value)} · ${escapeHtml(p.detail ?? '')}`, {})
            + section('service', 'Services', 'What it carries (health check, structured logging…), since when, in what state.',
                (p) => ({ serviceTypeId: p.listId, startOn: p.startOn, status: p.status }), (p) => `${escapeHtml(p.value)} · since ${escapeHtml(isoDate(p.startOn))} · ${escapeHtml(p.status)}`, { status: 'none' });
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
        for (const form of this.root.querySelectorAll('form[data-request]')) {
            const id = Number(form.dataset.request);
            const body = () => {
                const v = new FormData(form);
                return { roleId: Number(v.get('roleId')), applicationIds: v.getAll('applicationIds').map(Number), note: v.get('note') };
            };
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.write(() => this.api.approve(id, body()), 'Approved: a member now, with the roles ticked.', form);
            });
            form.querySelector('[data-decline]').addEventListener('click', () => {
                this.write(() => this.api.decline(id, body()), 'Declined. They see your note on their welcome page.', form);
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
