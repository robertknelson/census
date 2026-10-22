import { findNeeds } from '../moveit/needs-a-word.mjs';

// The Needs you queue (personas.md §5.2): every gap waiting on a human word, for the
// applications the member curates. Nothing stored, nothing dismissed — a line goes when the
// entry it asks for is made. History's own rules (needs-a-word.mjs) are used as they are, so the
// two never disagree; the queue adds what History does not ask: an empty release, a stage that
// disagrees with its registration, a feature ahead of what it depends on, a release ready for
// the client. Each line links to the Move It page where it is fixed, and carries the actions that
// settle it in place (P-3d) — each naming the curate feature it needs, so a member sees only the
// actions they hold on that line's application.

export const SECTIONS = [
    { id: 'inbox', title: 'Builds nobody has named', hint: 'Seen past DEV, claimed by no release — claim each for the release it belongs to' },
    { id: 'release', title: 'Releases waiting on a word', hint: 'Past target, quiet, or live without an approval' },
    { id: 'empty', title: 'Releases with nothing in them', hint: 'No feature or fix recorded' },
    { id: 'item', title: 'Heard about, still in no release', hint: 'Still coming?' },
    { id: 'order', title: 'Ahead of what it depends on', hint: 'A dependent item at a higher stage than its dependency' },
    { id: 'stage', title: 'A stage that disagrees', hint: 'The endpoint reports a stage other than the one it is registered for' },
    { id: 'approve', title: 'Ready for the client', hint: 'Record the approval when it is given' },
];

const releaseHref = (id) => `/moveit/release/${id}`;

export function buildQueue(data, settings, applicationIds, now = Date.now()) {
    const scope = new Set(applicationIds);
    const inScope = (id) => scope.has(id);
    const sort = new Map(data.stages.map((s) => [s.Stage.toLowerCase(), s.Sort]));
    const devSort = Math.min(...data.stages.map((s) => s.Sort));
    const isInbox = (r) => !r.ReleaseId && sort.get(String(r.Stage).toLowerCase()) > devSort;

    const topSort = Math.max(...data.stages.map((s) => s.Sort));
    const topStage = data.stages.find((s) => s.Sort === topSort)?.Stage;
    const lines = [];

    // History's rules for releases and heard items. Its inbox line is one per application; here
    // each unnamed build is its own line, so each can be claimed.
    const needs = findNeeds({
        releases: data.status, items: data.items, events: data.events, approvals: data.approvals,
        history: data.history, applications: data.applications, stages: data.stages, isInbox,
    }, settings, now);
    for (const n of needs.filter((x) => inScope(x.applicationId) && x.kind !== 'inbox')) {
        const actions = [];
        if (n.kind === 'release') {
            if (n.reasons.some((r) => r.includes('no approval'))) actions.push({ kind: 'approve', feature: 'curate.events', releaseId: n.releaseId, stage: topStage });
            if (n.reasons.some((r) => r.includes('past its target') || r.includes('nothing recorded'))) actions.push({ kind: 'hold', feature: 'curate.events', releaseId: n.releaseId });
        }
        lines.push({
            section: n.kind, applicationId: n.applicationId, title: n.title, why: n.reasons.join('; '),
            href: n.kind === 'release' ? releaseHref(n.releaseId) : '/moveit/history', actions,
        });
    }

    const unnamed = new Map();
    for (const h of data.history.filter((x) => inScope(x.ApplicationId) && isInbox(x))) {
        const key = `${h.ApplicationId}|${h.Build}`;
        const line = unnamed.get(key) ?? { applicationId: h.ApplicationId, build: h.Build, stages: new Set() };
        line.stages.add(h.Stage);
        unnamed.set(key, line);
    }
    for (const u of unnamed.values()) {
        const choices = data.status
            .filter((r) => r.ApplicationId === u.applicationId && r.HighestStage !== 'abandoned')
            .map((r) => ({ releaseId: r.ReleaseId, name: r.Name }));
        const stages = [...u.stages].sort((a, b) => (sort.get(a.toLowerCase()) ?? 0) - (sort.get(b.toLowerCase()) ?? 0));
        lines.push({
            section: 'inbox', applicationId: u.applicationId, title: u.build, why: `seen at ${stages.join(', ')}; claimed by no release`,
            href: '/moveit/history', actions: choices.length ? [{ kind: 'claim', feature: 'curate.associations', build: u.build, choices }] : [],
        });
    }

    for (const r of data.status.filter((x) => inScope(x.ApplicationId) && x.Composition === 'empty' && x.HighestStage !== 'abandoned')) {
        lines.push({ section: 'empty', applicationId: r.ApplicationId, title: r.Name, why: `${r.Kind}, at ${r.HighestStage}`, href: releaseHref(r.ReleaseId), actions: [] });
    }
    for (const v of data.violations.filter((x) => x.Violation === 'current' && inScope(x.DependentApp))) {
        lines.push({
            section: 'order', applicationId: v.DependentApp, title: v.Dependent,
            why: `at ${v.DependentStage}, but ${v.DependsOn} is ${v.DependsOnStage === 'nowhere' ? 'nowhere yet' : `at ${v.DependsOnStage}`}${v.Note ? ` — ${v.Note}` : ''}`,
            href: '/moveit/features', actions: [],
        });
    }
    for (const m of data.mismatches.filter((x) => inScope(x.ApplicationId))) {
        lines.push({
            section: 'stage', applicationId: m.ApplicationId, title: m.Identifier,
            why: `registered ${m.RegisteredStage}, reports ${m.ReportedStage}${m.Machine ? ` on ${m.Machine}` : ''}`,
            href: '/moveit/history', actions: [],
        });
    }
    for (const r of data.ready.filter((x) => inScope(x.ApplicationId))) {
        lines.push({
            section: 'approve', applicationId: r.ApplicationId, title: r.Name,
            why: r.Ready === 1 ? `ready at ${r.AtStage}; no approval yet` : `at ${r.AtStage}, blocked by ${r.Blockers}`,
            href: releaseHref(r.ReleaseId),
            actions: r.Ready === 1 ? [{ kind: 'approve', feature: 'curate.events', releaseId: r.ReleaseId, stage: topStage }] : [],
        });
    }

    return SECTIONS
        .map((s) => ({ ...s, lines: lines.filter((l) => l.section === s.id) }))
        .filter((s) => s.lines.length > 0);
}

// The actions a member may take on a line: those whose feature is on for the line's application.
export function actionsFor(line, access) {
    const app = access.applications.find((a) => a.applicationId === line.applicationId);
    return line.actions.filter((a) => app?.features.includes(a.feature));
}

// The Move It write an action makes (move-it.md §15, §16), with the member as By.
export function requestFor(action, values, by, now = new Date()) {
    if (action.kind === 'claim') {
        return { endpoint: 'claim-build', body: { releaseId: Number(values.releaseId), build: action.build, by } };
    }
    if (action.kind === 'approve') {
        return { endpoint: 'event', body: { releaseId: action.releaseId, kind: 'approved', stage: action.stage ?? null, build: null, at: now.toISOString(), by, note: values.note || null } };
    }
    return { endpoint: 'event', body: { releaseId: action.releaseId, kind: 'hold', stage: null, build: null, at: now.toISOString(), by, note: values.note } };
}
