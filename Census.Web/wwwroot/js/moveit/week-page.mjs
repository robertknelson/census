import { fetchApplications, fetchCalendar, fetchCoverage, fetchReleaseStatus, fetchStages, fetchWhereIsEverything } from './moveit-api.mjs';
import { appLabel, escapeHtml } from './format.mjs';
import { stageHue } from './stage-hues.mjs';
import { renderTabs } from './tabs.mjs';

// The week (move-it.md §25): what changed in seven days, on one printable page, for readers
// who will not open the board. Every line is a row the board already has — the calendar's
// arrivals, rollbacks and events (§21), 02's targets, 01's heard items, the coverage line
// (§24) — sorted into what an executive asks: what went live, what moved, what went wrong,
// what is due. Nothing is sent from here; the page prints, and Robert decides who sees it.

const DAY = 86_400_000;
const WEEK_EVENTS = { approved: 'signed off', verified: 'testing signed off', hold: 'put on hold', resumed: 'resumed', abandoned: 'abandoned' };

function dayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function day(date) {
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

class WeekPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'moveit-root');
        const asked = /^\d{4}-\d{2}-\d{2}$/.test(new URLSearchParams(location.search).get('end') ?? '')
            ? parseKey(new URLSearchParams(location.search).get('end')) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        this.today = today;
        this.end = asked ?? today;
        this.renderShell();
        this.load();
    }

    renderShell() {
        this.root.innerHTML = `
            <header class="mi-header wk-header">
                <div class="mi-masthead">
                    ${renderTabs('week')}
                    <h1 class="mi-title" data-ref="title">The week</h1>
                    <p class="mi-tagline">What went live, what moved, what went wrong and what is due — seven days on one page.</p>
                </div>
                <div class="mi-header-side wk-controls">
                    <button type="button" class="mi-button" data-ref="prev" aria-label="Previous week">‹ Earlier</button>
                    <button type="button" class="mi-button" data-ref="next" aria-label="Next week">Later ›</button>
                    <button type="button" class="mi-button is-primary" data-ref="print">Print</button>
                </div>
            </header>
            <main class="wk-main" data-ref="main"><p class="mi-status">Asking the tracking database…</p></main>`;
        const ref = (n) => this.root.querySelector(`[data-ref="${n}"]`);
        this.titleEl = ref('title');
        this.mainEl = ref('main');
        this.nextEl = ref('next');
        ref('prev').addEventListener('click', () => this.move(-7));
        ref('next').addEventListener('click', () => this.move(7));
        ref('print').addEventListener('click', () => window.print());
    }

    async load() {
        try {
            [this.stages, this.applications, this.rows, this.releases, this.items, this.coverage] = await Promise.all([
                fetchStages(), fetchApplications(), fetchCalendar(), fetchReleaseStatus(), fetchWhereIsEverything(), fetchCoverage(),
            ]);
        } catch (err) {
            this.mainEl.innerHTML = `<p class="mi-status is-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.appsById = new Map(this.applications.map((a) => [a.ApplicationId, a]));
        this.sort = new Map(this.stages.map((s) => [s.Stage, s.Sort]));
        const topSort = Math.max(...this.stages.map((s) => s.Sort));
        this.top = new Set(this.stages.filter((s) => s.Sort === topSort).map((s) => s.Stage));
        this.render();
    }

    move(delta) {
        const next = new Date(this.end.getFullYear(), this.end.getMonth(), this.end.getDate() + delta);
        this.end = next > this.today ? this.today : next;
        const url = new URL(location.href);
        if (dayKey(this.end) === dayKey(this.today)) url.searchParams.delete('end');
        else url.searchParams.set('end', dayKey(this.end));
        history.replaceState(null, '', url);
        this.render();
    }

    app(id) {
        return escapeHtml(appLabel(this.appsById.get(id) ?? { ApplicationId: id }));
    }

    // A release "reached" a stage on the first day any build it claims was seen there, or a
    // person said it was (deployed-asserted). Only firsts count: a redeploy is not news.
    firsts() {
        const first = new Map();
        for (const r of this.rows) {
            const reached = (r.Kind === 'arrived' && r.ReleaseId != null)
                || (r.Kind === 'event' && r.EventKind === 'deployed-asserted' && r.Stage);
            if (!reached) continue;
            const key = `${r.ReleaseId}|${r.Stage}`;
            const at = Date.parse(r.At);
            if (!first.has(key) || at < first.get(key).at) first.set(key, { at, row: r, asserted: r.Kind === 'event' });
        }
        return [...first.values()];
    }

    render() {
        const from = new Date(this.end.getFullYear(), this.end.getMonth(), this.end.getDate() - 6);
        const inWeek = (ms) => ms >= from.getTime() && ms < this.end.getTime() + DAY;
        const keyIn = (key) => key >= dayKey(from) && key <= dayKey(this.end);
        const range = `${from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${this.end.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
        this.titleEl.textContent = `The week: ${range}`;
        document.title = `Move It — the week ${range}`;
        this.nextEl.disabled = dayKey(this.end) >= dayKey(this.today);

        const releaseById = new Map(this.releases.map((r) => [r.ReleaseId, r]));
        const now = (id) => releaseById.get(id)?.HighestStage;
        const firsts = this.firsts().filter((f) => inWeek(f.at));
        const live = firsts.filter((f) => this.top.has(f.row.Stage)).sort((a, b) => a.at - b.at);
        const moved = firsts.filter((f) => !this.top.has(f.row.Stage))
            .sort((a, b) => (this.sort.get(b.row.Stage) ?? 0) - (this.sort.get(a.row.Stage) ?? 0) || a.at - b.at);

        const rollbacks = new Map();
        for (const r of this.rows.filter((x) => x.Kind === 'returned' && inWeek(Date.parse(x.At)))) {
            rollbacks.set(`${r.ApplicationId}|${r.Stage}|${dayKey(new Date(r.At))}`, r);
        }
        const events = this.rows.filter((r) => r.Kind === 'event' && WEEK_EVENTS[r.EventKind] && inWeek(Date.parse(r.At)))
            .sort((a, b) => Date.parse(a.At) - Date.parse(b.At));
        const releaseOfBuild = new Map(this.rows.filter((r) => r.Kind === 'arrived' && r.Release)
            .map((r) => [`${r.ApplicationId}|${r.Build}`, r.Release]));
        const holds = events.filter((e) => e.EventKind === 'hold' || e.EventKind === 'abandoned');
        const signoffs = events.filter((e) => e.EventKind !== 'hold' && e.EventKind !== 'abandoned');

        const dated = this.releases.filter((r) => r.TargetDate && r.HighestStage !== 'abandoned');
        const target = (r) => String(r.TargetDate).slice(0, 10);
        const missed = dated.filter((r) => keyIn(target(r)) && !this.top.has(r.HighestStage));
        const nextFrom = dayKey(new Date(this.end.getTime() + DAY));
        const nextTo = dayKey(new Date(this.end.getTime() + 7 * DAY));
        const ahead = dated.filter((r) => target(r) >= nextFrom && target(r) <= nextTo && !this.top.has(r.HighestStage));
        const heard = this.items.filter((i) => i.Status === 'no release' && i.CreatedAt && inWeek(Date.parse(i.CreatedAt)));

        const recorded = this.rows.find((r) => r.Kind === 'recorded-through');
        const recordedKey = recorded?.At ? dayKey(new Date(recorded.At)) : null;
        const blindDays = recordedKey && recordedKey < dayKey(this.end);

        const tile = (n, label, tone = '') => `<div class="dv-tile ${tone}"><span class="dv-tile-num">${n}</span><span class="dv-tile-label">${label}</span></div>`;
        const line = (when, body) => `<li><span class="wk-when">${escapeHtml(day(new Date(when)))}</span><span class="wk-what">${body}</span></li>`;
        const tag = (stage) => stage ? `<span class="wk-stage" style="--lane:${stageHue(stage)}">${escapeHtml(stage)}</span>` : '';
        const section = (title, list, empty) => `
            <section class="wk-section">
                <h2 class="wk-h">${title}</h2>
                ${list.length ? `<ul class="wk-list">${list.join('')}</ul>` : `<p class="wk-empty">${empty}</p>`}
            </section>`;

        const watched = this.coverage.filter((c) => c.Verdict === 'observed').length;

        this.mainEl.innerHTML = `
            ${blindDays ? `<p class="wk-note">The ledger is recorded through ${escapeHtml(day(new Date(recorded.At)))}${recorded.Source === 'backfill' ? '' : ' (last change)'}: anything the servers did after that is not in this page yet.</p>` : ''}
            <div class="wk-tiles">
                ${tile(live.length, `release${live.length === 1 ? '' : 's'} went live`, live.length ? 'is-good' : '')}
                ${tile(moved.length, 'moved to a new stage')}
                ${tile(rollbacks.size, `rollback${rollbacks.size === 1 ? '' : 's'}`, rollbacks.size ? 'is-alert' : '')}
                ${tile(holds.length, 'put on hold or abandoned', holds.length ? 'is-hold' : '')}
                ${tile(missed.length, 'missed their target this week', missed.length ? 'is-alert' : '')}
                ${tile(ahead.length, 'due next week', ahead.length ? 'is-ask' : '')}
            </div>
            <div class="wk-cols">
                ${section('Went live', live.map((f) => line(f.at, `${this.app(f.row.ApplicationId)} · <strong>${escapeHtml(f.row.Release)}</strong>${f.asserted ? ' <span class="wk-muted">(as recorded)</span>' : ''}${now(f.row.ReleaseId) && !this.top.has(now(f.row.ReleaseId)) ? ` <span class="wk-alert">— since rolled back, now ${escapeHtml(now(f.row.ReleaseId))}</span>` : ''}`)), 'Nothing went live.')}
                ${section('Moved forward', moved.map((f) => line(f.at, `${tag(f.row.Stage)} ${this.app(f.row.ApplicationId)} · <strong>${escapeHtml(f.row.Release)}</strong> reached ${escapeHtml(f.row.Stage)}${f.asserted ? ' <span class="wk-muted">(as recorded)</span>' : ''}`)), 'Nothing reached a new stage.')}
                ${section('Went wrong', [
                    ...[...rollbacks.values()].map((r) => {
                        const pulled = releaseOfBuild.get(`${r.ApplicationId}|${r.ReplacedBuild}`);
                        return [Date.parse(r.At), line(r.At, `${tag(r.Stage)} ${this.app(r.ApplicationId)} · ${pulled ? `<strong>${escapeHtml(pulled)}</strong>` : 'unnamed build'} rolled back: <code>${escapeHtml(r.ReplacedBuild)}</code> replaced by older <code>${escapeHtml(r.Build)}</code>`)];
                    }),
                    ...holds.map((e) => [Date.parse(e.At), line(e.At, `${this.app(e.ApplicationId)} · <strong>${escapeHtml(e.Release)}</strong> ${WEEK_EVENTS[e.EventKind]}${e.Note ? ` — ${escapeHtml(e.Note)}` : ''}`)]),
                ].sort((a, b) => a[0] - b[0]).map((x) => x[1]), 'No rollbacks, holds or abandonments.')}
                ${section('Signed off or resumed', signoffs.map((e) => line(e.At, `${tag(e.Stage)} ${this.app(e.ApplicationId)} · <strong>${escapeHtml(e.Release)}</strong> ${WEEK_EVENTS[e.EventKind]}${e.Note ? ` — ${escapeHtml(e.Note)}` : ''}`)), 'No approvals or sign-offs recorded.')}
                ${section('Targets', [
                    ...missed.map((r) => line(parseKey(target(r)), `${this.app(r.ApplicationId)} · <strong>${escapeHtml(r.Name)}</strong> <span class="wk-alert">missed — now ${escapeHtml(r.HighestStage)}${r.OnHold === 1 ? ', on hold' : ''}</span>`)),
                    ...ahead.map((r) => line(parseKey(target(r)), `${this.app(r.ApplicationId)} · <strong>${escapeHtml(r.Name)}</strong> due — now ${escapeHtml(r.HighestStage)}`)),
                ], 'No targets this week or next.')}
                ${section('Newly heard', heard.map((i) => line(i.CreatedAt, `${this.app(i.ApplicationId)} · <strong>${escapeHtml(i.Title)}</strong>${i.Description ? ` — ${escapeHtml(i.Description)}` : ''}`)), 'Nothing new in Coming.')}
            </div>
            <p class="wk-foot">The pings watch ${watched} of ${this.coverage.length} applications; the rest move only as recorded by people, or not at all (see Division). Printed from Move It.</p>`;
    }
}

export default new WeekPage();
