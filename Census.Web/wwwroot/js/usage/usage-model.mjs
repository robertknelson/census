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
