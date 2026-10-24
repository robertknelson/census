// Usage's arithmetic (usage.md §4): the figures against the previous period, durations and rates in
// words, the pages that went unused, and which application and stage to open on. Pure, so it is
// tested in node (tests/Test-Usage.mjs).

// "+4", "−3%", or "" when there is nothing to compare; up says whether the number rose.
export function delta(current, previous, { percent = false } = {}) {
    if (current == null || previous == null) return { text: '', up: null };
    if (percent) {
        if (previous === 0) return { text: current === 0 ? '' : 'new', up: current > 0 };
        const change = Math.round(((current - previous) / previous) * 100);
        return { text: change === 0 ? '±0%' : `${change > 0 ? '+' : '−'}${Math.abs(change)}%`, up: change > 0 ? true : change < 0 ? false : null };
    }
    const change = Math.round((current - previous) * 10) / 10;
    return { text: change === 0 ? '±0' : `${change > 0 ? '+' : '−'}${Math.abs(change)}`, up: change > 0 ? true : change < 0 ? false : null };
}

export function duration(seconds) {
    if (seconds == null) return '–';
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// A share as a whole percent, "–" with nothing to divide, "<1%" for a share too small to round up.
export function rate(part, whole) {
    if (!whole) return '–';
    if (!part) return '0%';
    const p = (part / whole) * 100;
    return p < 1 ? '<1%' : `${Math.round(p)}%`;
}

// Pages seen in the previous period and not in this one (§4.2: "not used this period").
export function notUsed(previous = [], current = []) {
    const seen = new Set(current.map((p) => p.page));
    return previous.filter((p) => !seen.has(p.page)).map((p) => ({ page: p.page, views: p.views }));
}

// The applications the window holds, each with its stages busiest first, the busiest application first.
export function applicationsOf(rows = []) {
    const byApp = new Map();
    for (const row of rows) {
        const app = byApp.get(row.application) ?? { application: row.application, requests: 0, stages: [] };
        app.requests += row.requests;
        app.stages.push({ stage: row.stage, requests: row.requests });
        byApp.set(row.application, app);
    }
    return [...byApp.values()]
        .map((a) => ({ ...a, stages: a.stages.sort((x, y) => y.requests - x.requests) }))
        .sort((a, b) => b.requests - a.requests);
}

// Where the page opens: what the address asks for when the window has it, else the busiest application;
// PROD when that application has it (§4: PROD by default), else every stage.
export function scopeOf(applications, wanted = {}) {
    const app = applications.find((a) => a.application === wanted.application) ?? applications[0];
    if (!app) return { application: wanted.application ?? null, stage: wanted.stage ?? null };
    const stages = app.stages.map((s) => s.stage);
    const stage = wanted.stage === '' ? null
        : stages.includes(wanted.stage) ? wanted.stage
        : stages.includes('PROD') ? 'PROD' : null;
    return { application: app.application, stage };
}

// Every day of the period with its people, zero where nobody came, for the sparkline.
export function daysOf(period, perDay = []) {
    const byDay = new Map(perDay.map((d) => [d.day, d]));
    const days = [];
    for (let d = new Date(period.start); d < period.end; d.setDate(d.getDate() + 1)) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        days.push({ day: key, people: byDay.get(key)?.people ?? 0, sessions: byDay.get(key)?.sessions ?? 0 });
    }
    return days;
}

// ---- Paths (§4.3): a next-step tree from one page, or the tree of how people reached it. ----

export const ENDED = '(session ended)';
export const ENTERED = '(entered)';
const SEPARATOR = '\u001e';

// The API's sessions, each with its page loads in order.
export function sequencesOf(rows = []) {
    return rows.map((r) => ({ sessionId: r.sessionId, identifier: r.identifier, at: r.at, pages: String(r.pages ?? '').split(SEPARATOR).filter(Boolean) }));
}

