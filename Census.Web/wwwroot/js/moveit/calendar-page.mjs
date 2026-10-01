import { fetchApplications, fetchCalendar, fetchReleaseStatus, fetchStages } from './moveit-api.mjs';
import { appLabel, escapeHtml } from './format.mjs';
import { stageHue } from './stage-hues.mjs';
import { renderTabs } from './tabs.mjs';

// Calendar (move-it.md §21): the first view with time across the page. Three kinds of date,
// drawn three ways — observed arrivals solid, human events outlined, release targets as
// flags — on a month grid. One chip per application, stage and day for what the pings saw;
// the day column lists every row. Days follow the reader's clock. Read-only, and no link to
// the release page (Robert, 2026-10-01: "not now").

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHOWN = 3;

const EVENT_TEXT = {
    approved: 'approved', verified: 'verified', hold: 'on hold', resumed: 'resumed',
    abandoned: 'abandoned', 'deployed-asserted': 'deployed (said)',
};

function pad(n) {
    return String(n).padStart(2, '0');
}

function dayKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function time(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function stageTag(stage) {
    return stage ? `<span class="cal-tag" style="--lane:${stageHue(stage)}">${escapeHtml(stage)}</span>` : '';
}

class CalendarPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'moveit-root');
        this.stage = null;
        this.app = null;
        this.selected = null;
        const today = new Date();
        this.todayKey = dayKey(today);
        const asked = /^(\d{4})-(\d{2})$/.exec(new URLSearchParams(location.search).get('month') ?? '');
        this.month = asked ? { y: Number(asked[1]), m: Number(asked[2]) - 1 } : { y: today.getFullYear(), m: today.getMonth() };
        this.renderShell();
        this.load();
    }

    renderShell() {
        this.root.innerHTML = `
            <header class="mi-header">
                <div class="mi-masthead">
                    ${renderTabs('calendar')}
                    <h1 class="mi-title">Calendar</h1>
                    <p class="mi-tagline">When builds reached each stage, what people recorded, and when releases were due.</p>
                </div>
                <div class="mi-header-side">
                    <nav class="mi-filter" data-ref="apps" aria-label="Application"></nav>
                </div>
            </header>
            <div class="cal-bar">
                <nav class="mi-filter" data-ref="stages" aria-label="Stage"></nav>
                <div class="cal-nav">
                    <button type="button" class="mi-button" data-ref="prev" aria-label="Previous month">‹</button>
                    <h2 class="cal-month" data-ref="month"></h2>
                    <button type="button" class="mi-button" data-ref="next" aria-label="Next month">›</button>
                    <button type="button" class="mi-button" data-ref="today">This month</button>
                </div>
                <ul class="cal-legend">
                    <li><span class="cal-chip is-observed" style="--lane:#8e96a3"></span>seen by the pings</li>
                    <li><span class="cal-chip is-event" style="--lane:#8e96a3"></span>recorded by people</li>
                    <li><span class="cal-flag">⚑</span>due</li>
                    <li><span class="cal-flag is-missed">⚑</span>due, not live</li>
                    <li>↺ rolled back</li>
                    <li><span class="cal-hold-key"></span>on hold</li>
                </ul>
            </div>
            <p class="cal-recorded" data-ref="recorded" hidden></p>
            <div class="mi-body">
                <main class="cal-main" data-ref="main"><p class="mi-status">Asking the tracking database…</p></main>
                <aside class="mi-detail" data-ref="detail" hidden></aside>
            </div>`;
        const ref = (name) => this.root.querySelector(`[data-ref="${name}"]`);
        this.appsEl = ref('apps');
        this.stagesEl = ref('stages');
        this.monthEl = ref('month');
        this.recordedEl = ref('recorded');
        this.mainEl = ref('main');
        this.detailEl = ref('detail');
        ref('prev').addEventListener('click', () => this.step(-1));
        ref('next').addEventListener('click', () => this.step(1));
        ref('today').addEventListener('click', () => {
            const t = new Date();
            this.month = { y: t.getFullYear(), m: t.getMonth() };
            this.step(0);
        });
    }

    async load() {
        let rows;
        try {
            [this.stages, this.applications, rows, this.releases] = await Promise.all([
                fetchStages(), fetchApplications(), fetchCalendar(), fetchReleaseStatus(),
            ]);
        } catch (err) {
            this.mainEl.innerHTML = `<p class="mi-status is-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.appsById = new Map(this.applications.map((a) => [a.ApplicationId, a]));
        this.stageSort = new Map(this.stages.map((s) => [s.Stage, s.Sort]));
        const topSort = Math.max(...this.stages.map((s) => s.Sort));
        this.topStages = this.stages.filter((s) => s.Sort === topSort).map((s) => s.Stage);

        const recorded = rows.find((r) => r.Kind === 'recorded-through');
        this.recordedKey = recorded?.At ? dayKey(new Date(recorded.At)) : null;
        this.recorded = recorded ?? null;
        this.holds = this.holdSpans(rows.filter((r) => r.Kind === 'event'));

        // A target is the planned PROD date (002), so it shows under All and the top stage.
        // An abandoned release is not due anywhere.
        this.entries = [
            ...rows.filter((r) => r.Kind !== 'recorded-through').map((r) => ({ ...r, day: dayKey(new Date(r.At)) })),
            ...this.releases.filter((r) => r.TargetDate && r.HighestStage !== 'abandoned').map((r) => ({
                Kind: 'planned', day: String(r.TargetDate).slice(0, 10), ApplicationId: r.ApplicationId,
                ReleaseId: r.ReleaseId, Release: r.Name, Missed: r.PastTarget === 1, Now: r.HighestStage,
            })),
        ];
        this.renderFilters();
        this.render();
    }

    step(delta) {
        const d = new Date(this.month.y, this.month.m + delta, 1);
        this.month = { y: d.getFullYear(), m: d.getMonth() };
        const url = new URL(location.href);
        url.searchParams.set('month', `${this.month.y}-${pad(this.month.m + 1)}`);
        history.replaceState(null, '', url);
        this.closeDetail();
        this.render();
        this.mainEl.scrollTop = 0;
    }

    renderFilters() {
        const chip = (attr, id, label, active) => `
            <button type="button" class="mi-filter-chip ${active ? 'is-active' : ''}" data-${attr}="${escapeHtml(id ?? '')}">${escapeHtml(label)}</button>`;
        this.stagesEl.innerHTML = [
            chip('stage', null, 'All', this.stage == null),
            ...this.stages.map((s) => chip('stage', s.Stage, s.Display ?? s.Stage, this.stage === s.Stage)),
        ].join('');
        this.appsEl.innerHTML = [
            chip('app', null, 'All applications', this.app == null),
            ...this.applications.map((a) => chip('app', a.ApplicationId, appLabel(a), this.app === a.ApplicationId)),
        ].join('');
        this.stagesEl.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => {
            this.stage = b.dataset.stage === '' ? null : b.dataset.stage;
            this.refresh();
        }));
        this.appsEl.querySelectorAll('[data-app]').forEach((b) => b.addEventListener('click', () => {
            this.app = b.dataset.app === '' ? null : Number(b.dataset.app);
            this.refresh();
        }));
    }

    refresh() {
        this.renderFilters();
        this.render();
        if (this.selected) this.openDetail(this.selected);
    }

    // A hold runs from its day until the release's next resume or abandon; one never lifted
    // runs through today (02's on-hold rule). A second hold while held changes nothing.
    holdSpans(events) {
        const spans = [];
        const open = new Map();
        for (const e of [...events].sort((a, b) => a.At.localeCompare(b.At))) {
            const held = open.get(e.ReleaseId);
            if (e.EventKind === 'hold' && !held) {
                const span = { ApplicationId: e.ApplicationId, Stage: e.Stage, Release: e.Release, from: e.At, to: null, reason: e.Note };
                open.set(e.ReleaseId, span);
                spans.push(span);
            } else if ((e.EventKind === 'resumed' || e.EventKind === 'abandoned') && held) {
                held.to = e.At;
                held.ended = e.EventKind;
                open.delete(e.ReleaseId);
            }
        }
        return spans.map((h) => ({ ...h, fromKey: dayKey(new Date(h.from)), toKey: h.to ? dayKey(new Date(h.to)) : null }));
    }

    holdsOn(key) {
        return this.holds.filter((h) => key >= h.fromKey && (h.toKey ? key < h.toKey : key <= this.todayKey)
            && this.passes({ ...h, Kind: 'event' }));
    }

    // Unstaged events (a hold, a resume) belong to the release, not a stage: All only.
    passes(e) {
        if (this.app != null && e.ApplicationId !== this.app) return false;
        if (this.stage == null) return true;
        if (e.Kind === 'planned') return this.topStages.includes(this.stage);
        return e.Stage === this.stage;
    }

    render() {
        const { y, m } = this.month;
        this.monthEl.textContent = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        this.renderRecorded();

        const byDay = new Map();
        for (const e of this.entries) {
            if (!this.passes(e)) continue;
            if (!byDay.has(e.day)) byDay.set(e.day, []);
            byDay.get(e.day).push(e);
        }
        this.byDay = byDay;

        const first = new Date(y, m, 1);
        const start = new Date(y, m, 1 - ((first.getDay() + 6) % 7));
        const last = new Date(y, m + 1, 0);
        const end = new Date(y, m + 1, (7 - ((last.getDay() + 6) % 7)) - 1);
        const cells = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) cells.push(this.renderDay(new Date(d), m));

        this.mainEl.innerHTML = `
            <div class="cal-grid">
                ${WEEKDAYS.map((w) => `<div class="cal-weekday">${w}</div>`).join('')}
                ${cells.join('')}
            </div>`;
        this.mainEl.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => this.openDetail(b.dataset.day)));
    }

    renderRecorded() {
        if (!this.recordedKey) {
            this.recordedEl.hidden = false;
            this.recordedEl.innerHTML = 'The ledger is empty: the backfill has not run, or no endpoint sends a deployment block yet.';
            return;
        }
        const date = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const r = this.recorded;
        this.recordedEl.hidden = false;
        this.recordedEl.innerHTML = r.Source === 'backfill'
            ? `<strong>Recorded through ${escapeHtml(date(r.At))}.</strong>
                The backfill last ran ${escapeHtml(date(r.RanAt))} at ${time(r.RanAt)} (${escapeHtml(r.By)}); hatched days after it are not yet backfilled. An empty day before it was quiet.`
            : `<strong>Last change recorded ${escapeHtml(date(r.At))}.</strong>
                The backfill has not stamped a run yet, so the hatched days after it are either quiet or not yet backfilled.`;
    }

    renderDay(date, month) {
        const key = dayKey(date);
        const entries = this.byDay.get(key) ?? [];
        const chips = this.chips(entries);
        const holds = this.holdsOn(key);
        const unknown = this.recordedKey && key > this.recordedKey && key <= this.todayKey;
        const cls = [
            'cal-day',
            date.getMonth() !== month ? 'is-other' : '',
            key === this.todayKey ? 'is-today' : '',
            unknown ? 'is-unknown' : '',
            key === this.selected ? 'is-selected' : '',
            chips.length === 0 && holds.length === 0 ? 'is-empty' : '',
        ].filter(Boolean).join(' ');
        const label = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
        return `
            <button type="button" class="${cls}" data-day="${key}" aria-label="${escapeHtml(`${label}: ${entries.length} entries`)}">
                <span class="cal-date">${date.getDate()}</span>
                ${chips.slice(0, SHOWN).join('')}
                ${chips.length > SHOWN ? `<span class="cal-more">+${chips.length - SHOWN} more</span>` : ''}
                ${holds.map((h, i) => this.holdBar(h, key, date, i)).join('')}
            </button>`;
    }

    // A thin amber band per held release, named where it starts and at the start of each week.
    holdBar(h, key, date, i) {
        const named = key === h.fromKey || date.getDay() === 1;
        const app = appLabel(this.appsById.get(h.ApplicationId) ?? { ApplicationId: h.ApplicationId });
        const title = `${app} · ${h.Release} on hold since ${new Date(h.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
        return `<span class="cal-hold ${i === 0 ? 'is-first' : ''} ${key === h.fromKey ? 'is-start' : ''}" title="${escapeHtml(title)}">${named ? `${escapeHtml(app)} · ${escapeHtml(h.Release)} on hold` : ''}</span>`;
    }

    // Targets first (a missed one is the news), then rollbacks, then arrivals from the top
    // stage down, then what people recorded.
    chips(entries) {
        const app = (id) => escapeHtml(appLabel(this.appsById.get(id) ?? { ApplicationId: id }));
        const out = [];
        const planned = entries.filter((e) => e.Kind === 'planned').sort((a, b) => b.Missed - a.Missed);
        for (const p of planned) {
            const text = `${app(p.ApplicationId)} · ${escapeHtml(p.Release)} due`;
            out.push(`<span class="cal-chip is-planned ${p.Missed ? 'is-missed' : ''}" title="${text}${p.Missed ? ' — not live' : ''}"><span class="cal-flag ${p.Missed ? 'is-missed' : ''}">⚑</span>${text}</span>`);
        }
        for (const kind of ['returned', 'arrived']) {
            const groups = new Map();
            for (const e of entries.filter((x) => x.Kind === kind)) {
                const k = `${e.ApplicationId}|${e.Stage}`;
                if (!groups.has(k)) groups.set(k, []);
                groups.get(k).push(e);
            }
            const ordered = [...groups.values()].sort((a, b) => (this.stageSort.get(b[0].Stage) ?? 0) - (this.stageSort.get(a[0].Stage) ?? 0));
            for (const g of ordered) out.push(this.observedChip(kind, g, app(g[0].ApplicationId)));
        }
        for (const e of entries.filter((x) => x.Kind === 'event').sort((a, b) => a.At.localeCompare(b.At))) {
            const text = `${app(e.ApplicationId)} · ${escapeHtml(e.Release)} ${EVENT_TEXT[e.EventKind] ?? escapeHtml(e.EventKind)}`;
            out.push(`<span class="cal-chip is-event" style="--lane:${stageHue(e.Stage)}" title="${escapeHtml(e.Stage ?? '')} ${text}">${stageTag(e.Stage)}${text}</span>`);
        }
        return out;
    }

    observedChip(kind, group, appName) {
        const builds = [...new Set(group.map((e) => e.Build))];
        const releases = [...new Set(group.map((e) => e.Release))];
        const unnamed = releases.length === 1 && releases[0] == null;
        let what;
        if (kind === 'returned') what = `back to ${escapeHtml(builds.join(', '))}`;
        else if (builds.length === 1) what = unnamed ? 'unnamed build' : escapeHtml(releases[0] ?? 'unnamed build');
        else if (releases.length === 1 && !unnamed) what = `${escapeHtml(releases[0])} · ${builds.length} builds`;
        else what = `${builds.length} builds`;
        const text = `${kind === 'returned' ? '↺ ' : ''}${appName} · ${what}`;
        const stage = group[0].Stage;
        return `<span class="cal-chip is-observed ${kind === 'returned' ? 'is-returned' : ''} ${unnamed && kind === 'arrived' ? 'is-unnamed' : ''}" style="--lane:${stageHue(stage)}" title="${escapeHtml(stage)} ${text}">${stageTag(stage)}${text}</span>`;
    }

    openDetail(key) {
        this.selected = key;
        this.mainEl.querySelectorAll('.cal-day.is-selected').forEach((el) => el.classList.remove('is-selected'));
        this.mainEl.querySelector(`[data-day="${key}"]`)?.classList.add('is-selected');
        const entries = this.byDay.get(key) ?? [];
        const [y, mo, d] = key.split('-').map(Number);
        const title = new Date(y, mo - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const app = (id) => escapeHtml(appLabel(this.appsById.get(id) ?? { ApplicationId: id }));
        const release = (e) => e.Release ? escapeHtml(e.Release) : '<span class="mi-muted">unnamed build</span>';

        const planned = entries.filter((e) => e.Kind === 'planned');
        // A rollback on two servers is two rows saying one thing: one line, with the count.
        const once = new Map();
        for (const e of entries.filter((x) => x.Kind === 'arrived' || x.Kind === 'returned')) {
            const k = `${e.Kind}|${e.ApplicationId}|${e.Stage}|${e.Build}|${e.ReplacedBuild}`;
            if (once.has(k)) once.get(k).servers += 1;
            else once.set(k, { ...e, servers: 1 });
        }
        const observed = [...once.values()]
            .sort((a, b) => (this.stageSort.get(b.Stage) ?? 0) - (this.stageSort.get(a.Stage) ?? 0) || a.At.localeCompare(b.At));
        const events = entries.filter((e) => e.Kind === 'event').sort((a, b) => a.At.localeCompare(b.At));
        const unknown = this.recordedKey && key > this.recordedKey && key <= this.todayKey;
        const holds = this.holdsOn(key);
        const count = planned.length + observed.length + events.length + holds.length;

        const section = (heading, list) => list.length ? `<h3 class="mi-detail-h3">${heading}</h3><ul class="cal-list">${list.join('')}</ul>` : '';
        this.detailEl.hidden = false;
        this.detailEl.innerHTML = `
            <button type="button" class="mi-detail-close" data-ref="close" aria-label="Close">×</button>
            <h2 class="mi-detail-title">${escapeHtml(title)}</h2>
            <p class="mi-detail-sub">${count === 0 ? (unknown ? (this.recorded.Source === 'backfill' ? 'Nothing known yet: the backfill has not reached this day.' : 'Nothing recorded. This day is after the last recorded change: quiet, or not yet backfilled.') : 'Nothing on this day.') : `${count} ${count === 1 ? 'entry' : 'entries'}`}</p>
            ${section('Due', planned.map((p) => `
                <li><strong>${escapeHtml(p.Release)}</strong> · ${app(p.ApplicationId)}
                    ${p.Missed ? '<span class="mi-flag is-alert">past target</span>' : ''}
                    <div class="mi-muted">now: ${escapeHtml(p.Now)}</div></li>`))}
            ${section('On hold', holds.map((h) => {
                const held = Math.max(1, Math.round(((h.to ? Date.parse(h.to) : Date.now()) - Date.parse(h.from)) / 86_400_000));
                const since = new Date(h.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
                const span = h.to ? `from ${since} for ${held} ${held === 1 ? 'day' : 'days'}, then ${h.ended}` : `since ${since}, ${held} days so far`;
                return `
                <li>${stageTag(h.Stage)} ${app(h.ApplicationId)} · <strong>${escapeHtml(h.Release)}</strong>
                    <div class="mi-muted">${escapeHtml(span)}</div>
                    ${h.reason ? `<div class="cal-note">${escapeHtml(h.reason)}</div>` : ''}</li>`;
            }))}
            ${section('Seen by the pings', observed.map((e) => `
                <li>${stageTag(e.Stage)} ${app(e.ApplicationId)} · ${release(e)}
                    <div class="mi-muted">${e.Kind === 'returned'
                        ? `↺ rolled back: <code>${escapeHtml(e.ReplacedBuild)}</code> replaced by older <code>${escapeHtml(e.Build)}</code>`
                        : `<code>${escapeHtml(e.Build)}</code> first seen`} at ${time(e.At)}${e.servers > 1 ? ` · ${e.servers} servers` : ''}</div></li>`))}
            ${section('Recorded by people', events.map((e) => `
                <li>${stageTag(e.Stage)} ${app(e.ApplicationId)} · <strong>${escapeHtml(e.Release)}</strong> ${EVENT_TEXT[e.EventKind] ?? escapeHtml(e.EventKind)}
                    <div class="mi-muted">${e.Build ? `<code>${escapeHtml(e.Build)}</code> · ` : ''}${escapeHtml(e.By)} at ${time(e.At)}</div>
                    ${e.Note ? `<div class="cal-note">${escapeHtml(e.Note)}</div>` : ''}</li>`))}`;
        this.detailEl.querySelector('[data-ref="close"]').addEventListener('click', () => this.closeDetail());
    }

    closeDetail() {
        this.selected = null;
        this.detailEl.hidden = true;
        this.mainEl.querySelectorAll('.cal-day.is-selected').forEach((el) => el.classList.remove('is-selected'));
    }
}

export default new CalendarPage();
