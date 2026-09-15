export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

const DAY = 86_400_000;

export function daysAgo(iso, now = Date.now()) {
    if (!iso) return null;
    return Math.floor((now - Date.parse(iso)) / DAY);
}

export function days(n) {
    if (n == null) return '';
    if (n === 0) return 'today';
    if (n === 1) return '1 day';
    return `${n} days`;
}

export function shortDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// The app's name as it reports it, or its id when nothing has reported yet
// (applications.sql; move-it.md open item 10).
export function appLabel(app) {
    return app?.Name ?? `Application ${app?.ApplicationId ?? '?'}`;
}
