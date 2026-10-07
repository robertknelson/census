import { appLabel, days, daysAgo, escapeHtml, shortDate } from './format.mjs';
import { laneFor, topLane } from './lanes.mjs';
import { laneHue, stageHue } from './stage-hues.mjs';

const DAY = 86_400_000;

// Each open item with its lane, and whether it is shipped (§27): at the top stage for longer
// than shippedDays, in which case it leaves the lanes and is listed in the application cell,
// as the Releases view does with a whole release. Removed items are not here; they are
// counted, not drawn.
export function classifyItems({ lanes, items, now, shippedDays }) {
    const top = topLane(lanes);
    return items.filter((i) => i.Status !== 'removed').map((item) => {
        const lane = lanes.find((l) => l.id === laneFor(item.Status, lanes));
        const shipped = top != null && lane === top && item.Since != null;
        const folded = shipped && (now - Date.parse(item.Since)) > shippedDays * DAY;
        return { item, lane, shipped, folded };
    });
}

// Question 01 as lanes (move-it.md §13, level 1): one row per application, one column per
// lane, every open work item a chip in the lane it is at. Removed items are counted in the
// application cell, not drawn — they are not open. A chip is the drill-in: clicking it
// hands the item to the page, which shows its detail.
export class BoardPanel {
    constructor(onPick) {
        this.onPick = onPick;
        this.selectedId = null;
    }

    render(el, data) {
        this.el = el;
        const { lanes, items, applications, releases, now, laneCounts } = data;
        const releasesById = new Map(releases.map((r) => [r.ReleaseId, r]));
        const classified = classifyItems(data);
        const rows = applications.map((app) => {
            const mine = classified.filter((c) => c.item.ApplicationId === app.ApplicationId);
            return {
                app,
                removed: items.filter((i) => i.ApplicationId === app.ApplicationId && i.Status === 'removed').length,
                releases: releases.filter((r) => r.ApplicationId === app.ApplicationId),
                shipped: mine.filter((c) => c.folded).sort((a, b) => Date.parse(b.item.Since) - Date.parse(a.item.Since)),
                byLane: Object.fromEntries(lanes.map((l) => [l.id, mine.filter((c) => !c.folded && c.lane === l)])),
            };
        });

        el.innerHTML = `
            <div class="mi-board" style="--lanes: ${lanes.length}">
                <div class="mi-board-head">
                    <div class="mi-corner"></div>
                    ${lanes.map((l) => `<div class="mi-lane-head" style="--lane: ${laneHue(l)}">${escapeHtml(l.label)}${laneCounts ? `<span class="mi-lane-n">${laneCounts.get(l.id) ?? 0}</span>` : ''}</div>`).join('')}
                </div>
                ${rows.map((row) => this.renderRow(row, lanes, releasesById, now)).join('')}
            </div>`;

        el.querySelectorAll('[data-item]').forEach((chip) => chip.addEventListener('click', () => {
            const id = Number(chip.dataset.item);
            this.select(id === this.selectedId ? null : id);
            this.onPick(this.selectedId == null ? null : items.find((i) => i.WorkItemId === this.selectedId));
        }));
        this.select(this.selectedId);
    }

    select(id) {
        this.selectedId = id;
        this.el?.querySelectorAll('[data-item]').forEach((chip) => {
            chip.classList.toggle('is-selected', Number(chip.dataset.item) === id);
        });
    }

    renderRow(row, lanes, releasesById, now) {
        const total = Object.values(row.byLane).reduce((n, list) => n + list.length, 0);
        const releaseNames = row.releases.map((r) => escapeHtml(r.Name)).join(', ');
        return `
            <div class="mi-board-row">
                <div class="mi-app">
                    <span class="mi-app-name ${row.app.Name ? '' : 'is-unnamed'}">${escapeHtml(appLabel(row.app))}</span>
                    <span class="mi-app-meta">${total ? `${total} open` : 'nothing open'}${row.removed ? `, ${row.removed} removed` : ''}</span>
                    ${releaseNames ? `<span class="mi-app-meta">${releaseNames}</span>` : ''}
                    ${row.shipped.length ? `<span class="mi-app-meta mi-shipped">Shipped: ${row.shipped.map((c) =>
                        `<button type="button" class="mi-shipped-link" data-item="${c.item.WorkItemId}" title="${escapeHtml(c.item.Title)}">${escapeHtml(c.item.Title)}</button> ${escapeHtml(shortDate(c.item.Since))}`).join(', ')}</span>` : ''}
                </div>
                ${lanes.map((l) => `
                    <div class="mi-lane" style="--lane: ${laneHue(l)}">
                        ${row.byLane[l.id].map((c) => this.renderChip(c, releasesById.get(c.item.ReleaseId), now)).join('')}
                    </div>`).join('')}
            </div>`;
    }

