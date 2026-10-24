// One unit of work's arithmetic (gatehouse.md §12.6, app-event.md §7), pure so it is tested in node
// (Gatehouse.Tests/js/app-events-model.test.mjs). Events arrive in the order they happened (StartAt). Each step is
// placed under the event that caused it (ParentUid), and the time since the step before is named for what it was:
//   waiting  a hand-off until it was received: time in a queue between systems, usually where a bottleneck is;
//   working  from started until the step that ended the work (completed, failed, or handed on);
//   after    anything else.

const ENDS = new Set(['completed', 'failed', 'handed-off']);

export function gapKind(previous, step) {
    if (previous?.activity === 'handed-off' && step.activity === 'received') return 'waiting';
    if (previous?.activity === 'started' && ENDS.has(step.activity)) return 'working';
    return 'after';
}

export function buildWork(events, { stuckHours = 4, now = Date.now() } = {}) {
    const byUid = new Map(events.map((e) => [e.uid, e]));
    const depthOf = (e, seen = new Set()) => {
        if (!e.parentUid || !byUid.has(e.parentUid) || seen.has(e.uid)) return 0;
        seen.add(e.uid);
        return 1 + depthOf(byUid.get(e.parentUid), seen);
    };
    const steps = events.map((e, i) => {
        const previous = i > 0 ? events[i - 1] : null;
        const kind = previous ? gapKind(previous, e) : null;
        return {
            ...e,
            depth: depthOf(e),
            gapSeconds: previous ? (Date.parse(e.startAt) - Date.parse(previous.startAt)) / 1000 : null,
            gapKind: kind,
            lagSeconds: e.createdAt ? Math.max(0, (Date.parse(e.createdAt) - Date.parse(e.startAt)) / 1000) : null,
            orphan: !!e.parentUid && !byUid.has(e.parentUid),
        };
    });
    const sum = (kind) => steps.filter((s) => s.gapKind === kind).reduce((n, s) => n + s.gapSeconds, 0);
    const first = steps[0];
    const last = steps[steps.length - 1];
    return {
        steps,
        totalSeconds: first && last ? (Date.parse(last.startAt) - Date.parse(first.startAt)) / 1000 : 0,
        waitingSeconds: sum('waiting'),
        workingSeconds: sum('working'),
        applications: [...new Set(steps.map((s) => s.application))],
        status: statusOf(steps, { stuckHours, now }),
    };
}

// The same rule as works.sql: failed if a step failed; completed if the application that created it said so; stuck if
// the last step is a hand-off older than stuckHours; otherwise running.
export function statusOf(steps, { stuckHours = 4, now = Date.now() } = {}) {
    if (steps.some((s) => s.activity === 'failed')) return 'failed';
    const creator = steps.find((s) => s.activity === 'created')?.application ?? steps[0]?.application;
    if (steps.some((s) => s.activity === 'completed' && s.application === creator)) return 'completed';
    const last = steps[steps.length - 1];
    return last?.activity === 'handed-off' && now - Date.parse(last.startAt) > stuckHours * 3_600_000 ? 'stuck' : 'running';
}

export function duration(seconds) {
    if (seconds == null) return '';
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
}