// The page most sessions start on: where the tree opens.
export function commonEntry(sequences = []) {
    const counts = new Map();
    for (const s of sequences) if (s.pages.length) counts.set(s.pages[0], (counts.get(s.pages[0]) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

// Every visit to the start page begins a path (a page visited twice in a session counts twice). After: the pages
// that followed, ending in "(session ended)". Before: the pages that led there, beginning at "(entered)". Each level
// is shares of its parent; children under `fold` of their parent fold into one "other" line when more than one would.
export function pathTree(sequences, start, { depth = 3, direction = 'after', fold = 0.05, examples = 5 } = {}) {
    const node = (page) => ({ page, count: 0, sessions: [], children: new Map() });
    const root = node(start);
    for (const s of sequences) {
        s.pages.forEach((page, i) => {
            if (page !== start) return;
            root.count++;
            let at = root;
            for (let step = 1; step <= depth; step++) {
                const j = direction === 'after' ? i + step : i - step;
                const next = j < 0 ? ENTERED : j >= s.pages.length ? ENDED : s.pages[j];
                if (!at.children.has(next)) at.children.set(next, node(next));
                at = at.children.get(next);
                at.count++;
                if (at.sessions.length < examples && !at.sessions.some((e) => e.sessionId === s.sessionId)) {
                    at.sessions.push({ sessionId: s.sessionId, identifier: s.identifier, at: s.at });
                }
                if (next === ENDED || next === ENTERED) break;
            }
        });
    }
    const shape = (n, parentCount) => {
        const children = [...n.children.values()].sort((a, b) => b.count - a.count || a.page.localeCompare(b.page));
        const small = children.filter((c) => c.count / n.count < fold);
        const kept = small.length > 1 ? children.filter((c) => !small.includes(c)) : children;
        const shaped = kept.map((c) => shape(c, n.count));
        if (small.length > 1) {
            shaped.push({ page: `other (${small.length} pages)`, count: small.reduce((sum, c) => sum + c.count, 0), share: small.reduce((sum, c) => sum + c.count, 0) / n.count, sessions: [], children: [], other: true });
        }
        return { page: n.page, count: n.count, share: parentCount ? n.count / parentCount : 1, sessions: n.sessions, children: shaped };
    };
    return shape(root, 0);
}

// The tree as rows to draw, depth first, each with a key naming its path from the root.
export function treeRows(tree, key = '', level = 0, rows = []) {
    for (const child of tree.children) {
        const path = `${key}>${child.page}`;
        rows.push({ key: path, level, page: child.page, count: child.count, share: child.share, sessions: child.sessions, other: Boolean(child.other), end: child.page === ENDED || child.page === ENTERED });
        treeRows(child, path, level + 1, rows);
    }
    return rows;
}

// ---- Friction (§4.4): the signals as sentences, ranked by the sessions they touch. A signal points at sessions;
// it is never a verdict. ----

const many = (count, one, other = `${one}s`) => `${Number(count).toLocaleString()} ${count === 1 ? one : other}`;
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

export const FRICTION_KINDS = {
    endedOnError: 'Ended on an error',
    refused: 'Refused repeatedly',
    loops: 'Loop',
    retries: 'Retry',
    slow: 'Slow page',
    deadEnds: 'Dead end',
};

export function frictionSignals(friction = {}, settings = {}) {
    const t = { endedWithinMinutes: 2, refusedTimes: 3, loopLoads: 5, loopSeconds: 60, retrySeconds: 10, ...settings };
    const signals = [];
    for (const e of friction.endedOnError ?? []) signals.push({ kind: 'endedOnError', subject: e.call, sessions: e.sessions, people: e.people, examples: e.examples ?? [],
        text: `${many(e.sessions, 'session')} ended within ${t.endedWithinMinutes} min of a failure on ${e.call}${e.page && e.page !== e.call ? ` (on ${e.page})` : ''}` });
    for (const r of friction.refused ?? []) signals.push({ kind: 'refused', subject: r.call, sessions: r.sessions, people: r.people, examples: r.examples ?? [],
        text: `${r.call} refused ${many(r.refusals, 'time')}, ${t.refusedTimes} or more in each of ${many(r.sessions, 'session')}, for ${many(r.people, 'person', 'people')}` });
    for (const o of friction.loops ?? []) signals.push({ kind: 'loops', subject: o.page, sessions: o.sessions, people: o.people, examples: o.examples ?? [],
        text: `${many(o.people, 'person', 'people')} loaded ${o.page} ${t.loopLoads} or more times within ${t.loopSeconds} s (up to ${o.loads}), in ${many(o.sessions, 'session')}` });
    for (const r of friction.retries ?? []) signals.push({ kind: 'retries', subject: r.call, sessions: r.sessions, people: r.people, examples: r.examples ?? [],
        text: `${r.call} sent again within ${t.retrySeconds} s ${many(r.retries, 'time')}, in ${many(r.sessions, 'session')}` });
    for (const w of friction.slow ?? []) signals.push({ kind: 'slow', subject: w.page, sessions: w.sessions, people: w.people, examples: w.examples ?? [],
        text: `${w.page}: one request in ten takes ${seconds(w.p90)} or more (90th percentile of ${many(w.requests, 'request')}); ${many(w.sessions, 'session')} met a slow one` });
    for (const d of friction.deadEnds ?? []) signals.push({ kind: 'deadEnds', subject: d.page, sessions: d.exits, people: d.people, examples: d.examples ?? [],
        text: `${d.page} ended ${many(d.exits, 'session')} of ${many(d.views, 'visit')} (${Math.round((d.exits / d.views) * 100)}%; the median page ends ${Math.round((d.medianExitRate ?? 0) * 100)}%)` });
    return signals.sort((a, b) => b.sessions - a.sessions || a.kind.localeCompare(b.kind));
}

// ---- When (§4.5): page loads by weekday and hour, in the browser's time, shaded against the busiest hour. ----

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const HEAT_LEVELS = 4;

export function heatGrid(cells = []) {
    const byKey = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]));
    const busiest = Math.max(0, ...cells.map((c) => c.loads));
    return WEEKDAYS.map((label, dow) => ({
        label,
        hours: Array.from({ length: 24 }, (_, hour) => {
            const c = byKey.get(`${dow}-${hour}`);
            const loads = c?.loads ?? 0;
            return { dow, hour, loads, sessions: c?.sessions ?? 0, people: c?.people ?? 0, examples: c?.examples ?? [],
                level: loads && busiest ? Math.max(1, Math.ceil((loads / busiest) * HEAT_LEVELS)) : 0 };
        }),
    }));
}

// ---- Scope (§5, U-4): a member sees Usage for the applications they hold a role on. A registry application matches
// the log rows whose Application is its name, ignoring case; nothing else is guessed. Those with no rows are named. ----

// Gatehouse (gatehouse.md §13 U-R1): a held application may also be { name, identifier }; a log row matches either.
export function matchApplications(applications, names) {
    if (!names) return { kept: applications, missing: [] };
    const held = names.map((h) => (typeof h === 'string' ? { name: h, keys: [h.toLowerCase()] }
        : { name: h.name, keys: [h.name, h.identifier].filter(Boolean).map((k) => k.toLowerCase()) }));
    const matches = (a, h) => h.keys.includes(String(a.application).toLowerCase());
    const kept = applications.filter((a) => held.some((h) => matches(a, h)));
    return { kept, missing: held.filter((h) => !kept.some((a) => matches(a, h))).map((h) => h.name) };
}
