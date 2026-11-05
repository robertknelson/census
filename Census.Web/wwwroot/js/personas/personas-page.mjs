import { fetchCalendar, fetchLeadTime, fetchMe, fetchMembers, fetchOrderViolations, fetchReleaseStatus, fetchStageMismatch, impersonate } from './personas-api.mjs';
import { fetchApplications, fetchApprovalVsProd, fetchBuildsSeen, fetchEvents, fetchHistory, fetchReadyToApprove, fetchStages, fetchWhereIsEverything } from '../moveit/moveit-api.mjs';
import { NAV, applicationsFor, navItem, trimNav } from './persona-nav.mjs';
import { GRAINS, grainOf, periodOf, shiftPeriod } from './period.mjs';
import { PeriodView } from './period-view.mjs';
import { NeedsView } from './needs-view.mjs';
import { BuildsView, DeploymentsView } from './drill-view.mjs';
import { escapeHtml } from '../moveit/format.mjs';
import divisionPage from '../moveit/division-page.mjs';
import featureAccessPage from '../feature-access/feature-access-page.mjs';
import membershipPage from '../membership/membership-page.mjs';
import resetPage from '../reset/reset-page.mjs';
import curatePage from '../curate/curate-page.mjs';
import usagePage from '../usage/usage-page.mjs';

// The persona UX shell (personas.md §7, slice P-2): the signed-in user sees the UX as their roles
// give it — the nav trimmed to their features, each view shown for the applications where it is on.
// A system administrator can act as any member (View as, census-on-apptrak.md §10): the server
// switches who requests run as, and a banner with Stop shows while it does. The item and the period
// live in the URL (?at=&on=, on being a day inside the period) so a screen can be linked.

const OVERVIEW = 'overview';
const LANDING = 'view.tracker';
// The feature access page (personas.md §6.1). Offered by a fixed rule, never by a feature, so it
// cannot be switched off from inside itself (FM2280 D7): system-administrator held on Census.
const ADMIN = 'admin.features';
const MEMBERSHIP = 'admin.membership';
const RESET = 'admin.reset';

