/**
 * usage-page.mjs
 * Usage (usage.md §4, slice U-1): how one application is used over a period. Overview figures against the previous
 * period, every page with its views, people, time on page, exits and failures (a page opens a drawer: where people
 * came from and went, what it is used for, who, recent sessions into Trace), and the people. The address keeps the
 * place (?application=&stage=&grain=&on=). Paths (U-2): from a page, the tree of where people went next, or how they
 * reached it. Friction (U-3): ranked signals, each opening its sessions. When (U-3): page loads by weekday and hour.
 */

import { escapeHtml, CLOSE_ICON } from '../feature-access/utils/dom.mjs';
import { isoDay, periodOf, shiftPeriod, spanText } from '../personas/period.mjs';
import { applicationsOf, commonEntry, daysOf, delta, duration, FRICTION_KINDS, frictionSignals, heatGrid, notUsed, pathTree, rate, scopeOf, sequencesOf, treeRows } from './usage-model.mjs';

const GRAINS = ['week', 'month', 'quarter'];
const n = (value) => Number(value ?? 0).toLocaleString();
const plural = (count, word) => `${n(count)} ${word}${count === 1 ? '' : 's'}`;
const localDay = (value) => isoDay(new Date(value));

class UsagePage {
    #api;
    #fiscalStart = 1;
    #frictionSettings = {};
    #openSignal = null;
    #heatCell = null;
    #root;
    #grain = 'month';
    #period;
    #applications = [];
    #scope = { application: null, stage: null };
    #data = null;
    #drawer = null;
    // The tree shows its first step; a line opens to the next (open holds the keys of open lines).
    #paths = { start: null, direction: 'after', depth: 3, selected: null, open: new Set() };

    init(config = {}) {
        this.#root = config.root;
        this.#api = (config.api ?? '/api/usage').replace(/\/$/, '');
        this.#fiscalStart = config.fiscalStart ?? 1;
        this.#frictionSettings = config.friction ?? {};
        const here = new URLSearchParams(location.search);
        if (GRAINS.includes(here.get('grain'))) this.#grain = here.get('grain');
        const on = /^\d{4}-\d{2}-\d{2}$/.test(here.get('on') ?? '') ? new Date(`${here.get('on')}T12:00:00`) : new Date();
        this.#period = periodOf(on, this.#grain, this.#fiscalStart);
        this.#scope = { application: here.get('application'), stage: here.has('stage') ? (here.get('stage') === 'all' ? '' : here.get('stage')) : undefined };
        this.#root.addEventListener('click', (event) => this.#onClick(event));
        this.#root.addEventListener('change', (event) => this.#onChange(event));
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') this.#closeDrawer(); });
        this.#load();
    }

