import { fetchAccess, fetchCalendar, fetchLeadTime, fetchMembers, fetchReleaseStatus } from './personas-api.mjs';
import { NAV, applicationsFor, navItem, trimNav } from './persona-nav.mjs';
import { grainOf, periodOf, shiftPeriod } from './period.mjs';
import { PeriodView } from './period-view.mjs';
import { escapeHtml } from '../moveit/format.mjs';

// The persona UX shell (personas.md §7, slice P-2): pick a member, see the UX as they would —
// the nav trimmed to their features, each view shown for the applications where it is on.
// The See items are the period view (P-3, period-view.mjs); the rest say they are not built
// yet and name their applications. The member, the item and the period live in the URL
// (?as=&at=&on=, on being a day inside the period) so a screen can be linked; the last member
// is remembered per browser as a convenience.

const MEMBER_KEY = 'personas.as';

function remembered() {
    try { return localStorage.getItem(MEMBER_KEY); } catch { return null; }
}

function remember(identifier) {
    try { localStorage.setItem(MEMBER_KEY, identifier); } catch { /* not remembered */ }
}

function localDay(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function grantsText(grants) {
    if (grants.length === 0) return 'no roles';
    const byRole = new Map();
    for (const g of grants) {
        if (!byRole.has(g.role)) byRole.set(g.role, []);
        byRole.get(g.role).push(g.application);
    }
    return [...byRole].map(([role, apps]) => `${role} on ${apps.join(', ')}`).join('; ');
}

class PersonasPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'personas-root');
        this.estate = config.estateName ?? 'Census';
        this.fiscalStart = config.fiscalStart ?? 1;
        const params = new URLSearchParams(location.search);
        this.as = params.get('as');
        this.at = params.get('at');
        this.on = params.get('on');
        this.load();
    }

    async load() {
        try {
            this.members = await fetchMembers();
        } catch (e) {
            this.root.innerHTML = `<p class="ps-error">${escapeHtml(e.message)}</p>`;
            return;
        }
        const known = (id) => this.members.some((m) => m.identifier === id);
        if (!known(this.as)) this.as = known(remembered()) ? remembered() : this.members[0]?.identifier;
        if (!this.as) {
            this.root.innerHTML = '<p class="ps-error">No members in membership.Member.</p>';
            return;
        }
        await this.show(this.as);
    }

    async show(identifier) {
        this.as = identifier;
        remember(identifier);
        try {
            this.access = await fetchAccess(identifier);
        } catch (e) {
            this.root.innerHTML = `<p class="ps-error">${escapeHtml(e.message)}</p>`;
            return;
        }
        this.nav = trimNav(NAV, this.access.features);
        if (this.at && !navItem(this.nav, this.at)) this.at = null;
        this.render();
    }

    url() {
        const params = new URLSearchParams({ as: this.as });
        if (this.at) params.set('at', this.at);
        if (this.at && this.on) params.set('on', this.on);
        return `${location.pathname}?${params}`;
    }

    render() {
        history.replaceState(null, '', this.url());
        const member = this.access.member;
        this.root.innerHTML = `
            <div class="ps-shell">
                <header class="ps-top">
                    <span class="ps-brand">Census <span class="ps-brand-sub">persona preview</span></span>
                    <label class="ps-as">View as
                        <select data-ps="as">
                            ${this.members.map((m) => `<option value="${escapeHtml(m.identifier)}"${m.identifier === this.as ? ' selected' : ''}>${escapeHtml(m.name)} · ${escapeHtml(m.grants.map((g) => g.role).filter((r, i, a) => a.indexOf(r) === i).join(', ') || 'no roles')}</option>`).join('')}
                        </select>
                    </label>
                </header>
                <div class="ps-body">
                    <nav class="ps-nav" aria-label="Views">
                        <a class="ps-nav-item${this.at ? '' : ' is-active'}" href="#" data-at="">Overview</a>
                        ${this.nav.map((g) => `
                            <div class="ps-nav-group">
                                <h2 class="ps-nav-h">${escapeHtml(g.group)}</h2>
                                ${g.items.map((i) => `<a class="ps-nav-item${i.feature === this.at ? ' is-active' : ''}" href="#" data-at="${escapeHtml(i.feature)}" title="${escapeHtml(i.hint)}">${escapeHtml(i.label)}</a>`).join('')}
                            </div>`).join('')}
                    </nav>
                    <main class="ps-main">
                        <div class="ps-who">
                            <h1 class="ps-name">${escapeHtml(member.name)}</h1>
                            <p class="ps-roles">${escapeHtml(grantsText(member.grants))}${this.access.estate ? ` <span class="ps-tag">estate-wide</span>` : ''}</p>
                        </div>
                        ${this.mainHtml()}
                    </main>
                </div>
            </div>`;

        this.root.querySelector('[data-ps="as"]').addEventListener('change', (e) => this.show(e.target.value));
        for (const a of this.root.querySelectorAll('[data-at]')) {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.at = a.dataset.at || null;
                this.render();
            });
        }
        for (const b of this.root.querySelectorAll('[data-shift]')) {
            b.addEventListener('click', () => {
                const n = b.dataset.shift;
                this.on = n === 'today' ? null : localDay(shiftPeriod(this.period, Number(n), this.fiscalStart).start);
                this.render();
            });
        }
    }

    mainHtml() {
        if (!this.at) return this.overviewHtml();
        const grain = grainOf(this.at);
        if (!grain) return this.itemHtml();
        if (this.dataError) return `<p class="ps-error">${escapeHtml(this.dataError)}</p>`;
        if (!this.data) {
            this.loadData();
            return '<p class="ps-none">Reading the ledger…</p>';
        }
        const day = this.on ? new Date(`${this.on}T00:00:00`) : new Date();
        this.period = periodOf(day, grain, this.fiscalStart);
        const applications = applicationsFor(this.access, this.at).map((a) => ({ applicationId: a.applicationId, name: a.name }));
        return new PeriodView({ data: this.data, period: this.period, applications, fiscalStart: this.fiscalStart }).html();
    }

    async loadData() {
        if (this.loading) return;
        this.loading = true;
        try {
            const [releases, leads, calendar] = await Promise.all([fetchReleaseStatus(), fetchLeadTime(), fetchCalendar()]);
            this.data = { releases, leads, calendar };
        } catch (e) {
            this.dataError = e.message;
        }
        this.render();
    }

    overviewHtml() {
        const { applications, features, estate, estateRoles } = this.access;
        if (features.length === 0) {
            const why = estateRoles.includes('observer')
                ? 'Observer is view only, and comes later (personas.md §4): nothing is granted to it yet.'
                : 'Nothing is granted to this member.';
            return `<p class="ps-empty">${escapeHtml(why)}</p>`;
        }
        const columns = trimNav(NAV, features);
        const scope = estate
            ? `Every application, ${applications.length}, through a role on ${escapeHtml(this.estate)}.`
            : `${applications.length} application${applications.length === 1 ? '' : 's'}, each at the depth of the role held on it.`;
        return `
            <section class="ps-section">
                <h2 class="ps-h">What this member sees</h2>
                <p class="ps-sub">${scope}</p>
                <div class="ps-scroll">
                    <table class="ps-matrix">
                        <thead>
                            <tr><th rowspan="2" class="ps-app-col">Application</th><th rowspan="2">Role here</th>${columns.map((g) => `<th colspan="${g.items.length}" class="ps-group-h">${escapeHtml(g.group)}</th>`).join('')}</tr>
                            <tr>${columns.flatMap((g) => g.items).map((i) => `<th class="ps-feature-h" title="${escapeHtml(i.feature)}">${escapeHtml(i.label)}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${applications.map((a) => `
                                <tr>
                                    <th scope="row" class="ps-app-col">${escapeHtml(a.name)}</th>
                                    <td class="ps-role">${escapeHtml(a.roles.join(', ') || (estate ? `via ${this.estate}` : ''))}</td>
                                    ${columns.flatMap((g) => g.items).map((i) => `<td class="ps-cell">${a.features.includes(i.feature) ? '<span class="ps-on" aria-label="on">●</span>' : '<span class="ps-off" aria-label="off">·</span>'}</td>`).join('')}
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </section>`;
    }

    itemHtml() {
        const item = navItem(this.nav, this.at);
        const apps = applicationsFor(this.access, this.at);
        return `
            <section class="ps-section">
                <p class="ps-crumb">${escapeHtml(item.group)}</p>
                <h2 class="ps-h">${escapeHtml(item.label)}</h2>
                <p class="ps-sub">${escapeHtml(item.hint)} · <code>${escapeHtml(item.feature)}</code></p>
                <h3 class="ps-h3">Shown for ${apps.length} application${apps.length === 1 ? '' : 's'}</h3>
                <ul class="ps-chips">${apps.map((a) => `<li class="ps-chip">${escapeHtml(a.name)}</li>`).join('')}</ul>
                <div class="ps-placeholder">This view is not built yet: it comes with the views themselves (personas.md §10, P-3).</div>
            </section>`;
    }
}

export default new PersonasPage();
