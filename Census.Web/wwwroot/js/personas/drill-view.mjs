import { escapeHtml } from '../moveit/format.mjs';
import { contains, isoDay } from './period.mjs';
import { periodHeadHtml } from './period-view.mjs';
import { buildsIn, deploymentsIn } from './drill.mjs';

// The Tech Lead's drill-downs (personas.md §5.3): every deployment, and every build, in a period
// for the applications in scope. Same period steps as the period view, with a choice of grain.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayText = (iso) => `${iso} ${WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()]}`;
const releaseLink = (id, name) => `<a class="ps-link" href="/moveit/release/${id}">${escapeHtml(name)}</a>`;

class DrillView {
    constructor({ period, applications, grains, now = new Date() }) {
        this.period = period;
        this.applications = applications;
        this.grains = grains;
        this.current = contains(period, now);
        this.names = new Map(applications.map((a) => [a.applicationId, a.name]));
    }

    name(id) {
        return escapeHtml(this.names.get(id) ?? `Application ${id}`);
    }

    head(title, sub) {
        return `
            <section class="ps-section ps-period">
                ${periodHeadHtml(this.period, { current: this.current, count: this.applications.length, grains: this.grains })}
                <p class="ps-sub"><strong>${escapeHtml(title)}</strong> · ${escapeHtml(sub)}</p>
            </section>`;
    }
}

export class DeploymentsView extends DrillView {
    constructor(options) {
        super(options);
        this.days = deploymentsIn(options.data.calendar, this.period, this.applications.map((a) => a.applicationId));
    }

    html() {
        const total = this.days.reduce((n, d) => n + d.rows.length, 0);
        const line = (r) => `
            <tr class="${r.Kind === 'returned' ? 'is-returned' : ''}">
                <td>${this.name(r.ApplicationId)}</td>
                <td><span class="ps-stage">${escapeHtml(r.Stage)}</span></td>
                <td class="ps-mono">${escapeHtml(r.Build)}</td>
                <td>${r.Kind === 'returned'
                    ? `<span class="ps-flag is-alert">rolled back</span> replaced <span class="ps-mono">${escapeHtml(r.ReplacedBuild ?? '?')}</span>`
                    : r.ReleaseId ? releaseLink(r.ReleaseId, r.Release) : '<span class="ps-flag">unclaimed</span>'}</td>
            </tr>`;
        return this.head('Deployments', `${total} in this period — every build arriving at a stage, and every older build put back`) + (total === 0
            ? '<p class="ps-empty">No build arrived at any stage in this period.</p>'
            : `<section class="ps-section"><div class="ps-scroll"><table class="ps-table">
                <thead><tr><th>Application</th><th>Stage</th><th>Build</th><th>Release</th></tr></thead>
                ${this.days.map((d) => `
                    <tbody>
                        <tr class="ps-day"><th colspan="4">${dayText(d.day)}</th></tr>
                        ${d.rows.map(line).join('')}
                    </tbody>`).join('')}
            </table></div></section>`);
    }
}

export class BuildsView extends DrillView {
    constructor(options) {
        super(options);
        const order = new Map(options.data.stages.map((s) => [s.Stage, s.Sort]));
        this.builds = buildsIn(options.data.buildsSeen, this.period, this.applications.map((a) => a.applicationId), order, options.data.releases);
    }

    html() {
        const open = this.builds.filter((b) => b.claims.length === 0).length;
        const line = (b) => `
            <tr>
                <td>${this.name(b.applicationId)}</td>
                <td class="ps-mono">${escapeHtml(b.build)}${b.current ? ' <span class="ps-flag">current</span>' : ''}</td>
                <td>${isoDay(b.firstSeen)}${b.lastSeen && isoDay(b.lastSeen) !== isoDay(b.firstSeen) ? ` – ${isoDay(b.lastSeen)}` : ''}</td>
                <td>${b.stages.map((s) => `<span class="ps-stage">${escapeHtml(s)}</span>`).join(' ')}</td>
                <td>${b.claims.length ? b.claims.map((c) => releaseLink(c.releaseId, c.name)).join(', ') : '<span class="ps-flag">unclaimed</span>'}</td>
            </tr>`;
        return this.head('Builds', `${this.builds.length} first seen in this period${open ? `, ${open} claimed by no release` : ''}`) + (this.builds.length === 0
            ? '<p class="ps-empty">No build was first seen in this period.</p>'
            : `<section class="ps-section"><div class="ps-scroll"><table class="ps-table">
                <thead><tr><th>Application</th><th>Build</th><th>Seen</th><th>Stages</th><th>Claimed by</th></tr></thead>
                <tbody>${this.builds.map(line).join('')}</tbody>
            </table></div></section>`);
    }
}
