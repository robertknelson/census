/**
 * trace-model.mjs
 * A session's timeline as Trace shows it (log-explorer-and-trace.md §5, ported from xf-dashboard): every request,
 * error, message and action in time order, grouped by page (a page load, a GET outside /api/, starts a group holding
 * the calls that came after it; T2), a gap of more than five minutes marked as idle, and the whole thing as one block
 * to copy into a conversation. No polls: the apps' middleware does not record them (T2). No DOM here, so the tests
 * can run it.
 */

// Setting: the quiet that counts as idle.
export const IDLE_MINUTES = 5;

export const isWrite = request => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
export const isPage = request => request.method === 'GET' && !(request.path ?? '').startsWith('/api/');
export const isFailure = request => request.status >= 500 || Boolean(request.hasError);
// Turned down by the server (a 400 on a save, a 403): what a user sees as "it would not let me". A 401 is the sign-in
// handshake, not a refusal.
export const isRefused = request => request.status >= 400 && request.status < 500 && request.status !== 401;

/** "GoogleChrome;v=155" (the sec-ch-ua brand the log keeps) as "Chrome 155". */
export function browserName(brand) {
    const match = /^(?:Google)?([A-Za-z]+?)(?:;v=(\d+))?(?:,|$)/.exec(String(brand ?? '').trim());
    if (!match) return '';
    const name = match[1].replace(/^Microsoft/, '');
    return match[2] ? `${name} ${match[2]}` : name;
}

// Within one moment: the page first, then its calls, then what they logged.
const RANK = { page: 0, request: 1, action: 2, message: 3, error: 4 };

/**
 * @param trace the API's session: { requests, exceptions, messages, activity }
 * @returns {{ groups: Array<{ page, lines }>, counts }} each line { kind, at: Date, item, idleBefore? }; a group's
 *          page is a line of kind 'page', or null for the calls before the first page load
 */
export function buildTimeline({ requests = [], exceptions = [], messages = [], activity = [] } = {}) {
    const errorsByRequest = new Map();
    for (const error of exceptions) {
        if (error.correlationId) errorsByRequest.set(error.correlationId, (errorsByRequest.get(error.correlationId) ?? 0) + 1);
    }

    const lines = [
        ...requests.map(item => ({
            kind: isPage(item) ? 'page' : 'request',
            at: new Date(item.at),
            item: { ...item, errors: errorsByRequest.get(item.correlationId) ?? 0, write: isWrite(item), failed: isFailure(item) }
        })),
        ...exceptions.map(item => ({ kind: 'error', at: new Date(item.at), item })),
        ...messages.map(item => ({ kind: 'message', at: new Date(item.at), item })),
        ...activity.map(item => ({ kind: 'action', at: new Date(item.at), item }))
    ].sort((a, b) => a.at - b.at || RANK[a.kind] - RANK[b.kind]);

    let previous = null;
    for (const line of lines) {
        if (previous && line.at - previous.at > IDLE_MINUTES * 60000) {
            line.idleBefore = Math.round((line.at - previous.at) / 60000);
        }
        previous = line;
    }

    const groups = [];
    let current = { page: null, lines: [] };
    for (const line of lines) {
        if (line.kind === 'page') {
            if (current.page || current.lines.length) groups.push(current);
            current = { page: line, lines: [] };
        } else {
            current.lines.push(line);
        }
    }
    if (current.page || current.lines.length) groups.push(current);

    const counts = {
        requests: requests.length,
        writes: requests.filter(isWrite).length,
        failed: requests.filter(isFailure).length,
        refused: requests.filter(isRefused).length,
        errors: exceptions.length,
        pages: groups.filter(group => group.page).length
    };
    return { groups, counts };
}

/**
 * An action in plain words. The source is to come (T3: AppEvent, app-event.md); until then an action is
 * { at, sessionId, kind, words } and its words are shown as they are.
 */
export const describeAction = action => action?.words ?? action?.message ?? action?.kind ?? '';

/** The session as one block to paste into a conversation (rule 5): oldest first, bodies included. */
export function copyPayload(trace) {
    const byTime = list => [...(list ?? [])].sort((a, b) => new Date(a.at) - new Date(b.at));
    return JSON.stringify({
        kind: 'trace-session',
        sessionId: trace.sessionId,
        identifier: trace.identifier,
        totalRequests: trace.totalRequests,
        requestsShown: (trace.requests ?? []).length,
        requests: byTime(trace.requests).map(({ identifier, browser, platform, ...rest }) => rest),
        exceptions: byTime(trace.exceptions),
        messages: byTime(trace.messages),
        activity: byTime(trace.activity)
    }, null, 2);
}

/** A day's sessions as one block. */
export function copyDayPayload(day, dayLabel) {
    return JSON.stringify({ kind: 'trace-day', day: dayLabel, identifier: day.identifier, sessions: day.sessions }, null, 2);
}

/** Where the day strip starts and ends: the working hours, widened to every session. */
export function stripHours(sessions, dayStart) {
    let first = 7;
    let last = 19;
    for (const session of sessions ?? []) {
        first = Math.min(first, Math.floor((new Date(session.startAt) - dayStart) / 3600000));
        last = Math.max(last, Math.ceil((new Date(session.endAt ?? session.startAt) - dayStart) / 3600000));
    }
    return { first: Math.max(0, first), last: Math.min(24, last) };
}

// An identifier's month: the calendar grid the day is picked from. Cells run Sunday to Saturday, weeks as rows, the
// days before and after the month marked out. A day is shaded by its requests against the month's busiest day in four
// steps. Errors are failed requests plus logged errors.
export const MONTH_LEVELS = 4;
const pad2 = n => String(n).padStart(2, '0');
export const dayKey = date => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export function buildMonthGrid(year, month, days = [], selectedDay = null) {
    const byDay = new Map(days.map(d => [d.day, d]));
    const busiest = Math.max(0, ...days.map(d => d.requests ?? 0));
    const first = new Date(year, month - 1, 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    const cells = [];
    for (let i = 0; ; i++) {
        const date = new Date(start); date.setDate(start.getDate() + i);
        const inMonth = date.getMonth() === month - 1;
        if (!inMonth && date > first && date.getDay() === 0) break;
        const key = dayKey(date);
        const d = byDay.get(key) ?? {};
        const requests = d.requests ?? 0;
        const errors = (d.failedRequests ?? 0) + (d.errors ?? 0);
        cells.push({
            day: key, date: date.getDate(), inMonth, selected: key === selectedDay,
            requests, writes: d.writes ?? 0, errors, actions: d.actions ?? 0, sessions: d.sessions ?? 0,
            level: inMonth && requests > 0 && busiest > 0 ? Math.max(1, Math.ceil((requests / busiest) * MONTH_LEVELS)) : 0
        });
    }
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}

export function monthTotals(days = []) {
    return days.reduce((sum, d) => ({
        daysActive: sum.daysActive + ((d.requests ?? 0) > 0 || (d.actions ?? 0) > 0 ? 1 : 0),
        requests: sum.requests + (d.requests ?? 0),
        writes: sum.writes + (d.writes ?? 0),
        errors: sum.errors + (d.failedRequests ?? 0) + (d.errors ?? 0),
        actions: sum.actions + (d.actions ?? 0)
    }), { daysActive: 0, requests: 0, writes: 0, errors: 0, actions: 0 });
}