    // The meta line says where in words the lane cannot: "in UAT" when the lane holds peers,
    // "shipped <date>" at the top, otherwise how long it has sat in the lane (§27).
    renderChip({ item, lane, shipped }, release, now) {
        const since = daysAgo(item.Since, now);
        const meta = [];
        if (item.Release) meta.push(escapeHtml(item.Release));
        else if (item.Status === 'no release') meta.push('no release yet');
        if (shipped) meta.push(`shipped ${escapeHtml(shortDate(item.Since))}`);
        else if (since != null && lane.stages.length > 1) meta.push(`${days(since)} in ${escapeHtml(item.Status)}`);
        else if (since != null) meta.push(`${days(since)} here`);
        if (item.Evidence === 'asserted') meta.push('asserted');
        if (item.Status === 'not deployed') meta.push('build known, not seen');
        if (item.Status === 'no evidence') meta.push('app gives no evidence');
        const flags = [];
        if (release?.OnHold === 1) flags.push('<span class="mi-flag is-hold" title="Release on hold">hold</span>');
        if (release?.PastTarget === 1) flags.push('<span class="mi-flag is-alert" title="Release past its target date">late</span>');
        return `
            <button type="button" class="mi-chip is-${escapeHtml(item.Kind)}" data-item="${item.WorkItemId}" title="${escapeHtml(item.Title)}">
                <span class="mi-chip-title">${escapeHtml(item.Title)}</span>
                <span class="mi-chip-meta">${meta.join(', ')}${flags.length ? ' ' + flags.join(' ') : ''}</span>
            </button>`;
    }
}

function count(n, singular, plural = `${singular}s`) {
    return `${n} ${n === 1 ? singular : plural}`;
}

// The drill-in for one work item: what question 01 knows, plus the release row from 02. An
// item with no release (§20) shows what was heard and where, and no release section.
export function renderDetail(item, release, app, now, lanes = []) {
    const row = (label, value) => value == null || value === '' ? '' : `<div class="mi-dt">${label}</div><div class="mi-dd">${value}</div>`;
    const since = daysAgo(item.Since, now);
    const heard = item.Status === 'no release';
    const top = topLane(lanes);
    const shipped = top != null && laneFor(item.Status, lanes) === top.id;
    return `
        <h2 class="mi-detail-title">${escapeHtml(item.Title)}</h2>
        <p class="mi-detail-sub">${escapeHtml(item.Kind)} ${item.Release ? `in ${escapeHtml(item.Release)} ` : ''}for ${escapeHtml(appLabel(app))}${heard ? ', not in a release yet' : ''}</p>
        <dl class="mi-detail-grid">
            ${row('Where', `<span class="mi-stage" style="--lane: ${stageHue(item.Status)}">${escapeHtml(item.Status)}</span>${item.Evidence ? ` <span class="mi-muted">${escapeHtml(item.Evidence)}</span>` : ''}`)}
            ${row(heard ? 'Heard' : shipped ? 'Shipped' : 'Since', item.Since ? `${shortDate(item.Since)}, ${days(since)}${shipped ? ' ago' : ''}` : null)}
            ${row('Note', escapeHtml(item.Description))}
            ${heard ? '' : row('Build', item.IncludedInBuild ? `<code>${escapeHtml(item.IncludedInBuild)}</code>` : 'not built yet')}
            ${row('Built by', escapeHtml(item.BuiltBy))}
            ${row('Reference', escapeHtml(item.ExternalRef))}
        </dl>
        ${heard ? '<p class="mi-muted">It goes into a release from the History page, when a release is named or a build is.</p>' : `
        <h3 class="mi-detail-h3">The release</h3>
        <dl class="mi-detail-grid">
            ${row('Kind', release ? `${escapeHtml(release.Kind)}, ${escapeHtml(release.Composition)}` : null)}
            ${row('Contents', release ? `${count(release.Features, 'feature')}, ${count(release.Fixes, 'fix', 'fixes')}${release.WithDevs ? `, ${release.WithDevs} still with the developers` : ''}${release.Removed ? `, ${release.Removed} removed` : ''}` : null)}
            ${row('Highest stage', release ? escapeHtml(release.HighestStage) : null)}
            ${row('Target', release?.TargetDate ? `${shortDate(release.TargetDate)}${release.PastTarget === 1 ? ' <span class="mi-flag is-alert">late</span>' : ''}` : null)}
            ${row('On hold', release?.OnHold === 1 ? escapeHtml(release.HoldReason ?? 'no reason recorded') : null)}
            ${row('Approved', release?.ApprovedAt ? `${shortDate(release.ApprovedAt)} for <code>${escapeHtml(release.ApprovedBuild)}</code>` : null)}
            ${row('Contradiction', escapeHtml(release?.Contradiction))}
        </dl>
        ${release ? `<p class="mi-detail-link"><a class="mi-button is-quiet" href="/moveit/release/${release.ReleaseId}">Open the release</a></p>` : ''}`}`;
}
