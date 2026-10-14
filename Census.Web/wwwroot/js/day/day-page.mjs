import { fetchCanvas, fetchDay, fetchMonth, fetchFleetDates } from './day-api.mjs';
import { SECTION_TITLES, STATUS_ORDER, STATUS_TEXT, headline, collapse } from './day-events.mjs';

// The day (day-view.md): what changed on one day, or across a range, for every machine. The
// month grid on the left is navigation, shaded by how many machines changed; the day on the
// right is the headline — changed, quiet, not collected — then the events, collapsed across
// machines and grouped by meaning. Read-only; the URL carries the day, the range, the stage
// chips and the machine in scope, so a day is a link.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CHIPS_SHOWN = 6;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

function pad(n) {
    return String(n).padStart(2, '0');
}

function dayKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function longDate(key) {
    return parseDay(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function shortDate(key) {
    return parseDay(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

class DayPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'day-root');
        this.selectedStages = new Set();
        this.machine = null;
        this.open = null;             // the headline status whose machines are listed
        this.expanded = new Set();    // event keys showing every machine
        this.todayKey = dayKey(new Date());
        this.readUrl();
        this.renderShell();
        this.load();
    }

    // --- url ------------------------------------------------------------------------------

    readUrl() {
        const params = new URLSearchParams(location.search);
        const day = params.get('day');
        const from = params.get('from');
        const to = params.get('to');
        this.when = from && to ? { from, to } : day ? { day } : null;
        (params.get('stages') ?? '').split(',').filter(Boolean).forEach((s) => this.selectedStages.add(s));
        this.machine = params.get('machine') || null;
    }

    writeUrl() {
        const params = new URLSearchParams();
        if (this.when?.day) params.set('day', this.when.day);
        if (this.when?.from) { params.set('from', this.when.from); params.set('to', this.when.to); }
        if (this.selectedStages.size) params.set('stages', [...this.selectedStages].join(','));
        if (this.machine) params.set('machine', this.machine);
        const query = params.toString();
        history.replaceState(null, '', query ? `?${query}` : location.pathname);
    }

    // --- skeleton -------------------------------------------------------------------------

    renderShell() {
        this.root.innerHTML = `
            <div class="day">
                <header class="day-header">
                    <div class="day-wordmark">Census <span>/ the day</span></div>
                    <nav class="day-links" aria-label="Census">
                        <a href="/">Estate</a>
                        <a href="/atlas">Atlas</a>
                        <a href="/moveit">Move It</a>
                    </nav>
                </header>
                <div class="day-body">
                    <aside class="day-side">
                        <div class="day-cal-nav">
                            <button type="button" class="day-btn" data-ref="prev" aria-label="Previous month">‹</button>
                            <h2 class="day-cal-month" data-ref="month"></h2>
                            <button type="button" class="day-btn" data-ref="next" aria-label="Next month">›</button>
                        </div>
                        <div class="day-grid" data-ref="grid"></div>
                        <p class="day-key"><span class="day-key-heat"></span> machines changed <span class="day-key-hatch"></span> nobody collected</p>
                        <div class="day-range">
                            <label>From <input type="date" class="day-input" data-ref="from"></label>
                            <span class="day-muted">→</span>
                            <label>To <input type="date" class="day-input" data-ref="to"></label>
                            <button type="button" class="day-btn" data-ref="latest">Latest</button>
                        </div>
                    </aside>
                    <main class="day-main">
                        <div class="day-title-block">
                            <h1 class="day-title" data-ref="title"></h1>
                            <p class="day-sub" data-ref="sub"></p>
                        </div>
                        <div class="day-stagebar" data-ref="stagebar"></div>
                        <div data-ref="scope"></div>
                        <div class="day-headline" data-ref="headline"></div>
                        <div data-ref="listing"></div>
                        <div class="day-groups" data-ref="groups"><p class="day-status">Reading the fleet…</p></div>
                    </main>
                </div>
            </div>`;
        const ref = (name) => this.root.querySelector(`[data-ref="${name}"]`);
        this.monthEl = ref('month');
        this.gridEl = ref('grid');
        this.titleEl = ref('title');
        this.subEl = ref('sub');
        this.stagebarEl = ref('stagebar');
        this.scopeEl = ref('scope');
        this.headlineEl = ref('headline');
        this.listingEl = ref('listing');
        this.groupsEl = ref('groups');
        this.fromEl = ref('from');
        this.toEl = ref('to');
        this.latestEl = ref('latest');

        ref('prev').addEventListener('click', () => this.stepMonth(-1));
        ref('next').addEventListener('click', () => this.stepMonth(1));
        const pick = () => {
            const from = this.fromEl.value;
            const to = this.toEl.value;
            if (!from || !to) return;
            if (from > to) {
                this.groupsEl.innerHTML = '<p class="day-status day-error">From is after To.</p>';
                return;
            }
            this.show({ from, to });
        };
        this.fromEl.addEventListener('change', pick);
        this.toEl.addEventListener('change', pick);
        this.latestEl.addEventListener('click', () => this.show(null));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.machine) this.scopeTo(null);
        });
    }

    // --- loading --------------------------------------------------------------------------

    async load() {
        try {
            [this.canvas, this.fleetDates] = await Promise.all([fetchCanvas(), fetchFleetDates()]);
        } catch (err) {
            this.groupsEl.innerHTML = `<p class="day-status day-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.byMachine = new Map(this.canvas.machines.map((m) => [m.machine.toLowerCase(), m]));
        this.firstFleetKey = this.fleetDates.length ? this.fleetDates[this.fleetDates.length - 1] : null;
        await this.show(this.when, true);
    }

    async show(when, initial = false) {
        this.when = when;
        this.open = null;
        this.expanded.clear();
        this.fromEl.value = when?.from ?? '';
        this.toEl.value = when?.to ?? '';
        this.latestEl.hidden = when === null;
        this.writeUrl();
        this.groupsEl.innerHTML = '<p class="day-status">Reading the fleet…</p>';
        let data;
        try {
            data = await fetchDay(when);
        } catch (err) {
            this.groupsEl.innerHTML = `<p class="day-status day-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        if (when !== this.when) return;
        this.data = data;
        const anchor = data.day ?? data.to;
        if (anchor && (initial || !this.month || !this.monthHolds(anchor))) {
            const d = parseDay(anchor);
            this.month = { y: d.getFullYear(), m: d.getMonth() };
            await this.loadMonth();
        }
        this.render();
    }

    monthHolds(key) {
        const d = parseDay(key);
        return d.getFullYear() === this.month.y && d.getMonth() === this.month.m;
    }

    async loadMonth() {
        const month = `${this.month.y}-${pad(this.month.m + 1)}`;
        this.counts = null;
        this.renderGrid();
        try {
            const counts = await fetchMonth(month);
            if (month !== `${this.month.y}-${pad(this.month.m + 1)}`) return;
            this.counts = new Map(counts.map((c) => [c.day, c]));
        } catch {
            this.counts = new Map();
        }
        this.renderGrid();
    }

    async stepMonth(delta) {
        const d = new Date(this.month.y, this.month.m + delta, 1);
        this.month = { y: d.getFullYear(), m: d.getMonth() };
        await this.loadMonth();
    }

    // --- filters --------------------------------------------------------------------------

    // The Estate's rule (estate-page.mjs stageMatches): a machine with no stage is never hidden.
    stageMatches(machine) {
        if (this.selectedStages.size === 0) return true;
        const stages = this.byMachine.get(machine.toLowerCase())?.stages ?? [];
        if (stages.length === 0) return true;
        return stages.some((s) => this.selectedStages.has(s));
    }

    inScope() {
        return this.data.machines.filter((m) => this.stageMatches(m.machine) && (!this.machine || m.machine.toLowerCase() === this.machine.toLowerCase()));
    }

    scopeTo(machine) {
        this.machine = machine;
        this.open = null;
        this.writeUrl();
        this.render();
    }

    // --- rendering ------------------------------------------------------------------------

    render() {
        this.renderTitle();
        this.renderStagebar();
        this.renderScope();
        const machines = this.inScope();
        this.renderHeadline(machines);
        this.renderGroups(machines);
        this.renderGrid();
    }

    renderTitle() {
        const d = this.data;
        if (d.day) {
            this.titleEl.textContent = longDate(d.day);
            this.subEl.textContent = 'Every machine’s snapshot on this day against its previous one, whatever day that was.';
        } else if (d.from) {
            this.titleEl.textContent = `${shortDate(d.from)} → ${shortDate(d.to)}`;
            this.subEl.textContent = 'Each machine’s first collected day in the range against its last.';
        } else {
            this.titleEl.textContent = 'Nothing collected yet';
            this.subEl.textContent = 'The census tree holds no snapshots.';
        }
    }

    renderStagebar() {
        const order = (this.canvas.stageOrder ?? []).map((s) => s.toLowerCase());
        const stages = [...new Set(this.canvas.machines.flatMap((m) => m.stages))]
            .sort((a, b) => {
                const ia = order.indexOf(a.toLowerCase());
                const ib = order.indexOf(b.toLowerCase());
                return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib) || a.localeCompare(b);
            });
        if (stages.length === 0) {
            this.stagebarEl.innerHTML = '';
            return;
        }
        const allActive = this.selectedStages.size === 0;
        this.stagebarEl.innerHTML = `
            <span class="day-stagebar-label">stage</span>
            <button type="button" class="day-chip ${allActive ? 'is-active' : ''}" data-stage="__all">all</button>
            ${stages.map((s) => `<button type="button" class="day-chip ${this.selectedStages.has(s) ? 'is-active' : ''}" data-stage="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}`;
        this.stagebarEl.querySelectorAll('[data-stage]').forEach((btn) => btn.addEventListener('click', () => {
            const stage = btn.dataset.stage;
            if (stage === '__all') this.selectedStages.clear();
            else if (this.selectedStages.has(stage)) this.selectedStages.delete(stage);
            else this.selectedStages.add(stage);
            this.open = null;
            this.writeUrl();
            this.render();
        }));
    }

    renderScope() {
        if (!this.machine) {
            this.scopeEl.innerHTML = '';
            return;
        }
        const row = this.data.machines.find((m) => m.machine.toLowerCase() === this.machine.toLowerCase());
        const day = row?.toDate ?? this.data.day;
        const estate = `/#${new URLSearchParams({ machine: this.machine, ...(day ? { day } : {}) })}`;
        this.scopeEl.innerHTML = `
            <div class="day-scope">
                scoped to <strong class="day-mono">${escapeHtml(this.machine)}</strong>
                ${row?.fromDate ? `<span class="day-muted">· ${escapeHtml(row.fromDate)} → ${escapeHtml(row.toDate)}</span>` : ''}
                <a class="day-btn day-btn-sm" href="${escapeHtml(estate)}">open in Estate ↗</a>
                <button type="button" class="day-btn day-btn-sm" data-ref="unscope" aria-label="Clear the machine scope">×</button>
            </div>`;
        this.scopeEl.querySelector('[data-ref="unscope"]').addEventListener('click', () => this.scopeTo(null));
    }

    renderHeadline(machines) {
        const counts = headline(machines);
        const total = machines.length;
        if (total === 0) {
            this.headlineEl.innerHTML = '<p class="day-status">No machines match the filters.</p>';
            this.listingEl.innerHTML = '';
            return;
        }
        const collected = total - counts['not-collected'].length;
        const statuses = STATUS_ORDER.filter((s) => ['changed', 'quiet', 'not-collected'].includes(s) || counts[s].length > 0);
        this.headlineEl.innerHTML = `
            ${statuses.map((s) => `
                <button type="button" class="day-count is-${s} ${this.open === s ? 'is-open' : ''}" data-status="${s}" aria-pressed="${this.open === s}">
                    <span class="day-count-n">${counts[s].length}</span>
                    <span class="day-count-l">${STATUS_TEXT[s]}</span>
                </button>`).join('')}
            <p class="day-headline-line">${collected === 0
                ? 'Nobody was collected.'
                : `${collected} of ${total} machine${total === 1 ? '' : 's'} collected${counts.changed.length === 0 ? ', nothing changed' : ''}.`}</p>`;
        this.headlineEl.querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', () => {
            this.open = this.open === btn.dataset.status ? null : btn.dataset.status;
            this.renderHeadline(machines);
        }));
        const listed = this.open ? counts[this.open] : [];
        this.listingEl.innerHTML = this.open ? `
            <div class="day-listing">
                <span class="day-muted">${STATUS_TEXT[this.open]}:</span>
                ${listed.length === 0 ? '<span class="day-muted">none</span>' : listed.map((m) => this.machineChip(m)).join('')}
            </div>` : '';
        this.bindMachineChips(this.listingEl);
    }

    renderGroups(machines) {
        const groups = collapse(machines);
        if (groups.length === 0) {
            this.groupsEl.innerHTML = '';
            return;
        }
        this.groupsEl.innerHTML = groups.map((g) => `
            <section class="day-group">
                <h2 class="day-group-title">${escapeHtml(g.title)} <span class="day-group-sub">${escapeHtml(g.sub)}</span>
                    <span class="day-group-n">${g.events.length} event${g.events.length === 1 ? '' : 's'} on ${g.machineCount} machine${g.machineCount === 1 ? '' : 's'}</span></h2>
                ${g.events.map((e) => this.eventRow(e)).join('')}
            </section>`).join('');
        this.groupsEl.querySelectorAll('[data-expand]').forEach((btn) => btn.addEventListener('click', () => {
            this.expanded.add(btn.dataset.expand);
            this.renderGroups(machines);
        }));
        this.bindMachineChips(this.groupsEl);
    }

    eventRow(e) {
        const key = `${e.section}\u0000${e.kind}\u0000${e.text}`;
        const all = this.expanded.has(key) || e.machines.length <= CHIPS_SHOWN;
        const shown = all ? e.machines : e.machines.slice(0, CHIPS_SHOWN - 1);
        const sym = e.kind === 'added' ? '+' : e.kind === 'removed' ? '−' : '~';
        return `
            <div class="day-event">
                <span class="day-sym day-sym-${escapeHtml(e.kind)}">${sym}</span>
                <div class="day-event-body">
                    <div class="day-event-text"><span class="day-muted">${escapeHtml(SECTION_TITLES[e.section] ?? e.section)}:</span> ${escapeHtml(e.text)}</div>
                    <div class="day-event-machines">
                        <span class="day-muted">${e.machines.length} machine${e.machines.length === 1 ? '' : 's'}</span>
                        ${shown.map((m) => this.machineChip(m)).join('')}
                        ${all ? '' : `<button type="button" class="day-chip day-chip-more" data-expand="${escapeHtml(key)}">+${e.machines.length - shown.length} more</button>`}
                    </div>
                </div>
            </div>`;
    }

    machineChip(machine) {
        const active = this.machine && machine.toLowerCase() === this.machine.toLowerCase();
        return `<button type="button" class="day-chip day-mono ${active ? 'is-active' : ''}" data-machine="${escapeHtml(machine)}">${escapeHtml(machine)}</button>`;
    }

    bindMachineChips(container) {
        container.querySelectorAll('[data-machine]').forEach((btn) => btn.addEventListener('click', () => {
            const m = btn.dataset.machine;
            this.scopeTo(this.machine && this.machine.toLowerCase() === m.toLowerCase() ? null : m);
        }));
    }

    // --- the grid -------------------------------------------------------------------------

    selectedKeys() {
        const w = this.when ?? (this.data?.day ? { day: this.data.day } : null);
        if (!w) return () => false;
        if (w.day) return (key) => key === w.day;
        return (key) => key >= w.from && key <= w.to;
    }

    renderGrid() {
        if (!this.month) return;
        const { y, m } = this.month;
        this.monthEl.textContent = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        const first = new Date(y, m, 1);
        const start = new Date(y, m, 1 - first.getDay());
        const last = new Date(y, m + 1, 0);
        const end = new Date(y, m + 1, 6 - last.getDay());
        const max = Math.max(1, ...[...(this.counts?.values() ?? [])].map((c) => c.changed));
        const selected = this.selectedKeys();
        const cells = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const key = dayKey(d);
            const count = this.counts?.get(key);
            const past = key <= this.todayKey && this.firstFleetKey && key >= this.firstFleetKey;
            const hatched = past && this.counts && !count && d.getMonth() === m;
            const heat = count ? count.changed / max : 0;
            const cls = [
                'day-cell',
                d.getMonth() !== m ? 'is-other' : '',
                key === this.todayKey ? 'is-today' : '',
                hatched ? 'is-hatched' : '',
                selected(key) ? 'is-selected' : '',
            ].filter(Boolean).join(' ');
            const title = count
                ? `${shortDate(key)}: ${count.changed} of ${count.collected} collected machines changed`
                : hatched ? `${shortDate(key)}: nobody collected` : shortDate(key);
            cells.push(`
                <button type="button" class="${cls}" data-day="${key}" title="${escapeHtml(title)}" style="--heat:${heat.toFixed(3)}">
                    <span class="day-cell-date">${d.getDate()}</span>
                    ${count ? `<span class="day-cell-n">${count.changed}<span class="day-cell-of">/${count.collected}</span></span>` : ''}
                </button>`);
        }
        this.gridEl.innerHTML = `
            ${WEEKDAYS.map((w) => `<div class="day-weekday">${w}</div>`).join('')}
            ${cells.join('')}`;
        this.gridEl.querySelectorAll('[data-day]').forEach((btn) => btn.addEventListener('click', () => this.show({ day: btn.dataset.day })));
    }
}

export default new DayPage();
