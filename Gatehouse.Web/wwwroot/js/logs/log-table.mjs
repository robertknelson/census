import { escapeHtml } from '../feature-access/utils/dom.mjs';
import { formatDateTime } from '../feature-access/utils/time.mjs';
import { ICONS } from './icons.mjs';
import { requestCues } from './models.mjs';

export const PAGE_SIZES = [10, 25, 50, 100];

export function cellText(row, field) {
    const value = row[field.field];
    if (value === null || value === undefined || value === '') return '';
    switch (field.kind) {
        case 'date': return formatDateTime(value);
        case 'bool': return value ? 'yes' : 'no';
        case 'list': return Array.isArray(value) ? value.join(', ') : String(value);
        case 'number': return Number(value).toLocaleString();
        default: return String(value);
    }
}

// A page of rows in fa-matrix styling: sortable headers, a row button that opens the drawer, a pager.
export class LogTable {
    #host;
    #handlers;

    constructor(host, handlers) {
        this.#host = host;
        this.#handlers = handlers;
        host.addEventListener('click', event => this.#onClick(event));
        host.addEventListener('change', event => this.#onChange(event));
    }

    render({ rows, fields, total, pageIndex, pageSize, sortBy, loading, error, selectedId, searched, emptyMessage, names = new Map() }) {
        if (loading) {
            this.#host.innerHTML = `
                <div class="fa-matrix-scroll" aria-busy="true" aria-label="Loading rows">
                    <table class="fa-matrix fa-matrix--loading"><tbody>${'<tr><td><span class="fa-skeleton"></span></td><td><span class="fa-skeleton"></span></td><td><span class="fa-skeleton"></span></td></tr>'.repeat(6)}</tbody></table>
                </div>`;
            return;
        }
        if (error) {
            this.#host.innerHTML = `
                <div class="fa-empty fa-empty--error" role="alert">
                    <p>${escapeHtml(error)}</p>
                    <button type="button" class="fa-button" data-action="retry">Try again</button>
                </div>`;
            return;
        }
        if (!searched) {
            this.#host.innerHTML = '<div class="fa-empty"><p>Pick facets on the left, then Search.</p></div>';
            return;
        }
        if (rows.length === 0) {
            this.#host.innerHTML = `<div class="fa-empty"><p>${escapeHtml(emptyMessage)}</p></div>`;
            return;
        }

        // The moment leads, whatever the field order (which puts Application first among the facets).
        const columns = fields.filter(field => field.column).sort((a, b) => (b.kind === 'date') - (a.kind === 'date'));
        const [sortField, sortDir] = (sortBy ?? '').split(' ');
        const headers = columns.map(field => {
            const active = sortField === field.field;
            const next = active && sortDir === 'desc' ? 'asc' : 'desc';
            const label = `${escapeHtml(field.header)}${active ? `<span class="logx-sort" aria-hidden="true">${sortDir === 'desc' ? '▼' : '▲'}</span>` : ''}`;
            return field.sortable
                ? `<th scope="col" class="logx-col${active ? ' is-sorted' : ''}" aria-sort="${active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}"><button type="button" class="logx-sort-button" data-action="sort" data-sort="${escapeHtml(field.field)} ${next}">${label}</button></th>`
                : `<th scope="col" class="logx-col">${label}</th>`;
        }).join('');

        const body = rows.map(row => {
            const flagged = row.hasError === true || Number(row.httpStatus) >= 500 || String(row.level ?? '').toLowerCase() === 'error' || String(row.level ?? '').toLowerCase() === 'fatal';
            const cues = 'httpStatus' in row ? requestCues(row) : {};
            const cells = columns.map((field, index) => {
                let text = cellText(row, field);
                // A person's name beside their login (support-tooling.md S3).
                if (field.field === 'identifier' && names.has(row.identifier)) text = `${names.get(row.identifier)} · ${row.identifier}`;
                const content = index === 0
                    ? `<button type="button" class="fa-feature logx-open" data-action="open" data-id="${escapeHtml(String(row.id))}"><span class="fa-feature-name">${escapeHtml(text) || '—'}</span></button>`
                    : `<span class="logx-cell-text" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
                const mark = field.field === 'httpMethod' && cues.body ? '<span class="logx-body-mark" title="Request body stored">{ }</span>' : '';
                return `<td class="logx-cell logx-cell--${field.kind} logx-col-${escapeHtml(field.field)}">${content}${mark}</td>`;
            }).join('');
            const cueClasses = [cues.write && 'is-write', cues.refused && 'is-refused', cues.slow && 'is-slow'].filter(Boolean).map(c => ` ${c}`).join('');
            return `<tr class="fa-row${flagged ? ' is-flagged' : ''}${cueClasses}${String(row.id) === String(selectedId) ? ' is-selected' : ''}" data-id="${escapeHtml(String(row.id))}">${cells}</tr>`;
        }).join('');

        const first = pageIndex * pageSize + 1;
        const last = Math.min(total, (pageIndex + 1) * pageSize);
        const pages = Math.max(1, Math.ceil(total / pageSize));
        this.#host.innerHTML = `
            <div class="fa-matrix-scroll">
                <table class="fa-matrix logx-table">
                    <thead><tr>${headers}</tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
            <div class="logx-pager">
                <span class="fa-muted">${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()}</span>
                <div class="fa-actions">
                    <button type="button" class="fa-button fa-button--small" data-action="page" data-page="${pageIndex - 1}" ${pageIndex === 0 ? 'disabled' : ''} aria-label="Previous page">${ICONS.previous}</button>
                    <span class="fa-muted">Page ${(pageIndex + 1).toLocaleString()} of ${pages.toLocaleString()}</span>
                    <button type="button" class="fa-button fa-button--small" data-action="page" data-page="${pageIndex + 1}" ${pageIndex + 1 >= pages ? 'disabled' : ''} aria-label="Next page">${ICONS.next}</button>
                    <label class="fa-muted logx-page-size">Rows
                        <select data-action="page-size" aria-label="Rows per page">${PAGE_SIZES.map(size => `<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}</option>`).join('')}</select>
                    </label>
                </div>
            </div>`;
    }

    #onClick(event) {
        const target = event.target.closest('[data-action]');
        if (!target || !this.#host.contains(target)) return;
        switch (target.dataset.action) {
            case 'retry': this.#handlers.onRetry(); break;
            case 'sort': this.#handlers.onSort(target.dataset.sort); break;
            case 'page': this.#handlers.onPage(Number(target.dataset.page)); break;
            case 'open': this.#handlers.onOpen(target.dataset.id); break;
        }
    }

    #onChange(event) {
        if (event.target.dataset.action === 'page-size') {
            this.#handlers.onPageSize(Number(event.target.value));
        }
    }
}
