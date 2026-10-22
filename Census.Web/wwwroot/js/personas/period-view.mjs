import { escapeHtml } from '../moveit/format.mjs';
import { spanText, summarize } from './period.mjs';

// The period view (personas.md §5): one page at every grain, answering the Executive's
// questions for the applications in scope — what shipped, against the period before; where the
// change landed; what is due; and, in the period holding today, what is stuck. Read-only; every
// number is a row from 02, 09 or the calendar.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (v) => { const d = new Date(v); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export class PeriodView {
    // applications: [{ applicationId, name }] in scope for this grain's feature.
    constructor({ data, period, applications, fiscalStart, now = new Date() }) {
        this.applications = applications;
        this.names = new Map(applications.map((a) => [a.applicationId, a.name]));
        this.summary = summarize({
            releases: data.releases, leads: data.leads, calendar: data.calendar, period, now, fiscalStart,
            applicationIds: applications.map((a) => a.applicationId),
        });
    }

    name(id) {
        return escapeHtml(this.names.get(id) ?? `Application ${id}`);
    }

    html() {
        const s = this.summary;
        const grain = s.period.grain;
        return `
            <section class="ps-section ps-period">
                <div class="ps-period-head">
                    <button type="button" class="ps-step" data-shift="-1" aria-label="Previous ${grain}" title="${escapeHtml(s.previous.label)}">‹</button>
                    <div class="ps-period-title">
                        <h2 class="ps-h">${escapeHtml(s.period.label)}</h2>
                        <p class="ps-sub">${spanText(s.period)}${s.current ? ` · this ${grain}` : ''} · ${plural(this.applications.length, 'application')}</p>
                    </div>
                    <button type="button" class="ps-step" data-shift="1" aria-label="Next ${grain}" title="${escapeHtml(s.next.label)}">›</button>
                    ${s.current ? '' : `<button type="button" class="ps-today" data-shift="today">This ${grain}</button>`}
                </div>
                <div class="ps-tiles">
                    ${this.tile('Shipped', 'releases first live', s.tiles.shipped)}
                    ${this.tile('Moves', 'builds arriving at a stage', s.tiles.moves)}
                    ${this.tile('To production', 'arrivals at PROD', s.tiles.prodMoves)}
                    ${this.tile('Approvals', 'client sign-offs', s.tiles.approvals)}
                    ${this.tile('Rollbacks', 'an older build put back', s.tiles.rollbacks)}
                </div>
            </section>
            <div class="ps-columns">
                ${this.shippedHtml()}
                ${this.changeHtml()}
                ${this.dueHtml()}
                ${s.stuck ? this.stuckHtml() : ''}
            </div>
            ${this.coverageHtml()}`;
    }

    tile(label, hint, { now, before }) {
        return `
            <div class="ps-tile" title="${escapeHtml(hint)}">
                <span class="ps-tile-label">${escapeHtml(label)}</span>
                <span class="ps-tile-value">${now}</span>
                <span class="ps-tile-vs">was ${before} in ${escapeHtml(this.summary.previous.label)}</span>
            </div>`;
    }

    shippedHtml() {
        const rows = this.summary.shipped;
        return `
            <section class="ps-section">
                <h3 class="ps-h3">Shipped</h3>
                ${rows.length === 0 ? '<p class="ps-none">Nothing reached production in this period.</p>' : `
                <ul class="ps-list">
                    ${rows.map((r) => `
                        <li>
                            <span class="ps-list-main"><strong>${escapeHtml(r.name)}</strong> · ${this.name(r.applicationId)}${r.kind === 'hotfix' ? ' <span class="ps-flag">hotfix</span>' : ''}${r.rolledBack ? ' <span class="ps-flag is-alert">left production since</span>' : ''}</span>
                            <span class="ps-list-end">live ${shortDate(r.at)}${r.days != null ? ` · ${plural(r.days, 'day')} from first build` : ''}</span>
                        </li>`).join('')}
                </ul>`}
            </section>`;
    }

    changeHtml() {
        const rows = this.summary.byApp;
        const max = Math.max(1, ...rows.map((r) => r.moves));
        return `
            <section class="ps-section">
                <h3 class="ps-h3">Where the change landed</h3>
                ${rows.length === 0 ? '<p class="ps-none">No build moved in this period.</p>' : `
                <ul class="ps-bars">
                    ${rows.map((r) => `
                        <li class="ps-bar-row" title="${this.name(r.applicationId)}: ${plural(r.moves, 'move')}, ${r.prodMoves} to production">
                            <span class="ps-bar-name">${this.name(r.applicationId)}</span>
                            <span class="ps-bar-track"><span class="ps-bar" style="width:${(r.moves / max) * 100}%"></span></span>
                            <span class="ps-bar-value">${r.moves}<span class="ps-bar-sub">${r.prodMoves ? ` · ${r.prodMoves} to PROD` : ''}</span></span>
                        </li>`).join('')}
                </ul>`}
            </section>`;
    }

    dueHtml() {
        const s = this.summary;
        const rows = s.due;
        return `
            <section class="ps-section">
                <h3 class="ps-h3">Due this ${s.period.grain} and next</h3>
                ${rows.length === 0 ? '<p class="ps-none">No release not yet live has a target date in these two periods.</p>' : `
                <ul class="ps-list">
                    ${rows.map((r) => `
                        <li>
                            <span class="ps-list-main"><strong>${escapeHtml(r.Name)}</strong> · ${this.name(r.ApplicationId)}${r.PastTarget === 1 ? ' <span class="ps-flag is-alert">past target</span>' : ''}</span>
                            <span class="ps-list-end">target ${shortDate(String(r.TargetDate).slice(0, 10) + 'T00:00:00')} · now ${escapeHtml(r.HighestStage)}</span>
                        </li>`).join('')}
                </ul>`}
            </section>`;
    }

    stuckHtml() {
        const rows = this.summary.stuck;
        return `
            <section class="ps-section">
                <h3 class="ps-h3">Stuck today</h3>
                ${rows.length === 0 ? '<p class="ps-none">Nothing on hold or past its target.</p>' : `
                <ul class="ps-list">
                    ${rows.map((r) => `
                        <li>
                            <span class="ps-list-main"><strong>${escapeHtml(r.Name)}</strong> · ${this.name(r.ApplicationId)}${r.OnHold === 1 ? ' <span class="ps-flag is-hold">on hold</span>' : ''}${r.PastTarget === 1 ? ' <span class="ps-flag is-alert">past target</span>' : ''}</span>
                            <span class="ps-list-end">${r.OnHold === 1 && r.HoldReason ? escapeHtml(r.HoldReason) : `at ${escapeHtml(r.HighestStage)}`}</span>
                        </li>`).join('')}
                </ul>`}
            </section>`;
    }

    // Curation coverage (personas.md §2): how much of what moved is accounted for. Show the gap.
    coverageHtml() {
        const s = this.summary;
        const moves = s.tiles.moves.now;
        if (moves === 0) return '';
        const open = moves - s.claimed;
        return `<p class="ps-foot">${s.claimed} of ${plural(moves, 'build move')} in this period ${s.claimed === 1 ? 'belongs' : 'belong'} to a release${open ? `; ${open} ${open === 1 ? 'is' : 'are'} not yet claimed by one` : ''}.</p>`;
    }
}