    async #get(path, params) {
        const response = await fetch(`${this.#api}/${path}?${new URLSearchParams(params)}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message ?? `The server returned an error (${response.status}).`);
        return payload;
    }

    #window(period) {
        return { from: period.start.toISOString(), to: period.end.toISOString(), offset: String(-period.start.getTimezoneOffset()) };
    }

    #scopeParams(period) {
        return { application: this.#scope.application, ...(this.#scope.stage ? { stage: this.#scope.stage } : {}), ...this.#window(period) };
    }

    async #load() {
        this.#data = null;
        this.#closeDrawer();
        this.#render();
        try {
            const { from, to } = this.#window(this.#period);
            this.#applications = applicationsOf(await this.#get('applications', { from, to }));
            this.#scope = scopeOf(this.#applications, this.#scope);
            this.#setAddress();
            if (!this.#scope.application) {
                this.#data = { empty: true };
                this.#render();
                return;
            }
            const previous = shiftPeriod(this.#period, -1, this.#fiscalStart);
            const started = performance.now();
            const [overview, prevOverview, pages, prevPages, people, paths, friction, when] = await Promise.all([
                this.#get('overview', this.#scopeParams(this.#period)),
                this.#get('overview', this.#scopeParams(previous)),
                this.#get('pages', this.#scopeParams(this.#period)),
                this.#get('pages', this.#scopeParams(previous)),
                this.#get('people', this.#scopeParams(this.#period)),
                this.#get('paths', this.#scopeParams(this.#period)),
                this.#get('friction', this.#scopeParams(this.#period)),
                this.#get('when', this.#scopeParams(this.#period)),
            ]);
            const sequences = sequencesOf(paths.sequences);
            if (!pages.some((p) => p.page === this.#paths.start)) this.#paths = { ...this.#paths, start: commonEntry(sequences), selected: null, open: new Set() };
            this.#openSignal = null;
            this.#heatCell = null;
            this.#data = { overview, prevOverview, pages, prevPages, people, sequences, pathSessions: paths.sessions ?? 0, friction, when, previous, seconds: (performance.now() - started) / 1000 };
        } catch (error) {
            this.#data = { error: error.message };
        }
        this.#render();
    }

    #setAddress() {
        const params = new URLSearchParams({ grain: this.#grain, on: isoDay(this.#period.start) });
        if (this.#scope.application) params.set('application', this.#scope.application);
        params.set('stage', this.#scope.stage || 'all');
        history.replaceState(null, '', `${location.pathname}?${params}`);
    }

    #render() {
        const app = this.#applications.find((a) => a.application === this.#scope.application);
        this.#root.innerHTML = `
            <div class="usage-page">
                <header class="usage-bar">
                    <label class="usage-pick">Application
                        <select data-ref="application">${this.#applications.map((a) => `<option value="${escapeHtml(a.application)}"${a.application === this.#scope.application ? ' selected' : ''}>${escapeHtml(a.application)}</option>`).join('') || '<option>—</option>'}</select>
                    </label>
                    <label class="usage-pick">Stage
                        <select data-ref="stage">
                            <option value=""${!this.#scope.stage ? ' selected' : ''}>Every stage</option>
                            ${(app?.stages ?? []).map((s) => `<option value="${escapeHtml(s.stage)}"${s.stage === this.#scope.stage ? ' selected' : ''}>${escapeHtml(s.stage)}</option>`).join('')}
                        </select>
                    </label>
                    <div class="fa-segments" role="group" aria-label="Period">${GRAINS.map((g) => `<button type="button" class="fa-segment" data-grain="${g}" aria-pressed="${g === this.#grain}">${g}</button>`).join('')}</div>
                    <div class="usage-period">
                        <button type="button" class="fa-button fa-button--small" data-shift="-1" aria-label="Previous period">&lsaquo;</button>
                        <strong>${escapeHtml(this.#period.label)}</strong>
                        <button type="button" class="fa-button fa-button--small" data-shift="1" aria-label="Next period">&rsaquo;</button>
                        <span class="fa-muted">${escapeHtml(spanText(this.#period))}</span>
                    </div>
                </header>
                <nav class="usage-sections" aria-label="Sections">
                    <a href="#u-overview">Overview</a><a href="#u-pages">Pages</a><a href="#u-paths">Paths</a><a href="#u-friction">Friction</a><a href="#u-when">When</a><a href="#u-people">People</a>
                </nav>
                ${this.#body()}
            </div>
            <div class="fa-drawer-layer${this.#drawer ? ' is-open' : ''}">
                <div class="fa-drawer-backdrop" data-action="close"></div>
                <aside class="fa-drawer usage-drawer" role="dialog" aria-modal="true" aria-labelledby="usage-drawer-title">${this.#drawerHtml()}</aside>
            </div>`;
    }

    #body() {
        const d = this.#data;
        if (!d) return '<p class="fa-muted usage-wait">Reading the logs…</p>';
        if (d.error) return `<div class="fa-empty"><p>${escapeHtml(d.error)}</p></div>`;
        if (d.empty) return '<div class="fa-empty"><p>No requests from any application in this period.</p></div>';
        return `${this.#overview()}${this.#pages()}${this.#pathsSection()}${this.#frictionSection()}${this.#whenSection()}${this.#people()}
            <p class="fa-muted usage-foot">Computed from the log tables in ${d.seconds.toFixed(1)} s; the previous period is ${escapeHtml(d.previous.label)}.</p>`;
    }

    // goodWhenUp null: the change is shown without a verdict (fewer pages per session is neither good nor bad).
    #figure(label, value, change, { goodWhenUp = true, note = '' } = {}) {
        const tone = change.up == null || goodWhenUp == null ? '' : change.up === goodWhenUp ? ' is-good' : ' is-bad';
        return `<div class="usage-figure"><span class="usage-figure-label">${escapeHtml(label)}</span>
            <strong class="usage-figure-value">${value}</strong>
            <span class="usage-figure-delta${tone}">${escapeHtml(change.text)}</span>${note}</div>`;
    }

    #overview() {
        const { overview: o, prevOverview: p } = this.#data;
        const errorShare = o.sessions ? o.endedOnError / o.sessions : null;
        const prevShare = p.sessions ? p.endedOnError / p.sessions : null;
        const days = daysOf(this.#period, o.perDay);
        const most = Math.max(1, ...days.map((d) => d.people));
        const width = 100 / Math.max(1, days.length);
        return `
            <section class="usage-section" id="u-overview">
                <h2 class="usage-h">Overview</h2>
                <div class="usage-figures">
                    ${this.#figure('People', n(o.people), delta(o.people, p.people))}
                    ${this.#figure('Sessions', n(o.sessions), delta(o.sessions, p.sessions, { percent: true }))}
                    ${this.#figure('Median session', duration(o.medianSeconds), { text: p.medianSeconds == null ? '' : `was ${duration(p.medianSeconds)}`, up: null })}
                    ${this.#figure('Pages per session', o.pagesPerSession == null ? '–' : o.pagesPerSession.toFixed(1), delta(o.pagesPerSession, p.pagesPerSession), { goodWhenUp: null })}
                    ${this.#figure('Sessions ending on an error', errorShare == null ? '–' : rate(o.endedOnError, o.sessions),
                        { text: prevShare == null ? '' : `was ${rate(p.endedOnError, p.sessions)}`, up: prevShare == null || errorShare === prevShare ? null : errorShare > prevShare },
                        { goodWhenUp: false, note: o.endedOnError ? `<span class="fa-muted">${plural(o.endedOnError, 'session')}</span>` : '' })}
                </div>
                <figure class="usage-spark" aria-label="People per day">
                    <svg viewBox="0 0 100 24" preserveAspectRatio="none" role="img">
                        ${days.map((d, i) => `<rect x="${i * width + width * 0.1}" y="${24 - (d.people / most) * 22}" width="${width * 0.8}" height="${(d.people / most) * 22}"><title>${escapeHtml(`${d.day}: ${plural(d.people, 'person')}, ${plural(d.sessions, 'session')}`).replace('persons', 'people')}</title></rect>`).join('')}
                    </svg>
                    <figcaption class="fa-muted">People per day, ${escapeHtml(isoDay(this.#period.start))} to ${escapeHtml(isoDay(new Date(this.#period.end.getTime() - 86400000)))}; busiest ${n(most)}.</figcaption>
                </figure>
            </section>`;
    }

    #pages() {
        const { pages, prevPages } = this.#data;
        const gone = notUsed(prevPages, pages);
        return `
            <section class="usage-section" id="u-pages">
                <h2 class="usage-h">Pages <span class="fa-muted">${plural(pages.length, 'page')}; a page is the controller and action the app recorded</span></h2>
                ${pages.length ? `
                <table class="fa-matrix usage-table">
                    <thead><tr><th>Page</th><th>Views</th><th>People</th><th title="Median gap to the next page load">Time on page</th><th title="Sessions that started here">Entries</th><th title="Sessions that ended here">Exits</th><th>Calls</th><th>Failed</th><th>Refused</th><th>Slow</th></tr></thead>
                    <tbody>${pages.map((p) => `
                        <tr class="fa-row" data-page="${escapeHtml(p.page)}" tabindex="0">
                            <th scope="row"><button type="button" class="usage-link" data-page="${escapeHtml(p.page)}">${escapeHtml(p.page)}</button></th>
                            <td>${n(p.views)}</td><td>${n(p.people)}</td><td>${duration(p.medianSeconds)}</td>
                            <td>${rate(p.entries, p.views)}</td><td>${rate(p.exits, p.views)}</td><td>${n(p.calls)}</td>
                            <td class="${p.failed ? 'usage-bad' : ''}">${rate(p.failed, p.calls)}</td>
                            <td class="${p.refused ? 'usage-warn' : ''}">${rate(p.refused, p.calls)}</td>
                            <td>${rate(p.slow, p.calls)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>` : '<div class="fa-empty"><p>No page loads in this period.</p></div>'}
                ${gone.length ? `<p class="usage-gone"><strong>Not used this period</strong> (used in ${escapeHtml(this.#data.previous.label)}): ${gone.map((g) => `${escapeHtml(g.page)} <span class="fa-muted">${n(g.views)}</span>`).join(', ')}</p>` : ''}
            </section>`;
    }

    // Paths (§4.3): a next-step tree, not a Sankey. Every visit to the chosen page starts a path; each line is its share
    // of the line above; a line opens the sessions that took it, into Trace.
    #pathsSection() {
        const { pages, sequences, pathSessions } = this.#data;
        const { start, direction, depth, selected } = this.#paths;
        if (!start) return '<section class="usage-section" id="u-paths"><h2 class="usage-h">Paths</h2><div class="fa-empty"><p>No page loads in this period.</p></div></section>';
        const tree = pathTree(sequences, start, { depth, direction });
        const all = treeRows(tree);
        const parents = new Set(all.map((r) => r.key.slice(0, r.key.lastIndexOf('>'))).filter(Boolean));
        const rows = all.filter((r) => {
            const parent = r.key.slice(0, r.key.lastIndexOf('>'));
            return !parent || this.#paths.open.has(parent);
        });
        const picked = all.find((r) => r.key === selected);
        const capped = sequences.length < pathSessions;
        const arrow = direction === 'after' ? ' → ' : ' ← ';
        return `
            <section class="usage-section" id="u-paths">
                <h2 class="usage-h">Paths <span class="fa-muted">${direction === 'after' ? 'where people went next' : 'how people got there'}; every visit starts a path; each line is its share of the line above; ▸ opens the next step</span></h2>
                <div class="usage-path-controls">
                    <label class="usage-pick">${direction === 'after' ? 'From' : 'To'}
                        <select data-ref="path-start">${pages.map((p) => `<option value="${escapeHtml(p.page)}"${p.page === start ? ' selected' : ''}>${escapeHtml(p.page)} (${n(p.views)})</option>`).join('')}</select>
                    </label>
                    <div class="fa-segments" role="group" aria-label="Direction">
                        <button type="button" class="fa-segment" data-direction="after" aria-pressed="${direction === 'after'}">After</button>
                        <button type="button" class="fa-segment" data-direction="before" aria-pressed="${direction === 'before'}">Before</button>
                    </div>
                    <label class="usage-pick">Steps
                        <select data-ref="path-depth">${[2, 3, 4, 5].map((d) => `<option${d === depth ? ' selected' : ''}>${d}</option>`).join('')}</select>
                    </label>
                    <span class="fa-muted">${plural(tree.count, 'visit')} to ${escapeHtml(start)}${capped ? ` · read from the newest ${n(sequences.length)} of ${n(pathSessions)} sessions` : ''}</span>
                </div>
                <div class="usage-tree-wrap">
                    <ol class="usage-tree" aria-label="Path tree">
                        <li class="usage-tree-root"><strong>${escapeHtml(start)}</strong> <span class="fa-muted">${n(tree.count)}</span></li>
                        ${rows.map((r) => `
                            <li class="usage-tree-row${r.end ? ' is-end' : ''}${r.other ? ' is-other' : ''}${r.key === selected ? ' is-selected' : ''}" style="--level:${r.level}">
                                <button type="button" class="usage-tree-line" data-path-key="${escapeHtml(r.key)}" ${r.other ? 'disabled' : ''} title="${escapeHtml(r.other ? 'Pages under 5% each' : 'Show the sessions that took this path')}">
                                    <span class="usage-tree-label"><span class="usage-tree-caret" aria-hidden="true">${parents.has(r.key) ? (this.#paths.open.has(r.key) ? '▾' : '▸') : ''}</span>${direction === 'after' ? '→' : '←'} ${escapeHtml(r.page)}</span>
                                    <span class="usage-bar-track"><span class="usage-bar-fill" style="width:${Math.round(r.share * 100)}%"></span></span>
                                    <span class="usage-bar-value">${Math.round(r.share * 100)}% <span class="fa-muted">${n(r.count)}</span></span>
                                </button>
                            </li>`).join('')}
                    </ol>
                    <aside class="usage-tree-examples">${picked ? `
                        <h3 class="usage-h3">${escapeHtml(start)}${arrow}${escapeHtml(picked.key.split('>').slice(1).join(arrow))}</h3>
                        <p class="fa-muted">${plural(picked.count, 'visit')} took this path; ${picked.sessions.length < picked.count ? `the first ${picked.sessions.length} sessions` : 'their sessions'}, into Trace:</p>
                        <ul class="usage-examples">${picked.sessions.map((e) => `<li><a href="/trace?${escapeHtml(new URLSearchParams({ person: e.identifier ?? '', day: localDay(e.at), session: e.sessionId }))}">${escapeHtml(new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))} · ${escapeHtml(e.identifier ?? '')}</a></li>`).join('')}</ul>`
                        : '<p class="fa-muted">Pick a line to see the sessions that took it.</p>'}
                    </aside>
                </div>
            </section>`;
    }

    #sessionLinks(examples) {
        return `<ul class="usage-examples">${examples.map((e) => `<li><a href="/trace?${escapeHtml(new URLSearchParams({ person: e.identifier ?? '', day: localDay(e.at), session: e.sessionId }))}">${escapeHtml(new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))} · ${escapeHtml(e.identifier ?? '')}</a></li>`).join('')}</ul>`;
    }

    // Friction (§4.4): one sentence per signal, ranked by the sessions it touches; each opens its sessions.
    #frictionSection() {
        const signals = frictionSignals(this.#data.friction, this.#frictionSettings);
        return `
            <section class="usage-section" id="u-friction">
                <h2 class="usage-h">Friction <span class="fa-muted">where it may hurt, ranked by the sessions touched; a signal points at sessions, it is not a verdict</span></h2>
                ${signals.length ? `<ol class="usage-signals">${signals.map((x, i) => {
                    const key = `${x.kind}:${x.subject}`;
                    const open = this.#openSignal === key;
                    return `
                    <li class="usage-signal is-${x.kind}${open ? ' is-open' : ''}">
                        <span class="usage-signal-rank">${i + 1}</span>
                        <span class="usage-signal-kind">${escapeHtml(FRICTION_KINDS[x.kind])}</span>
                        <span class="usage-signal-text">${escapeHtml(x.text)}</span>
                        <button type="button" class="fa-button fa-button--small" data-signal="${escapeHtml(key)}" aria-expanded="${open}">${x.examples.length < x.sessions ? `latest ${n(x.examples.length)}` : plural(x.examples.length, 'session')}${open ? ' ▾' : ' ▸'}</button>
                        ${open ? `<div class="usage-signal-sessions">${this.#sessionLinks(x.examples)}</div>` : ''}
                    </li>`;
                }).join('')}</ol>` : '<div class="fa-empty"><p>No friction signals in this period.</p></div>'}
            </section>`;
    }

    // When (§4.5): page loads by weekday and hour in the browser's time; a cell opens its sessions.
    #whenSection() {
        const grid = heatGrid(this.#data.when);
        const picked = this.#heatCell ? grid[this.#heatCell.dow].hours[this.#heatCell.hour] : null;
        const hourLabel = (h) => new Date(2026, 0, 5, h).toLocaleTimeString([], { hour: 'numeric' });
        return `
            <section class="usage-section" id="u-when">
                <h2 class="usage-h">When <span class="fa-muted">page loads by weekday and hour, in this browser's time; darker is busier</span></h2>
                <div class="usage-when">
                    <table class="usage-heat" aria-label="Page loads by weekday and hour">
                        <thead><tr><th></th>${Array.from({ length: 24 }, (_, h) => `<th scope="col">${h % 3 === 0 ? escapeHtml(hourLabel(h)) : ''}</th>`).join('')}</tr></thead>
                        <tbody>${grid.map((day) => `
                            <tr><th scope="row">${day.label}</th>${day.hours.map((c) => `
                                <td><button type="button" class="usage-heat-cell${c === picked ? ' is-picked' : ''}" style="--heat:${c.level / 4}" data-heat="${c.dow}-${c.hour}" ${c.loads ? '' : 'disabled'}
                                    title="${escapeHtml(`${day.label} ${hourLabel(c.hour)}: ${plural(c.loads, 'page load')}, ${plural(c.sessions, 'session')}`)}" aria-label="${escapeHtml(`${day.label} ${hourLabel(c.hour)}: ${plural(c.loads, 'page load')}`)}"></button></td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>
                    <aside class="usage-tree-examples">${picked ? `
                        <h3 class="usage-h3">${escapeHtml(grid[picked.dow].label)} ${escapeHtml(hourLabel(picked.hour))}</h3>
                        <p class="fa-muted">${plural(picked.loads, 'page load')} in ${plural(picked.sessions, 'session')} by ${plural(picked.people, 'identifier')}; the latest, into Trace:</p>
                        ${this.#sessionLinks(picked.examples)}` : '<p class="fa-muted">Pick an hour to see the sessions in it.</p>'}
                    </aside>
                </div>
            </section>`;
    }

    #people() {
        const { people } = this.#data;
        return `
            <section class="usage-section" id="u-people">
                <h2 class="usage-h">People <span class="fa-muted">${plural(people.length, 'identifier')}; roles as the app logged them</span></h2>
                ${people.length ? `
                <table class="fa-matrix usage-table">
                    <thead><tr><th>Identifier</th><th>Roles</th><th>Sessions</th><th>Days</th><th>Pages</th><th>Requests</th><th>Failed</th><th>Refused</th><th>Last seen</th></tr></thead>
                    <tbody>${people.map((p) => `
                        <tr class="fa-row">
                            <th scope="row"><a class="usage-link" href="/trace?${escapeHtml(new URLSearchParams({ person: p.identifier, day: localDay(p.lastSeen) }))}" title="Their last day in Trace">${escapeHtml(p.identifier)}</a></th>
                            <td class="fa-muted">${escapeHtml(p.roles ?? '')}</td>
                            <td>${n(p.sessions)}</td><td>${n(p.days)}</td><td>${n(p.pages)}</td><td>${n(p.requests)}</td>
                            <td class="${p.failed ? 'usage-bad' : ''}">${n(p.failed)}</td>
                            <td class="${p.refused ? 'usage-warn' : ''}">${n(p.refused)}</td>
                            <td>${escapeHtml(new Date(p.lastSeen).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>` : '<div class="fa-empty"><p>Nobody signed in used it in this period.</p></div>'}
            </section>`;
    }

    // The page drawer (§4.2): came from and went to, what the page is used for, who, recent sessions.
    async #openPage(page) {
        this.#drawer = { page, loading: true };
        this.#render();
        try {
            this.#drawer = { page, detail: await this.#get('page', { ...this.#scopeParams(this.#period), page }) };
        } catch (error) {
            this.#drawer = { page, error: error.message };
        }
        this.#render();
        this.#root.querySelector('.usage-drawer [data-action="close"]')?.focus();
    }

    #closeDrawer() {
        if (!this.#drawer) return;
        this.#drawer = null;
        this.#render();
    }

    #bars(rows) {
        const total = rows.reduce((sum, r) => sum + r.count, 0) || 1;
        return `<ol class="usage-bars">${rows.map((r) => `
            <li><span class="usage-bar-label" title="${escapeHtml(r.page)}">${escapeHtml(r.page)}</span>
                <span class="usage-bar-track"><span class="usage-bar-fill" style="width:${(r.count / total) * 100}%"></span></span>
                <span class="usage-bar-value">${rate(r.count, total)} <span class="fa-muted">${n(r.count)}</span></span></li>`).join('')}</ol>`;
    }

    #drawerHtml() {
        if (!this.#drawer) return '';
        const { page, detail, loading, error } = this.#drawer;
        const head = `
            <header class="fa-drawer-head">
                <div><h2 id="usage-drawer-title">${escapeHtml(page)}</h2>
                    <p class="fa-muted">${escapeHtml(this.#scope.application)} ${escapeHtml(this.#scope.stage ?? 'every stage')} · ${escapeHtml(this.#period.label)}</p></div>
                <button type="button" class="fa-icon-button" data-action="close" aria-label="Close">${CLOSE_ICON}</button>
            </header>`;
        if (loading) return `${head}<div class="fa-drawer-body"><p class="fa-muted">Reading…</p></div>`;
        if (error) return `${head}<div class="fa-drawer-body"><div class="fa-empty"><p>${escapeHtml(error)}</p></div></div>`;
        return `${head}
            <div class="fa-drawer-body">
                <section class="fa-section"><h3 class="usage-h3">Came from</h3>${this.#bars(detail.cameFrom ?? [])}</section>
                <section class="fa-section"><h3 class="usage-h3">Went to</h3>${this.#bars(detail.wentTo ?? [])}</section>
                <section class="fa-section"><h3 class="usage-h3">Used for <span class="fa-muted">the calls made on this page</span></h3>
                    <table class="usage-calls"><thead><tr><th>Call</th><th>Count</th><th>Failed</th><th>Refused</th><th>Slow</th></tr></thead>
                    <tbody>${(detail.calls ?? []).map((c) => `<tr><td><span class="usage-method">${escapeHtml(c.method)}</span> ${escapeHtml(c.call)}</td><td>${n(c.count)}</td>
                        <td class="${c.failed ? 'usage-bad' : ''}">${n(c.failed)}</td><td class="${c.refused ? 'usage-warn' : ''}">${n(c.refused)}</td><td>${n(c.slow)}</td></tr>`).join('')
                        || '<tr><td colspan="5" class="fa-muted">No calls from this page.</td></tr>'}</tbody></table></section>
                <section class="fa-section"><h3 class="usage-h3">Who</h3>
                    <p>${(detail.people ?? []).map((p) => `<span class="usage-who">${escapeHtml(p.identifier)} <span class="fa-muted">${n(p.views)}</span></span>`).join(' ')}</p></section>
                <section class="fa-section"><h3 class="usage-h3">Recent sessions <span class="fa-muted">open in Trace at this session</span></h3>
                    <ul class="usage-examples">${(detail.examples ?? []).map((e) => `<li><a href="/trace?${escapeHtml(new URLSearchParams({ person: e.identifier, day: localDay(e.at), session: e.sessionId }))}">${escapeHtml(new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))} · ${escapeHtml(e.identifier)}</a></li>`).join('')}</ul></section>
            </div>`;
    }

    #onClick(event) {
        const target = event.target.closest('[data-grain], [data-shift], [data-page], [data-action], [data-direction], [data-path-key], [data-signal], [data-heat]');
        if (!target) return;
        if (target.dataset.signal) {
            this.#openSignal = this.#openSignal === target.dataset.signal ? null : target.dataset.signal;
            return this.#render();
        }
        if (target.dataset.heat) {
            const [dow, hour] = target.dataset.heat.split('-').map(Number);
            this.#heatCell = this.#heatCell?.dow === dow && this.#heatCell?.hour === hour ? null : { dow, hour };
            return this.#render();
        }
        if (target.dataset.direction) {
            this.#paths = { ...this.#paths, direction: target.dataset.direction, selected: null, open: new Set() };
            return this.#render();
        }
        if (target.dataset.pathKey) {
            const key = target.dataset.pathKey;
            const open = new Set(this.#paths.open);
            if (open.has(key)) open.delete(key); else open.add(key);
            this.#paths = { ...this.#paths, selected: key, open };
            return this.#render();
        }
        if (target.dataset.action === 'close') return this.#closeDrawer();
        if (target.dataset.page) return this.#openPage(target.dataset.page);
        if (target.dataset.grain) {
            this.#grain = target.dataset.grain;
            this.#period = periodOf(this.#period.start, this.#grain, this.#fiscalStart);
        } else {
            this.#period = shiftPeriod(this.#period, Number(target.dataset.shift), this.#fiscalStart);
        }
        this.#load();
    }

    #onChange(event) {
        const ref = event.target.dataset.ref;
        if (ref === 'path-start' || ref === 'path-depth') {
            this.#paths = ref === 'path-start'
                ? { ...this.#paths, start: event.target.value, selected: null, open: new Set() }
                : { ...this.#paths, depth: Number(event.target.value), selected: null };
            return this.#render();
        }
        if (ref === 'application') this.#scope = { application: event.target.value, stage: undefined };
        else if (ref === 'stage') this.#scope = { ...this.#scope, stage: event.target.value };
        else return;
        this.#load();
    }
}

export default new UsagePage();
