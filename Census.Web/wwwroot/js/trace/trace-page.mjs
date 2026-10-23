/**
 * trace-page.mjs
 * Trace (log-explorer-and-trace.md §5, ported from xf-dashboard's support-tooling.md S2/S2b): pick an identifier and a
 * day; the month above is the day's navigator, the day's sessions sit on a strip across the hours, and a session
 * opens as a timeline grouped by page. Writes carry their stored request body, errors sit where they happened, quiet
 * stretches are marked idle. Copy trace (JSON) and Download hand the whole of it to whoever is debugging. The address
 * keeps the choice (?person=&day=&session=), so a trace can be sent.
 */

import { escapeHtml } from '../feature-access/utils/dom.mjs';
import { buildTimeline, describeAction, copyPayload, copyDayPayload, stripHours, browserName, buildMonthGrid, monthTotals, MONTH_LEVELS } from './trace-model.mjs';

const SHELL = `
    <div class="trace-page">
        <form class="trace-toolbar" data-ref="form">
            <label class="trace-field">Identifier
                <input list="trace-people" data-ref="person" autocomplete="off" spellcheck="false" placeholder="Login" required>
                <datalist id="trace-people" data-ref="people"></datalist>
            </label>
            <label class="trace-field">Day <input type="date" data-ref="day" required></label>
            <button type="submit" class="fa-button fa-button--primary">Show day</button>
            <span class="trace-toolbar-gap"></span>
            <button type="button" class="fa-button" data-action="copy" disabled>Copy trace (JSON)</button>
            <button type="button" class="fa-button" data-action="download" disabled>Download</button>
            <span class="trace-copied fa-muted" data-ref="copied" role="status"></span>
        </form>
        <section data-ref="month-view"></section>
        <section data-ref="day-view"></section>
        <section data-ref="session-view"></section>
    </div>`;

const time = value => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const shortTime = value => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const localDay = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

class TracePage {
    #api;
    #refs = {};
    #people = [];
    #peopleMonth = null;
    #day = null;
    #month = null;
    #session = null;

