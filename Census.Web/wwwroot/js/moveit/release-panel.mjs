import { appLabel, days, daysAgo, escapeHtml, shortDate } from './format.mjs';
import { laneFor } from './lanes.mjs';
import { laneHue, stageHue } from './stage-hues.mjs';

// The executive view of the board (move-it.md §18): the same lanes, one card per release
// instead of one chip per work item. A card sits in the lane of the release's highest stage
// (question 02) and carries what an executive asks of it: what is in it, where its pieces
// are (a bar of its items by lane, from 01), and whether it is late, held, waiting on the
// client, or approved and not yet deployed (02, 04). Releases wholly in the top stage for
// longer than shippedDays fold into the application cell as shipped; abandoned ones are
// counted there. Every fact is a question's row; this only arranges them.

const DAY = 86_400_000;

export function classifyReleases({ lanes, items, releases, now, shippedDays }) {
    const top = lanes[lanes.length - 1].id;
    return releases.map((r) => {
        const open = items.filter((i) => i.ReleaseId === r.ReleaseId && i.Status !== 'removed');
        const lane = r.HighestStage === 'abandoned' ? null : laneFor(r.HighestStage, lanes);
        const allTop = lane === top && open.length > 0 && open.every((i) => laneFor(i.Status, lanes) === top);
        const shippedAt = allTop ? r.Since : null;
        const folded = shippedAt != null && (now - Date.parse(shippedAt)) > shippedDays * DAY;
        return { release: r, open, lane, atTop: lane === top, shippedAt, folded, abandoned: lane == null };
    });
}

// "The current work effort plus what is in production" (Robert, 2026-10-16): a release is
// current when it is on the way or recently live (not folded), or when it is the newest live
// release of its application — the one in PROD, however long ago it got there. Older live
// releases are superseded; abandoned ones are never current. Shared by the Releases register
// (All applications) and Division's default scope so the two pages agree on "current".
export function currentReleases(cards) {
    const newestLive = new Map();
    for (const c of cards) {
        if (c.shippedAt == null) continue;
        const best = newestLive.get(c.release.ApplicationId);
        if (!best || Date.parse(c.shippedAt) > Date.parse(best.shippedAt)) newestLive.set(c.release.ApplicationId, c);
    }
    return new Set(cards.filter((c) => !c.abandoned && (!c.folded || newestLive.get(c.release.ApplicationId) === c)));
}

export class ReleasePanel {
    constructor(onPick) {
        this.onPick = onPick;
        this.selectedId = null;
    }

    render(el, data) {
        this.el = el;
        const { lanes, applications, candidates, now, laneCounts } = data;
        const cards = classifyReleases(data);
        const candidateById = new Map(candidates.map((c) => [c.ReleaseId, c]));
        const rows = applications.map((app) => {
            const mine = cards.filter((c) => c.release.ApplicationId === app.ApplicationId);
            return {
                app,
                shipped: mine.filter((c) => c.folded).sort((a, b) => Date.parse(b.shippedAt) - Date.parse(a.shippedAt)),
                abandoned: mine.filter((c) => c.abandoned).length,
                byLane: Object.fromEntries(lanes.map((l) => [l.id, mine.filter((c) => !c.folded && c.lane === l.id)])),
            };
        }).filter((row) => row.shipped.length || row.abandoned || Object.values(row.byLane).some((list) => list.length));

        el.innerHTML = `
            <div class="mi-board" style="--lanes: ${lanes.length}">
                <div class="mi-board-head">
                    <div class="mi-corner"></div>
                    ${lanes.map((l) => `<div class="mi-lane-head" style="--lane: ${laneHue(l)}">${escapeHtml(l.label)}${laneCounts ? `<span class="mi-lane-n">${laneCounts.get(l.id) ?? 0}</span>` : ''}</div>`).join('')}
                </div>
                ${rows.map((row) => this.renderRow(row, lanes, candidateById, now)).join('')}
            </div>`;

        el.querySelectorAll('[data-release]').forEach((card) => card.addEventListener('click', () => {
            const id = Number(card.dataset.release);
            this.select(id === this.selectedId ? null : id);
            this.onPick(this.selectedId == null ? null : cards.find((c) => c.release.ReleaseId === this.selectedId));
        }));
        this.select(this.selectedId);
    }

    select(id) {
        this.selectedId = id;
        this.el?.querySelectorAll('[data-release]').forEach((card) => {
            card.classList.toggle('is-selected', Number(card.dataset.release) === id);
        });
    }

    renderRow(row, lanes, candidateById, now) {
        const inFlight = Object.values(row.byLane).reduce((n, list) => n + list.length, 0);
        const meta = [inFlight ? `${inFlight} in flight` : 'nothing in flight'];
        if (row.abandoned) meta.push(`${row.abandoned} abandoned`);
        return `
            <div class="mi-board-row">
                <div class="mi-app">
                    <span class="mi-app-name ${row.app.Name ? '' : 'is-unnamed'}">${escapeHtml(appLabel(row.app))}</span>
                    <span class="mi-app-meta">${meta.join(', ')}</span>
                    ${row.shipped.length ? `<span class="mi-app-meta mi-shipped">Shipped: ${row.shipped.map((c) =>
                        `<button type="button" class="mi-shipped-link" data-release="${c.release.ReleaseId}">${escapeHtml(c.release.Name)}</button> ${escapeHtml(shortDate(c.shippedAt))}`).join(', ')}</span>` : ''}
                </div>
                ${lanes.map((l) => `
                    <div class="mi-lane" style="--lane: ${laneHue(l)}">
                        ${row.byLane[l.id].map((c) => this.renderCard(c, lanes, candidateById.get(c.release.ReleaseId), now)).join('')}
                    </div>`).join('')}
            </div>`;
    }

