import { escapeHtml } from '../membership/utils/format.mjs';
import { buildWork, duration } from './app-events-model.mjs';

// The units of work (gatehouse.md §12.6). /app-events: those that started in a window, newest first, with what became
// of each. /app-events/work/{workUid}: one unit across systems, step by step, each gap named waiting or working. The
// raw events are in Log Explorer's AppEvent model.

const WINDOWS = [{ key: '1', label: '24 hours' }, { key: '7', label: '7 days' }, { key: '30', label: '30 days' }];
const STATUSES = ['completed', 'failed', 'stuck', 'running'];

const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

class AppEventsPage {
    init(config = {}) {
        this.root = typeof config.root === 'string' ? document.querySelector(config.root) : config.root;
        const work = location.pathname.match(/^\/app-events\/work\/([^/]+)$/);
        if (work) this.showWork(decodeURIComponent(work[1]));
        else {
            const here = new URLSearchParams(location.search);
            this.filter = { days: here.get('days') ?? '7', status: here.get('status') ?? '', kind: here.get('kind') ?? '' };
            this.showWorks();
        }
    }

    async get(url) {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message ?? `The events did not answer (${response.status}).`);
        return payload;
    }

    // ---- the units of work in a window ----

    async showWorks() {
        const to = new Date();
        const from = new Date(to.getTime() - Number(this.filter.days) * 86_400_000);
        const [namespace, commandName] = this.filter.kind ? this.filter.kind.split('/') : [];
        const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), ...(this.filter.status ? { status: this.filter.status } : {}),
            ...(namespace ? { namespace, commandName } : {}) });
        history.replaceState(null, '', `/app-events?${new URLSearchParams({ days: this.filter.days, ...(this.filter.status ? { status: this.filter.status } : {}), ...(this.filter.kind ? { kind: this.filter.kind } : {}) })}`);
        this.root.innerHTML = '<p class="ps-none">Reading the units of work…</p>';
        let works;
        try {
            works = await this.get(`/api/app-events/works?${params}`);
            if (!this.kinds) this.kinds = [...new Set(works.map((w) => `${w.namespace}/${w.commandName}`))].sort();
        } catch (e) {
            this.root.innerHTML = `<p class="ps-error">${escapeHtml(e.message)}</p>`;
            return;
        }
        const count = (status) => works.filter((w) => w.status === status).length;
        const option = (value, label, selected) => `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
        this.root.innerHTML = `
            <div class="mb-page">
                <header class="mb-head"><h2 class="mb-title">App events</h2>
                    <p class="ps-sub">Each unit of business work, followed across the systems that touched it. Every event is in Log Explorer (AppEvent).</p></header>
                <div class="ps-section ae-filters">
                    <label>Started in the last <select data-filter="days">${WINDOWS.map((w) => option(w.key, w.label, w.key === this.filter.days)).join('')}</select></label>
                    <label>Kind <select data-filter="kind"><option value="">Every kind</option>${(this.kinds ?? []).map((k) => option(k, k.replace('/', ' / '), k === this.filter.kind)).join('')}</select></label>
                    <label>Status <select data-filter="status"><option value="">Any</option>${STATUSES.map((s) => option(s, s, s === this.filter.status)).join('')}</select></label>
                </div>
                <div class="ps-tiles">${STATUSES.map((s) => `<div class="ps-tile ae-tile is-${s}"><span class="ps-tile-label">${s}</span><span class="ps-tile-value">${count(s)}</span></div>`).join('')}</div>
                <section class="ps-section">
                    <div class="ps-scroll"><table class="ps-table">
                        <thead><tr><th>Started</th><th>Kind</th><th>Subject</th><th>Started by</th><th>Systems</th><th>Steps</th><th>Took</th><th>Last step</th><th>Status</th></tr></thead>
                        <tbody>${works.map((w) => `
                            <tr>
                                <td><a class="ps-link" href="/app-events/work/${encodeURIComponent(w.workUid)}">${escapeHtml(when(w.firstAt))}</a></td>
                                <td>${escapeHtml(w.namespace)} / ${escapeHtml(w.commandName)}${w.registered ? '' : ' <span class="ps-flag is-alert" title="Not in the catalog of kinds">unregistered</span>'}</td>
                                <td>${escapeHtml(w.subjectType ? `${w.subjectType} ${w.subjectKey}` : '')}</td>
                                <td>${escapeHtml(w.startedBy)}</td><td class="mb-wrap">${escapeHtml(w.applications)}</td><td>${w.events}</td>
                                <td>${escapeHtml(duration(w.seconds))}</td>
                                <td>${escapeHtml(w.lastActivity)} · ${escapeHtml(w.lastApplication)}</td>
                                <td><span class="ae-status is-${w.status}">${escapeHtml(w.status)}</span></td>
                            </tr>`).join('') || '<tr><td colspan="9" class="ps-none">No unit of work started in this window.</td></tr>'}</tbody>
                    </table></div>
                    ${works.length >= 200 ? '<p class="ps-sub">Showing the newest 200; narrow the window or pick a kind.</p>' : ''}
                </section>
            </div>`;
        for (const select of this.root.querySelectorAll('[data-filter]')) {
            select.addEventListener('change', () => { this.filter[select.dataset.filter] = select.value; this.showWorks(); });
        }
    }

    // ---- one unit of work ----

    async showWork(workUid) {
        this.root.innerHTML = '<p class="ps-none">Reading the unit of work…</p>';
        let work;
        try {
            work = await this.get(`/api/app-events/work/${encodeURIComponent(workUid)}`);
        } catch (e) {
            this.root.innerHTML = `<p class="ps-crumb"><a class="ps-link" href="/app-events">App events</a></p><p class="ps-error">${escapeHtml(e.message)}</p>`;
            return;
        }
        const w = buildWork(work.events, { stuckHours: work.stuckHours });
        const first = w.steps[0];
        const subject = w.steps.find((s) => s.subjectType);
        this.root.innerHTML = `
            <div class="mb-page">
                <p class="ps-crumb"><a class="ps-link" href="/app-events">App events</a></p>
                <header class="mb-head"><h2 class="mb-title">${escapeHtml(first.namespace)} / ${escapeHtml(first.commandName)}</h2>
                    <span class="ae-status is-${w.status}">${escapeHtml(w.status)}</span>
                    ${work.registered ? '' : '<span class="ps-flag is-alert">unregistered kind</span>'}</header>
                <p class="ps-sub">${subject ? `${escapeHtml(subject.subjectType)} ${escapeHtml(subject.subjectKey)} · ` : ''}${w.steps.length} steps across ${escapeHtml(w.applications.join(', '))}
                    · <code>${escapeHtml(work.workUid)}</code> · <a class="ps-link" href="/logs?${new URLSearchParams({ model: 'app-event', work: work.workUid })}">its events in Log Explorer</a></p>
                <div class="ps-tiles">
                    <div class="ps-tile"><span class="ps-tile-label">From first step to last</span><span class="ps-tile-value">${escapeHtml(duration(w.totalSeconds))}</span></div>
                    <div class="ps-tile"><span class="ps-tile-label">Waiting between systems</span><span class="ps-tile-value">${escapeHtml(duration(w.waitingSeconds))}</span></div>
                    <div class="ps-tile"><span class="ps-tile-label">Being worked</span><span class="ps-tile-value">${escapeHtml(duration(w.workingSeconds))}</span></div>
                </div>
                <section class="ps-section">
                    <h3 class="ps-h3">Step by step</h3>
                    <ol class="ae-steps">${w.steps.map((s) => `
                        <li class="ae-step is-${escapeHtml(s.activity)}" style="--ae-depth:${s.depth}">
                            ${s.gapKind ? `<div class="ae-gap is-${s.gapKind}">${s.gapKind === 'after' ? '' : `${s.gapKind} `}${escapeHtml(duration(s.gapSeconds))}</div>` : ''}
                            <div class="ae-step-row">
                                <span class="ae-when">${escapeHtml(when(s.startAt))}</span>
                                <span class="ae-app">${escapeHtml(s.application)}</span>
                                <span class="ae-activity">${escapeHtml(s.activity)}</span>
                                <span class="ae-message">${escapeHtml(s.message ?? '')}</span>
                                <span class="ae-who">${escapeHtml(s.identifier ?? '')}</span>
                                ${s.lagSeconds >= 60 ? `<span class="ps-flag" title="Reported this long after it happened">arrived ${escapeHtml(duration(s.lagSeconds))} late</span>` : ''}
                                ${s.orphan ? '<span class="ps-flag is-alert" title="The event that caused it is not in this unit">cause missing</span>' : ''}
                            </div>
                        </li>`).join('')}</ol>
                    ${w.status === 'stuck' ? `<p class="ps-sub">Its last step is a hand-off more than ${work.stuckHours} hours ago, with nothing received since.</p>` : ''}
                </section>
            </div>`;
    }
}

export default new AppEventsPage();
