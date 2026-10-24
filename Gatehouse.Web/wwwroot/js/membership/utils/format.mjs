export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

// yyyy-MM-dd on the reader's calendar. A date-only value is read as that day, not as midnight UTC, so it never slips
// back a day west of Greenwich.
export function isoDate(value) {
    if (!value) return '';
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}(T00:00:00)?$/.test(text)) return text.slice(0, 10);
    const d = new Date(text);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