    renderCard(card, lanes, candidate, now) {
        const r = card.release;
        const contents = [];
        if (r.Features) contents.push(count(r.Features, 'feature'));
        if (r.Fixes) contents.push(count(r.Fixes, 'fix', 'fixes'));
        const since = daysAgo(r.Since, now);
        const meta = [contents.join(', ') || 'nothing recorded'];
        if (card.shippedAt) meta.push(`shipped ${shortDate(card.shippedAt)}`);
        else if (since != null) meta.push(`${days(since)} here`);
        if (r.Evidence === 'asserted') meta.push('asserted');
        if (r.TargetDate && !card.shippedAt) meta.push(`target ${shortDate(r.TargetDate)}`);
        return `
            <button type="button" class="mi-card ${r.Kind === 'hotfix' ? 'is-hotfix' : ''}" data-release="${r.ReleaseId}" title="${escapeHtml(r.Name)}">
                <span class="mi-card-title">${escapeHtml(r.Name)}${r.Kind === 'hotfix' ? ' <span class="mi-card-kind">hotfix</span>' : ''}</span>
                <span class="mi-chip-meta">${meta.join(' · ')}</span>
                ${renderBar(card.open, lanes)}
                ${renderFlags(r, candidate, card, true)}
            </button>`;
    }
}

function count(n, singular, plural = `${singular}s`) {
    return `${n} ${n === 1 ? singular : plural}`;
}

// Where the release's pieces are: one segment per lane, width by item count.
export function renderBar(open, lanes) {
    if (open.length < 2) return '';
    const segments = lanes.map((l) => ({ lane: l, n: open.filter((i) => laneFor(i.Status, lanes) === l.id).length })).filter((s) => s.n);
    if (segments.length < 2) return '';
    return `<span class="mi-bar" title="${escapeHtml(segments.map((s) => `${s.n} ${s.lane.label}`).join(', '))}">
        ${segments.map((s) => `<span class="mi-bar-seg" style="--lane: ${laneHue(s.lane)}; flex: ${s.n}"></span>`).join('')}
    </span>`;
}

function renderFlags(r, candidate, card, brief = false) {
    const flags = [];
    const reason = brief && r.HoldReason?.length > 48 ? `${r.HoldReason.slice(0, 46).trimEnd()}…` : r.HoldReason;
    if (r.OnHold === 1) flags.push(`<span class="mi-flag is-hold" title="${escapeHtml(r.HoldReason ?? '')}">on hold${reason ? `: ${escapeHtml(reason)}` : ''}</span>`);
    if (r.PastTarget === 1) flags.push('<span class="mi-flag is-alert">late</span>');
    if (candidate) flags.push(candidate.Ready === 1
        ? '<span class="mi-flag is-ask">ready for client approval</span>'
        : `<span class="mi-flag is-hold" title="${escapeHtml(candidate.Blockers ?? '')}">waiting on a dependency</span>`);
    if (r.ApprovedAt && !card.atTop) flags.push('<span class="mi-flag is-ask">approved, not yet deployed</span>');
    if (r.Contradiction) flags.push(`<span class="mi-flag is-alert">${escapeHtml(r.Contradiction)}</span>`);
    return flags.length ? `<span class="mi-card-flags">${flags.join('')}</span>` : '';
}

// The drill-in for one release: its state in one line, then every item and where it is.
export function renderReleaseDetail(card, candidate, app, items, now) {
    const r = card.release;
    const row = (label, value) => value == null || value === '' ? '' : `<div class="mi-dt">${label}</div><div class="mi-dd">${value}</div>`;
    const since = daysAgo(r.Since, now);
    const mine = items.filter((i) => i.ReleaseId === r.ReleaseId);
    return `
        <h2 class="mi-detail-title">${escapeHtml(r.Name)}</h2>
        <p class="mi-detail-sub">${escapeHtml(r.Kind)} for ${escapeHtml(appLabel(app))}</p>
        ${renderFlags(r, candidate, card)}
        <dl class="mi-detail-grid">
            ${row('Where', `<span class="mi-stage" style="--lane: ${stageHue(r.HighestStage)}">${escapeHtml(r.HighestStage)}</span>${r.Evidence ? ` <span class="mi-muted">${escapeHtml(r.Evidence)}</span>` : ''}`)}
            ${row(card.shippedAt ? 'Shipped' : 'Since', r.Since ? `${shortDate(r.Since)}, ${days(since)}` : null)}
            ${row('Target', r.TargetDate ? shortDate(r.TargetDate) : 'none set')}
            ${row('Approved', r.ApprovedAt ? `${shortDate(r.ApprovedAt)} for <code>${escapeHtml(r.ApprovedBuild)}</code>` : 'not yet')}
            ${row('Waiting on', candidate && candidate.Ready !== 1 ? escapeHtml(candidate.Blockers) : null)}
        </dl>
        <h3 class="mi-detail-h3">What is in it</h3>
        <ul class="mi-detail-items">
            ${mine.map((i) => `
                <li class="${i.Status === 'removed' ? 'is-removed' : ''}">
                    <span>${escapeHtml(i.Title)} <span class="mi-muted">${escapeHtml(i.Kind)}</span></span>
                    ${i.Status === 'removed' ? '<span class="mi-muted">pulled</span>'
                        : `<span class="mi-stage" style="--lane: ${stageHue(i.Status)}">${escapeHtml(i.Status)}</span>`}
                </li>`).join('') || '<li class="mi-muted">Nothing recorded.</li>'}
        </ul>
        <p class="mi-detail-link"><a class="mi-button is-quiet" href="/moveit/release/${r.ReleaseId}">Open the release</a></p>`;
}
