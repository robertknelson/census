import { escapeHtml } from './format.mjs';
import { laneFor } from './lanes.mjs';
import { classifyReleases } from './release-panel.mjs';

const WEEK = 7;

// The weekly-meeting numbers (move-it.md §13, level 1; §26 for where they sit): open work
// items per lane from question 01, and the release counts from questions 02 and 04. Every
// number is a count of rows the questions already return — nothing is computed here that a
// question does not say. The per-lane numbers head the board's own lane columns; the release
// numbers are one quiet line in the page's header.
export class CountsPanel {
    // view 'releases' (§18) counts releases in flight per lane; 'items' counts open work items.
    laneCounts(data) {
        const { lanes, items, view } = data;
        const open = items.filter((i) => i.Status !== 'removed');
        const inFlight = classifyReleases(data).filter((c) => !c.abandoned && !c.shippedAt);
        return new Map(lanes.map((lane) => [lane.id, view === 'releases'
            ? inFlight.filter((c) => c.lane === lane.id).length
            : open.filter((i) => laneFor(i.Status, lanes) === lane.id).length]));
    }

    render(el, data) {
        const { releases, candidates, now, view, shippedDays } = data;
        const cards = classifyReleases(data);
        const approvedNotDeployed = cards.filter((c) => c.release.ApprovedAt && !c.atTop && !c.abandoned).length;
        const shipped = cards.filter((c) => c.shippedAt && !c.folded).length;

        const pastTarget = releases.filter((r) => r.PastTarget === 1).length;
        const onHold = releases.filter((r) => r.OnHold === 1).length;
        const reachedProd = releases.filter((r) => r.HighestStage === 'PROD' && r.Since
            && (now - Date.parse(r.Since)) <= WEEK * 86_400_000).length;
        const ready = candidates.filter((c) => c.Ready === 1).length;
        const n = (count, label, tone = '', title = '') => `
            <li class="${count ? tone : ''}"${title ? ` title="${escapeHtml(title)}"` : ''}><span class="mi-num">${count}</span> ${label}</li>`;

        el.innerHTML = `
            <ul class="mi-numbers" aria-label="Releases">
                ${n(pastTarget, 'past target', 'is-alert', 'past target, not in PROD')}
                ${n(onHold, 'on hold', 'is-hold')}
                ${n(candidates.length, `awaiting approval${candidates.length ? `, ${ready} ready` : ''}`, '', 'awaiting client approval')}
                ${n(approvedNotDeployed, 'approved, not out', '', 'approved, not yet deployed')}
                ${view === 'releases'
                    ? n(shipped, `shipped, ${shippedDays}d`, '', `shipped in the last ${shippedDays} days`)
                    : n(reachedProd, `to PROD, ${WEEK}d`, '', `reached PROD in the last ${WEEK} days`)}
            </ul>`;
    }
}