// The data each built view reads, fetched once per page load.
const LOADERS = {
    period: async () => {
        const [releases, leads, calendar] = await Promise.all([fetchReleaseStatus(), fetchLeadTime(), fetchCalendar()]);
        return { releases, leads, calendar };
    },
    drill: async () => {
        const [calendar, buildsSeen, stages, releases] = await Promise.all([fetchCalendar(), fetchBuildsSeen(), fetchStages(), fetchReleaseStatus()]);
        return { calendar, buildsSeen, stages, releases };
    },
    needs: async () => {
        const [stages, applications, history, items, status, events, approvals, ready, violations, mismatches] = await Promise.all([
            fetchStages(), fetchApplications(), fetchHistory(), fetchWhereIsEverything(), fetchReleaseStatus(), fetchEvents(),
            fetchApprovalVsProd(), fetchReadyToApprove(), fetchOrderViolations(), fetchStageMismatch(),
        ]);
        return { stages, applications, history, items, status, events, approvals, ready, violations, mismatches };
    },
};

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
        this.estateApp = config.estateApplication ?? 'census';
        this.division = { shippedDays: config.shippedDays ?? 14, stepCaptions: config.stepCaptions ?? {} };
        this.needsSettings = { staleDays: config.staleDays ?? 14, comingDays: config.comingDays ?? 60 };
        this.usageFriction = config.usageFriction ?? {};
        this.sets = {};
        const params = new URLSearchParams(location.search);
        this.at = params.get('at');
        this.on = params.get('on');
        this.grain = params.get('g');
        this.load();
    }

    async load() {
        try {
            this.me = await fetchMe();
            this.members = this.me.canImpersonate ? await fetchMembers() : [];
        } catch (e) {
            this.root.innerHTML = `<p class="ps-error">${escapeHtml(e.message)}</p>`;
            return;
        }
        this.as = this.me.identifier;
        this.access = this.me.access;
        if (!this.access) {
            this.renderStranger();
            return;
        }
        this.nav = trimNav(NAV, this.access.features);
        if ((this.at === ADMIN || this.at === MEMBERSHIP || this.at === RESET) && !this.isAdmin()) this.at = null;
        if (this.at && this.at !== OVERVIEW && this.at !== ADMIN && this.at !== MEMBERSHIP && this.at !== RESET && (!navItem(this.nav, this.at) || navItem(this.nav, this.at).href)) this.at = null;
        if (!this.at) this.at = navItem(this.nav, LANDING) ? LANDING : OVERVIEW;
        this.render();
    }

    // View as: the server switches who this user's requests run as; the page reloads to show it everywhere.
    async actAs(identifier) {
        try {
            await impersonate(identifier === this.me.canonical.identifier ? null : identifier);
            location.reload();
        } catch (e) {
            this.root.querySelector('[data-ps="as-error"]')?.replaceChildren(document.createTextNode(e.message));
        }
    }

    // The header: who is signed in, who they act as, View as (offered by the server) and the banner with Stop.
    topHtml(who) {
        const me = this.me;
        const option = (m) => `<option value="${escapeHtml(m.identifier)}"${m.identifier === me.identifier ? ' selected' : ''}>${escapeHtml(m.name)} · ${escapeHtml(m.grants.map((g) => g.role).filter((r, i, a) => a.indexOf(r) === i).join(', ') || 'no roles')}</option>`;
        const others = this.members.filter((m) => m.identifier.toLowerCase() !== me.canonical.identifier.toLowerCase());
        return `
            <header class="ps-top${me.impersonating ? ' is-impersonating' : ''}">
                <span class="ps-brand">Census</span>
                ${who}
                ${me.impersonating ? `
                    <span class="ps-imp" title="You (${escapeHtml(me.canonical.name)}) are acting as ${escapeHtml(me.name)} (${escapeHtml(me.identifier)}). What you change is recorded as theirs, with you beside it.">
                        Impersonating <strong>${escapeHtml(me.name)}</strong>
                        <button type="button" class="ps-imp-stop" data-ps="stop">Stop</button>
                    </span>` : ''}
                ${me.canImpersonate ? `
                    <label class="ps-as">View as
                        <select data-ps="as">
                            <option value="${escapeHtml(me.canonical.identifier)}"${me.impersonating ? '' : ' selected'}>Yourself · ${escapeHtml(me.canonical.name)}</option>
                            ${others.map(option).join('')}
                        </select>
                    </label>
                    <span class="ps-as-error" data-ps="as-error"></span>` : ''}
            </header>`;
    }

    bindTop() {
        this.root.querySelector('[data-ps="as"]')?.addEventListener('change', (e) => this.actAs(e.target.value));
        this.root.querySelector('[data-ps="stop"]')?.addEventListener('click', () => this.actAs(this.me.canonical.identifier));
    }

    // Signed in, but not in AppTrak's membership: nothing to show but how to get in.
    renderStranger() {
        this.root.innerHTML = `
            <div class="ps-shell">
                ${this.topHtml(`<span class="ps-who"><strong>${escapeHtml(this.me.name)}</strong> <span class="ps-roles">not a member</span></span>`)}
                <div class="ps-body"><main class="ps-main"><section class="ps-section">
                    <p><strong>${escapeHtml(this.me.name)}</strong> (${escapeHtml(this.me.identifier)}) is not in AppTrak's membership, so there is nothing to show yet.
                    A system administrator adds members and their roles on Administer → Membership.</p>
                </section></main></div>
            </div>`;
        this.bindTop();
    }

    // Administer is offered when the signed-in user is a system administrator, decided on the server;
    // it carries through impersonation so the way out is always reachable.
    isAdmin() {
        return this.me.administer;
    }

    url() {
        const params = new URLSearchParams();
        if (this.at) params.set('at', this.at);
        if (this.at && this.on && grainOf(this.at)) params.set('on', this.on);
        if (this.at?.startsWith('drill.') && this.grain) params.set('g', this.grain);
        const here = new URLSearchParams(location.search);
        if (this.at === MEMBERSHIP && here.get('mb')) params.set('mb', here.get('mb'));
        if (this.at?.startsWith('curate.') && here.get('cu')) params.set('cu', here.get('cu'));
        return `${location.pathname}?${params}`;
    }

    render() {
        history.replaceState(null, '', this.url());
        this.view = null;
        const member = this.access.member;
        this.root.innerHTML = `
            <div class="ps-shell">
                ${this.topHtml(`<span class="ps-who"><strong>${escapeHtml(member.name)}</strong> <span class="ps-roles">${escapeHtml(grantsText(member.grants))}</span>${this.access.estate ? ' <span class="ps-tag">estate-wide</span>' : ''}</span>`)}
                <div class="ps-body">
                    <nav class="ps-nav" aria-label="Views">
                        <a class="ps-nav-item${this.at === OVERVIEW ? ' is-active' : ''}" href="#" data-at="${OVERVIEW}">Overview</a>
                        ${this.nav.map((g) => `
                            <div class="ps-nav-group">
                                <h2 class="ps-nav-h">${escapeHtml(g.group)}</h2>
                                ${g.items.map((i) => i.href
                                    ? `<a class="ps-nav-item is-out" href="${escapeHtml(i.href)}" title="${escapeHtml(i.hint)}">${escapeHtml(i.label)} <span aria-hidden="true">↗</span></a>`
                                    : `<a class="ps-nav-item${i.feature === this.at ? ' is-active' : ''}" href="#" data-at="${escapeHtml(i.feature)}" title="${escapeHtml(i.hint)}">${escapeHtml(i.label)}</a>`).join('')}
                            </div>`).join('')}
                        ${this.isAdmin() ? `
                            <div class="ps-nav-group">
                                <h2 class="ps-nav-h">Administer</h2>
                                <a class="ps-nav-item${this.at === MEMBERSHIP ? ' is-active' : ''}" href="#" data-at="${MEMBERSHIP}" title="Applications, members, and who holds which role where">Membership</a>
                                <a class="ps-nav-item${this.at === ADMIN ? ' is-active' : ''}" href="#" data-at="${ADMIN}" title="Which roles may use which features">Feature access</a>
                                <a class="ps-nav-item${this.at === RESET ? ' is-active' : ''}" href="#" data-at="${RESET}" title="Wipe what people have added, keep what was observed; undoable">Reset</a>
                            </div>` : ''}
                    </nav>
                    <main class="ps-main">
                        ${this.mainHtml()}
                    </main>
                </div>
            </div>`;

        this.bindTop();
        for (const a of this.root.querySelectorAll('[data-at]')) {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.at = a.dataset.at || OVERVIEW;
                // A nav click starts the page afresh: no place inside the last one.
                const here = new URLSearchParams(location.search);
                here.delete('cu');
                here.delete('mb');
                history.replaceState(null, '', `${location.pathname}?${here}`);
                this.render();
            });
        }
        this.view?.bind?.(this.root);
        for (const b of this.root.querySelectorAll('[data-grain]')) {
            b.addEventListener('click', () => {
                this.grain = b.dataset.grain;
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
        if (this.at === OVERVIEW) return this.overviewHtml();
        if (this.at === MEMBERSHIP) {
            this.view = {
                html: () => '<div id="membership" class="mb-root"></div>',
                bind: () => membershipPage.init({ root: '#membership', estate: this.estateApp }),
            };
            return this.view.html();
        }
        if (this.at === RESET) {
            this.view = {
                html: () => '<div id="reset" class="mb-root"></div>',
                bind: () => resetPage.init({ root: '#reset' }),
            };
            return this.view.html();
        }
        if (this.at === ADMIN) {
            // FM2280's page as it is, its API told who is making the change (the member viewed as).
            this.view = {
                html: () => '<div id="feature-access" class="fa ps-fa" data-api-base="/api/feature-access"></div>',
                bind: () => featureAccessPage.init({ root: '#feature-access', gateTags: false }),
            };
            return this.view.html();
        }
        if (this.at === LANDING) {
            // The pizza tracker is Move It's Division, embedded and fixed to the member's
            // applications (personas.md §5.0); it fetches its own data once mounted.
            const ids = applicationsFor(this.access, LANDING).map((a) => a.applicationId);
            this.view = { html: () => '<div id="moveit-root" class="ps-embed"></div>', bind: () => divisionPage.init({ rootId: 'moveit-root', embedded: true, applicationIds: ids, ...this.division }) };
            return this.view.html();
        }
        const view = this.viewFor(this.at);
        if (!view) return this.itemHtml();
        if (view.mount) {
            this.view = view.make();
            return this.view.html();
        }
        const set = this.sets[view.data];
        if (set?.error) return `<p class="ps-error">${escapeHtml(set.error)}</p>`;
        if (!set?.value) {
            this.loadSet(view.data);
            return '<p class="ps-none">Reading the ledger…</p>';
        }
        const applications = applicationsFor(this.access, this.at).map((a) => ({ applicationId: a.applicationId, name: a.name }));
        this.view = view.make(set.value, applications);
        return this.view.html();
    }

    // Which built view answers a nav item, and the data set it reads (LOADERS).
    viewFor(feature) {
        const grain = grainOf(feature);
        if (grain) {
            return {
                data: 'period',
                make: (data, applications) => {
                    const day = this.on ? new Date(`${this.on}T00:00:00`) : new Date();
                    this.period = periodOf(day, grain, this.fiscalStart);
                    return new PeriodView({ data, period: this.period, applications, fiscalStart: this.fiscalStart });
                },
            };
        }
        const drills = { 'drill.deployments': DeploymentsView, 'drill.builds': BuildsView };
        if (drills[feature]) {
            return {
                data: 'drill',
                make: (data, applications) => {
                    // The grains on offer are those on for the applications this drill-down covers.
                    const covered = applicationsFor(this.access, feature);
                    const grains = GRAINS.filter((g) => covered.some((a) => a.features.includes(`view.${g}`)));
                    const grain = grains.includes(this.grain) ? this.grain : grains.includes('month') ? 'month' : grains[0] ?? 'month';
                    const day = this.on ? new Date(`${this.on}T00:00:00`) : new Date();
                    this.period = periodOf(day, grain, this.fiscalStart);
                    return new drills[feature]({ data, period: this.period, applications, grains });
                },
            };
        }
        if (['curate.releases', 'curate.feature-sets', 'curate.associations', 'curate.events'].includes(feature)) {
            // The curate pages (personas.md §6.3.1) read their own data once mounted.
            return {
                mount: true,
                make: () => ({
                    html: () => '<div id="curate" class="cu-root"></div>',
                    bind: () => curatePage.init({
                        root: '#curate', feature, by: this.as,
                        applications: applicationsFor(this.access, feature).map((a) => ({ applicationId: a.applicationId, name: a.name })),
                    }),
                }),
            };
        }
        if (feature === 'view.usage') {
            // Usage (usage.md, U-4), mounted and scoped: the applications the member holds a role on, every one when
            // their role is estate-wide. It reads its own data.
            return {
                mount: true,
                make: () => ({
                    html: () => '<div id="usage" class="fa usage ps-usage"></div>',
                    bind: () => usagePage.init({
                        root: document.getElementById('usage'), embedded: true, fiscalStart: this.fiscalStart, friction: this.usageFriction,
                        only: this.access.estate ? null : applicationsFor(this.access, feature).map((a) => a.name),
                    }),
                }),
            };
        }
        if (feature === 'curate.queue') {
            return {
                data: 'needs',
                make: (data, applications) => new NeedsView({
                    data, settings: this.needsSettings, applications, access: this.access, by: this.as,
                    onChanged: () => { delete this.sets.needs; this.render(); },
                }),
            };
        }
        return null;
    }

    async loadSet(key) {
        if (this.sets[key]) return;
        this.sets[key] = {};
        try {
            this.sets[key].value = await LOADERS[key]();
        } catch (e) {
            this.sets[key].error = e.message;
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
        const columns = trimNav(NAV, features)
            .map((g) => ({ ...g, items: g.items.filter((i) => !i.href) }))
            .filter((g) => g.items.length > 0);
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
