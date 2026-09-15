import { appLabel, days, daysAgo, escapeHtml, shortDate } from './format.mjs';
import { laneFor } from './lanes.mjs';
import { laneHue, stageHue } from './stage-hues.mjs';

// Question 01 as lanes (move-it.md §13, level 1): one row per application, one column per
// lane, every open work item a chip in the lane it is at. Removed items are counted in the
// application cell, not drawn — they are not open. A chip is the drill-in: clicking it
// hands the item to the page, which shows its detail.
export class BoardPanel {
    constructor(onPick) {
        this.onPick = onPick;
        this.selectedId = null;
    }

    render(el, { lanes, items, applications, releases, now }) {
        this.el = el;
        const releasesById = new Map(releases.map((r) => [r.ReleaseId, r]));
        const rows = applications.map((app) => {
            const mine = items.filter((i) => i.ApplicationId === app.ApplicationId);
            return {
                app,
                removed: mine.filter((i) => i.Status === 'removed').length,
                releases: releases.filter((r) => r.ApplicationId === app.ApplicationId),
                byLane: Object.fromEntries(lanes.map((l) => [l.id,
                    mine.filter((i) => i.Status !== 'removed' && laneFor(i.Status, lanes) === l.id)])),
            };
        });

        el.innerHTML = `
            <div class="mi-board" style="--lanes: ${lanes.length}">
                <div class="mi-board-head">
                    <div class="mi-corner"></div>
                    ${lanes.map((l) => `<div class="mi-lane-head" style="--lane: ${laneHue(l)}">${escapeHtml(l.label)}</div>`).join('')}
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
                </div>
                ${lanes.map((l) => `
                    <div class="mi-lane" style="--lane: ${laneHue(l)}">
                        ${row.byLane[l.id].map((i) => this.renderChip(i, releasesById.get(i.ReleaseId), now)).join('')}
                    </div>`).join('')}
            </div>`;
    }

    renderChip(item, release, now) {
        const since = daysAgo(item.Since, now);
        const meta = [];
        if (item.Release) meta.push(escapeHtml(item.Release));
        if (since != null) meta.push(`${days(since)} here`);
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

// The drill-in for one work item: what question 01 knows, plus the release row from 02.
export function renderDetail(item, release, app, now) {
    const row = (label, value) => value == null || value === '' ? '' : `<div class="mi-dt">${label}</div><div class="mi-dd">${value}</div>`;
    const since = daysAgo(item.Since, now);
    return `
        <h2 class="mi-detail-title">${escapeHtml(item.Title)}</h2>
        <p class="mi-detail-sub">${escapeHtml(item.Kind)} in ${escapeHtml(item.Release)} for ${escapeHtml(appLabel(app))}</p>
        <dl class="mi-detail-grid">
            ${row('Where', `<span class="mi-stage" style="--lane: ${stageHue(item.Status)}">${escapeHtml(item.Status)}</span>${item.Evidence ? ` <span class="mi-muted">${escapeHtml(item.Evidence)}</span>` : ''}`)}
            ${row('Since', item.Since ? `${shortDate(item.Since)}, ${days(since)}` : null)}
            ${row('Build', item.IncludedInBuild ? `<code>${escapeHtml(item.IncludedInBuild)}</code>` : 'not built yet')}
            ${row('Built by', escapeHtml(item.BuiltBy))}
            ${row('Reference', escapeHtml(item.ExternalRef))}
        </dl>
        <h3 class="mi-detail-h3">The release</h3>
        <dl class="mi-detail-grid">
            ${row('Kind', release ? `${escapeHtml(release.Kind)}, ${escapeHtml(release.Composition)}` : null)}
            ${row('Contents', release ? `${count(release.Features, 'feature')}, ${count(release.Fixes, 'fix', 'fixes')}${release.WithDevs ? `, ${release.WithDevs} still with the developers` : ''}${release.Removed ? `, ${release.Removed} removed` : ''}` : null)}
            ${row('Highest stage', release ? escapeHtml(release.HighestStage) : null)}
            ${row('Target', release?.TargetDate ? `${shortDate(release.TargetDate)}${release.PastTarget === 1 ? ' <span class="mi-flag is-alert">late</span>' : ''}` : null)}
            ${row('On hold', release?.OnHold === 1 ? escapeHtml(release.HoldReason ?? 'no reason recorded') : null)}
            ${row('Approved', release?.ApprovedAt ? `${shortDate(release.ApprovedAt)} for <code>${escapeHtml(release.ApprovedBuild)}</code>` : null)}
            ${row('Contradiction', escapeHtml(release?.Contradiction))}
        </dl>`;
}