    init(config = {}) {
        const root = config.root ?? document.getElementById('trace');
        this.#api = (config.api ?? root.dataset.api).replace(/\/$/, '');
        root.innerHTML = SHELL;
        root.querySelectorAll('[data-ref]').forEach(element => { this.#refs[element.dataset.ref] = element; });

        this.#refs.form.addEventListener('submit', event => {
            event.preventDefault();
            this.#showDay(this.#refs.person.value.trim(), this.#refs.day.value);
        });
        this.#refs.day.addEventListener('change', () => this.#loadPeople());
        root.addEventListener('click', event => this.#onClick(event));

        const params = new URLSearchParams(location.search);
        this.#refs.day.value = params.get('day') ?? localDay(new Date());
        if (params.get('person')) this.#refs.person.value = params.get('person');
        this.#loadPeople();
        if (params.get('person')) this.#showDay(params.get('person'), this.#refs.day.value, params.get('session'));
        else if (params.get('session')) this.#showSession(params.get('session'));
    }

    async #get(path) {
        const response = await fetch(this.#api + path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message ?? `The server returned an error (${response.status}).`);
        return payload;
    }

    // The picker offers who was there in the day's month, busiest first (calls-made-for-you, 2026-10-23).
    async #loadPeople() {
        const [year, month] = (this.#refs.day.value || localDay(new Date())).split('-').map(Number);
        const key = `${year}-${month}`;
        if (this.#peopleMonth === key) return;
        this.#peopleMonth = key;
        try {
            const params = new URLSearchParams({ from: new Date(year, month - 1, 1).toISOString(), to: new Date(year, month, 1).toISOString() });
            this.#people = await this.#get(`/people?${params}`) ?? [];
            this.#refs.people.innerHTML = this.#people.map(p => `<option value="${escapeHtml(p.identifier)}">${escapeHtml(`${p.requests} requests · ${p.applications}`)}</option>`).join('');
        } catch {
            // The picker still takes a typed identifier.
        }
    }

    #setAddress(params) {
        const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value));
        history.replaceState(null, '', `${location.pathname}?${search}`);
    }

    async #showDay(identifier, day, sessionId = null) {
        if (!identifier || !day) return;
        const start = new Date(`${day}T00:00:00`);
        const end = new Date(start); end.setDate(end.getDate() + 1);
        this.#refs['day-view'].innerHTML = '<p class="fa-muted">Loading the day…</p>';
        this.#ensureMonth(identifier, day);
        this.#refs['session-view'].innerHTML = '';
        this.#session = null;
        this.#setAddress({ person: identifier, day });
        try {
            const params = new URLSearchParams({ person: identifier, from: start.toISOString(), to: end.toISOString() });
            this.#day = { identifier, sessions: await this.#get(`/day?${params}`) ?? [], dayLabel: day, start };
            this.#renderDay();
            if (sessionId) this.#showSession(sessionId);
        } catch (error) {
            this.#refs['day-view'].innerHTML = `<div class="fa-empty"><p>${escapeHtml(error.message)}</p></div>`;
        }
        this.#syncButtons();
    }

    // The month: the grid the day is picked from. Loaded when the identifier or the month changes; the arrows move a
    // month and keep the identifier; a cell sets the day and shows it below.
    async #ensureMonth(identifier, day) {
        const [year, month] = day.split('-').map(Number);
        if (this.#month && this.#month.identifier === identifier && this.#month.year === year && this.#month.month === month) {
            this.#renderMonth();
            return;
        }
        await this.#loadMonth(identifier, year, month);
    }

    async #loadMonth(identifier, year, month) {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);
        this.#month = { identifier, year, month, days: [], loading: true };
        this.#renderMonth();
        try {
            const params = new URLSearchParams({ person: identifier, from: start.toISOString(), to: end.toISOString(), offset: String(-start.getTimezoneOffset()) });
            this.#month = { identifier, year, month, days: await this.#get(`/month?${params}`) ?? [] };
        } catch (error) {
            this.#month = { identifier, year, month, days: [], error: error.message };
        }
        this.#renderMonth();
    }

    #renderMonth() {
        if (!this.#month) { this.#refs['month-view'].innerHTML = ''; return; }
        const { identifier, year, month, days, loading, error } = this.#month;
        const selected = this.#refs.day.value;
        const weeks = buildMonthGrid(year, month, days, selected);
        const totals = monthTotals(days);
        const name = new Date(year, month - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const cellTitle = c => c.inMonth
            ? `${new Date(`${c.day}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${plural(c.requests, 'request')} · ${plural(c.writes, 'write')} · ${plural(c.errors, 'error')} · ${plural(c.sessions, 'session')}`
            : '';

        this.#refs['month-view'].innerHTML = `
            <section class="trace-month" aria-label="${escapeHtml(identifier)}'s month">
                <header class="trace-month-head">
                    <button type="button" class="fa-button fa-button--small" data-action="month-prev" aria-label="Previous month">&lsaquo;</button>
                    <h3>${escapeHtml(name)}</h3>
                    <button type="button" class="fa-button fa-button--small" data-action="month-next" aria-label="Next month">&rsaquo;</button>
                    <p class="fa-muted">${loading ? 'Loading the month…' : error ? `<span class="trace-bad">${escapeHtml(error)}</span>`
                        : `${plural(totals.daysActive, 'day')} active · ${plural(totals.requests, 'request')} · ${plural(totals.writes, 'write')} ·
                           <span class="${totals.errors ? 'trace-bad' : ''}">${plural(totals.errors, 'error')}</span>`}</p>
                </header>
                <div class="trace-month-grid" role="grid">
                    ${weekdays.map(w => `<span class="trace-month-weekday">${w}</span>`).join('')}
                    ${weeks.flat().map(c => c.inMonth
                        ? `<button type="button" class="trace-cell${c.selected ? ' is-selected' : ''}${c.errors ? ' has-errors' : ''}"
                                style="--trace-level:${c.level / MONTH_LEVELS}" data-action="pick-day" data-day="${c.day}" title="${escapeHtml(cellTitle(c))}" aria-label="${escapeHtml(cellTitle(c))}">
                                <span class="trace-cell-date">${c.date}</span>
                                ${c.writes ? `<span class="trace-cell-writes">${c.writes}</span>` : ''}
                                ${c.errors ? '<i class="trace-cell-error" aria-hidden="true"></i>' : ''}
                            </button>`
                        : '<span class="trace-cell is-out" aria-hidden="true"></span>').join('')}
                </div>
            </section>`;
    }

    #renderDay() {
        const { identifier, sessions, start, dayLabel } = this.#day;
        const totals = sessions.reduce((sum, s) => ({ requests: sum.requests + s.requests, writes: sum.writes + s.writes, errors: sum.errors + s.errors + s.failedRequests, refused: sum.refused + (s.refused ?? 0) }),
            { requests: 0, writes: 0, errors: 0, refused: 0 });
        const applications = [...new Set(sessions.map(s => s.application).filter(Boolean))];
        const { first, last } = stripHours(sessions, start);
        const span = (last - first) * 3600000;
        const offset = value => ((new Date(value) - start - first * 3600000) / span) * 100;
        const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
        const label = h => new Date(start.getTime() + h * 3600000).toLocaleTimeString([], { hour: 'numeric' });

        this.#refs['day-view'].innerHTML = `
            <header class="trace-head">
                <h2 class="trace-name">${escapeHtml(identifier)}</h2>
                ${applications.length ? `<p class="trace-roles">${applications.map(a => `<a class="trace-role" href="/usage?${escapeHtml(new URLSearchParams({ application: a, grain: 'month', on: dayLabel }))}" title="How ${escapeHtml(a)} is used">${escapeHtml(a)} ↗</a>`).join('')}</p>` : ''}
                <p class="trace-summary">${escapeHtml(new Date(`${dayLabel}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))}:
                    ${plural(sessions.length, 'session')} · ${plural(totals.requests, 'request')} · ${plural(totals.writes, 'write')} ·
                    <span class="${totals.errors ? 'trace-bad' : ''}">${plural(totals.errors, 'error')}</span>
                    ${totals.refused ? ` · <span class="trace-bad">${totals.refused} refused</span>` : ''}</p>
            </header>
            ${sessions.length ? `
            <div class="trace-strip" role="list" aria-label="Sessions across the day">
                <div class="trace-strip-hours">${hours.map(h => `<span style="left:${((h - first) / (last - first)) * 100}%">${escapeHtml(label(h))}</span>`).join('')}</div>
                <div class="trace-strip-band" style="--trace-hours:${last - first}">
                    ${sessions.map(s => `
                        <button type="button" role="listitem" class="trace-bar${s.errors + s.failedRequests ? ' has-errors' : ''}" data-action="session" data-session="${escapeHtml(s.sessionId)}"
                            style="left:${offset(s.startAt)}%;width:max(6px, ${offset(s.endAt ?? s.startAt) - offset(s.startAt)}%)"
                            title="${escapeHtml(`${s.application ?? ''} · ${shortTime(s.startAt)} to ${shortTime(s.endAt ?? s.startAt)} · ${plural(s.requests, 'request')}, ${plural(s.writes, 'write')}`)}">
                            ${(s.failuresAt ?? []).map(f => `<i class="trace-tick" style="left:${((new Date(f.at) - new Date(s.startAt)) / Math.max(1, new Date(s.endAt ?? s.startAt) - new Date(s.startAt))) * 100}%"></i>`).join('')}
                        </button>`).join('')}
                </div>
            </div>
            <table class="trace-sessions">
                <thead><tr><th>From</th><th>To</th><th>Application</th><th>Requests</th><th>Writes</th><th>Refused</th><th>Errors</th><th>Browser</th><th></th></tr></thead>
                <tbody>${sessions.map(s => `
                    <tr data-session-row="${escapeHtml(s.sessionId)}">
                        <td>${escapeHtml(shortTime(s.startAt))}</td><td>${escapeHtml(shortTime(s.endAt ?? s.startAt))}</td>
                        <td>${escapeHtml(s.application ?? '')} <span class="trace-app">${escapeHtml(s.stage ?? '')}</span></td>
                        <td>${s.requests}</td><td>${s.writes}</td>
                        <td class="${s.refused ? 'trace-bad' : ''}">${s.refused ?? 0}</td>
                        <td class="${s.errors + s.failedRequests ? 'trace-bad' : ''}">${s.errors + s.failedRequests}</td>
                        <td>${escapeHtml([browserName(s.browser) || s.browser, s.platform].filter(Boolean).join(' · '))}</td>
                        <td><button type="button" class="fa-button fa-button--small" data-action="session" data-session="${escapeHtml(s.sessionId)}">Open</button></td>
                    </tr>`).join('')}
                </tbody>
            </table>` : '<div class="fa-empty"><p>No requests from this identifier on this day.</p></div>'}`;
    }

    async #showSession(sessionId) {
        this.#refs['session-view'].innerHTML = '<p class="fa-muted">Loading the session…</p>';
        this.#refs['day-view'].querySelectorAll('[data-session-row]').forEach(row => row.classList.toggle('is-current', row.dataset.sessionRow === sessionId));
        this.#refs['day-view'].querySelectorAll('.trace-bar').forEach(bar => bar.classList.toggle('is-current', bar.dataset.session === sessionId));
        const params = new URLSearchParams(location.search);
        params.set('session', sessionId);
        this.#setAddress(Object.fromEntries(params));
        try {
            const trace = await this.#get(`/session?${new URLSearchParams({ id: sessionId })}`);
            const identifier = (trace.requests ?? []).map(r => r.identifier).find(value => value && value !== 'na') ?? null;
            this.#session = { ...trace, sessionId, identifier, limit: (trace.requests ?? []).length };
            this.#renderSession();
            this.#refs['session-view'].scrollIntoView({ block: 'start', behavior: 'smooth' });
        } catch (error) {
            this.#refs['session-view'].innerHTML = `<div class="fa-empty"><p>${escapeHtml(error.message)}</p></div>`;
        }
        this.#syncButtons();
    }

    #renderSession() {
        const trace = this.#session;
        const { groups, counts } = buildTimeline(trace);
        const truncated = trace.totalRequests > (trace.requests ?? []).length;
        const first = groups[0]?.page?.at ?? groups[0]?.lines[0]?.at;
        const lastGroup = groups.at(-1);
        const last = lastGroup?.lines.at(-1)?.at ?? lastGroup?.page?.at;
        const where = (trace.requests ?? [])[0];

        this.#refs['session-view'].innerHTML = `
            <header class="trace-session-head">
                <h3>Session ${first ? `${escapeHtml(shortTime(first))} to ${escapeHtml(shortTime(last))}` : ''}
                    ${trace.identifier ? `· ${escapeHtml(trace.identifier)}` : ''}
                    ${where?.application ? `<span class="trace-app">${escapeHtml(where.application)} ${escapeHtml(where.stage ?? '')}</span>` : ''}</h3>
                <p class="fa-muted">${plural(counts.pages, 'page')} · ${plural(counts.requests, 'request')} · ${plural(counts.writes, 'write')} ·
                    <span class="${counts.errors + counts.failed ? 'trace-bad' : ''}">${plural(counts.errors + counts.failed, 'error')}</span>
                    ${counts.refused ? ` · <span class="trace-bad">${counts.refused} refused</span>` : ''}
                    ${truncated ? ` · <strong>showing the newest ${trace.requests.length} of ${trace.totalRequests} requests</strong>` : ''}
                    · <code class="trace-id">${escapeHtml(trace.sessionId)}</code>
                    · <a href="/logs?${escapeHtml(new URLSearchParams({ session: trace.sessionId, ...(first ? { day: localDay(first) } : {}) }))}">In Log Explorer</a></p>
                ${groups.length ? `<div class="fa-actions trace-fold">
                    <button type="button" class="fa-button fa-button--small" data-action="expand-all">Expand all</button>
                    <button type="button" class="fa-button fa-button--small" data-action="collapse-all">Collapse all</button>
                </div>` : ''}
            </header>
            ${groups.length ? [...groups].reverse().map(group => this.#group(group)).join('') : '<div class="fa-empty"><p>Nothing was logged in this session.</p></div>'}`;
    }

    // Newest first, every group collapsed (Robert, 2026-10-20, in xf-dashboard): the groups and the lines in each run
    // backwards, so a gap of quiet sits below the line it came before.
    #group(group) {
        const page = group.page;
        const title = page
            ? `<span class="trace-time">${escapeHtml(time(page.at))}</span> Opened <strong>${escapeHtml(page.item.path)}</strong>${page.item.status >= 400 ? ` <span class="trace-bad">${page.item.status}</span>` : ''}`
            : '<span class="trace-time"></span> Before the first page';
        return `
            <details class="trace-group">
                <summary class="trace-group-head">${title}<span class="trace-group-count fa-muted">${plural(group.lines.length, 'line')}</span></summary>
                <ol class="trace-lines">${[...group.lines].reverse().map(line => this.#line(line)).join('')}</ol>
            </details>
            ${page?.idleBefore ? `<div class="trace-idle">${page.idleBefore} minutes idle</div>` : ''}`;
    }

    #line(line) {
        const idle = line.idleBefore ? `<li class="trace-idle">${line.idleBefore} minutes idle</li>` : '';
        const when = `<span class="trace-time">${escapeHtml(time(line.at))}</span>`;
        const item = line.item;
        switch (line.kind) {
            case 'request': {
                const classes = ['trace-line', 'is-request', item.write && 'is-write', item.failed && 'is-failed'].filter(Boolean).join(' ');
                const body = item.body !== null && item.body !== undefined
                    ? `<details class="trace-body"><summary>Body</summary><pre>${escapeHtml(JSON.stringify(item.body, null, 2))}</pre></details>` : '';
                return `<li class="${classes}">${when}
                    <span class="trace-method">${escapeHtml(item.method)}</span>
                    <span class="trace-path">${escapeHtml(item.path)}${item.query ? `<span class="fa-muted">${escapeHtml(item.query)}</span>` : ''}</span>
                    <span class="trace-status${item.status >= 400 ? ' trace-bad' : ''}">${item.status}</span>
                    <span class="trace-ms">${item.ms} ms</span>${body}</li>${idle}`;
            }
            case 'error':
                return `<li class="trace-line is-error">${when}<span class="trace-kind">Error</span>
                    <span class="trace-text">${escapeHtml(item.message)}</span><span class="fa-muted">${escapeHtml(item.source ?? '')}</span></li>${idle}`;
            case 'message':
                return `<li class="trace-line is-message">${when}<span class="trace-kind">${escapeHtml(item.level ?? 'Log')}</span>
                    <span class="trace-text">${escapeHtml(item.message)}</span></li>${idle}`;
            default:
                return `<li class="trace-line is-action">${when}<span class="trace-kind">Action</span>
                    <span class="trace-text">${escapeHtml(describeAction(item))}</span></li>${idle}`;
        }
    }

    #exportText() {
        if (this.#session) return { text: copyPayload(this.#session), name: `trace-session-${this.#session.sessionId}.json` };
        if (this.#day) return { text: copyDayPayload(this.#day, this.#day.dayLabel), name: `trace-day-${this.#day.identifier}-${this.#day.dayLabel}.json` };
        return null;
    }

    #syncButtons() {
        const ready = Boolean(this.#session || this.#day);
        this.#refs.form.querySelectorAll('[data-action="copy"], [data-action="download"]').forEach(button => { button.disabled = !ready; });
    }

    async #onClick(event) {
        const target = event.target.closest('[data-action]');
        if (!target) return;
        switch (target.dataset.action) {
            case 'session':
                this.#showSession(target.dataset.session);
                break;
            case 'pick-day':
                this.#refs.day.value = target.dataset.day;
                this.#showDay(this.#refs.person.value.trim() || this.#month?.identifier, target.dataset.day);
                break;
            case 'month-prev':
            case 'month-next': {
                if (!this.#month) return;
                const shift = target.dataset.action === 'month-next' ? 1 : -1;
                const moved = new Date(this.#month.year, this.#month.month - 1 + shift, 1);
                this.#loadMonth(this.#month.identifier, moved.getFullYear(), moved.getMonth() + 1);
                break;
            }
            case 'expand-all':
            case 'collapse-all':
                this.#refs['session-view'].querySelectorAll('.trace-group').forEach(group => { group.open = target.dataset.action === 'expand-all'; });
                break;
            case 'copy': {
                const exported = this.#exportText();
                if (!exported) return;
                try {
                    await navigator.clipboard.writeText(exported.text);
                    this.#refs.copied.textContent = 'Copied.';
                } catch {
                    this.#refs.copied.textContent = 'The browser would not copy; use Download.';
                }
                setTimeout(() => { this.#refs.copied.textContent = ''; }, 3000);
                break;
            }
            case 'download': {
                const exported = this.#exportText();
                if (!exported) return;
                const link = document.createElement('a');
                link.href = URL.createObjectURL(new Blob([exported.text], { type: 'application/json' }));
                link.download = exported.name;
                link.click();
                URL.revokeObjectURL(link.href);
                break;
            }
        }
    }
}

export default new TracePage();
