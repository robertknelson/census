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

// yyyy-MM-dd on the reader's calendar (his note 8). A date-only value (a target date) is read
// as that day, not as midnight UTC, so it never slips back a day west of Greenwich.
export function isoDate(value) {
    if (!value) return '';
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}(T00:00:00)?$/.test(text)) return text.slice(0, 10);
    const d = new Date(text);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The app's registry name, else the name it reports, else its id (applications.sql;
// move-it.md open item 10).
export function appLabel(app) {
    return app?.Name ?? `Application ${app?.ApplicationId ?? '?'}`;
}
