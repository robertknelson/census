import { appLabel, days, daysAgo, escapeHtml, shortDate } from './format.mjs';

// Needs a word from you (move-it.md §23): what people have not said yet, derived from the
// answers the board already has (01, 02, 05's rule, 12) — nothing stored, nothing dismissed.
// A line goes away when the entry it asks for is made. The thresholds are settings.

export function findNeeds({ releases, items, events, approvals, history, applications, stages, isInbox }, { staleDays, comingDays }, now = Date.now()) {
    const topSort = Math.max(...stages.map((s) => s.Sort));
    const top = new Set(stages.filter((s) => s.Sort === topSort).map((s) => s.Stage));
    const appsById = new Map(applications.map((a) => [a.ApplicationId, a]));
    const lastEvent = new Map();
    for (const e of events) {
        const at = Date.parse(e.At);
        if (!(lastEvent.get(e.ReleaseId) > at)) lastEvent.set(e.ReleaseId, at);
    }
    const unapproved = new Set(approvals.filter((a) => a.Item === 'PROD without approval').map((a) => a.ReleaseId));

    const needs = [];
    for (const r of releases) {
        if (r.HighestStage === 'abandoned') continue;
        const live = top.has(r.HighestStage);
        const held = r.OnHold === 1;
        const reasons = [];
        if (r.PastTarget === 1 && !held) reasons.push(`past its target of ${shortDate(r.TargetDate)} with no hold saying why`);
        const there = daysAgo(r.Since, now);
        const quiet = daysAgo(lastEvent.has(r.ReleaseId) ? new Date(lastEvent.get(r.ReleaseId)).toISOString() : null, now);
        if (!live && !held && there != null && there > staleDays && (quiet == null || quiet > staleDays)) {
            reasons.push(`${r.HighestStage === 'with the devs' ? 'with the devs' : `at ${r.HighestStage}`} ${days(there)} with nothing recorded`);
        }
        if (unapproved.has(r.ReleaseId)) reasons.push('went live with no approval recorded');
        if (reasons.length) needs.push({ kind: 'release', applicationId: r.ApplicationId, releaseId: r.ReleaseId, title: r.Name, reasons });
    }
    for (const w of items) {
        const heard = daysAgo(w.Since, now);
        if (w.Status === 'no release' && heard != null && heard > comingDays) {
            needs.push({ kind: 'item', applicationId: w.ApplicationId, title: w.Title, reasons: [`heard ${days(heard)} ago and still in no release — still coming?`] });
        }
    }
    const unnamed = new Map();
    for (const h of history.filter(isInbox)) unnamed.set(`${h.ApplicationId}|${h.Build}`, h);
    const byApp = new Map();
    for (const h of unnamed.values()) byApp.set(h.ApplicationId, (byApp.get(h.ApplicationId) ?? 0) + 1);
    for (const [applicationId, n] of byApp) {
        needs.push({ kind: 'inbox', applicationId, title: `${n} ${n === 1 ? 'build' : 'builds'} past DEV`, reasons: ['nobody has named what is in them — Name it below'] });
    }
    return needs.map((n) => ({ ...n, app: appLabel(appsById.get(n.applicationId) ?? { ApplicationId: n.applicationId }) }));
}

export function renderNeeds(needs, open) {
    if (needs.length === 0) return '<section class="mi-needs is-clear"><p class="mi-needs-head">Nothing needs a word from you.</p></section>';
    const line = (n) => `
        <li class="mi-needs-item">
            <span class="mi-needs-what">${escapeHtml(n.app)} · ${n.kind === 'release'
                ? `<a class="mi-release-link" href="/moveit/release/${n.releaseId}">${escapeHtml(n.title)}</a>`
                : escapeHtml(n.title)}</span>
            <span class="mi-needs-why">${n.reasons.map(escapeHtml).join('; ')}</span>
        </li>`;
    return `
        <details class="mi-needs" ${open ? 'open' : ''}>
            <summary class="mi-needs-head">Needs a word from you <span class="mi-needs-count">${needs.length}</span></summary>
            <ul class="mi-needs-list">${needs.map(line).join('')}</ul>
        </details>`;
}
