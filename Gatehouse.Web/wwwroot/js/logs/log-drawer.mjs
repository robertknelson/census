import { escapeHtml, CLOSE_ICON } from '../feature-access/utils/dom.mjs';
import { formatDateTime } from '../feature-access/utils/time.mjs';
import { cellText } from './log-table.mjs';
import { ICONS } from './icons.mjs';

const FOCUSABLE = 'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])';

// Trace (log-explorer-and-trace.md §5): the row's session as a timeline, and its identifier's whole day.
function traceLinks(row) {
    if (!row.sessionId) return '';
    const when = row.startAt ? new Date(row.startAt) : null;
    const day = when ? `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}` : null;
    const session = `/trace?${new URLSearchParams({ session: row.sessionId })}`;
    const person = row.identifier && row.identifier !== 'na' && day
        ? `/trace?${new URLSearchParams({ person: row.identifier, day, session: row.sessionId })}` : null;
    return `
        <section class="fa-section">
            <div class="fa-actions">
                <a class="fa-button fa-button--small" href="${escapeHtml(person ?? session)}">Open session</a>
                ${person ? `<a class="fa-button fa-button--small" href="${escapeHtml(`/trace?${new URLSearchParams({ person: row.identifier, day })}`)}">This identifier's day</a>` : ''}
            </div>
        </section>`;
}

function looksLikeJson(value) {
    return typeof value === 'string' && /^\s*[\[{]/.test(value);
}

function pretty(value) {
    try {
        return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
        return value;
    }
}

// Slide-over with two modes: one log row (every column, previous / next through the page, pivot links, copy as
// JSON) and the Fields panel (which fields are facets and which are columns for the current model).
export class LogDrawer {
    #layer;
    #panel;
    #handlers;
    #mode = null;
    #row = null;
    #fields = [];
    #index = 0;
    #count = 0;
    #modelLabel = '';
    #returnFocus = null;

    constructor(host, handlers) {
        this.#handlers = handlers;
        host.innerHTML = `
            <div class="fa-drawer-layer">
                <div class="fa-drawer-backdrop" data-action="close"></div>
                <aside class="fa-drawer logx-drawer" role="dialog" aria-modal="true" aria-labelledby="fa-drawer-title"></aside>
            </div>`;
        this.#layer = host.querySelector('.fa-drawer-layer');
        this.#panel = host.querySelector('.fa-drawer');
        host.addEventListener('click', event => this.#onClick(event));
        host.addEventListener('change', event => this.#onChange(event));
        host.addEventListener('keydown', event => this.#onKeydown(event));
    }

    get isOpen() {
        return this.#mode !== null;
    }

    get rowId() {
        return this.#mode === 'row' ? String(this.#row.id) : null;
    }

    openRow(row, { fields, index, count, modelLabel }) {
        this.#show();
        this.#mode = 'row';
        this.#row = row;
        this.#fields = fields;
        this.#index = index;
        this.#count = count;
        this.#modelLabel = modelLabel;

        const items = fields.map(field => {
            const raw = row[field.field];
            if (raw === null || raw === undefined || raw === '') return '';
            let value;
            if (field.kind === 'json' || looksLikeJson(raw)) {
                value = `<pre class="logx-json">${escapeHtml(pretty(String(raw)))}</pre>`;
            } else if (field.pivot) {
                value = `<a href="#" class="logx-pivot" data-action="pivot" data-field="${escapeHtml(field.field)}" data-value="${escapeHtml(String(raw))}" title="Search for everything with this ${escapeHtml(field.header.toLowerCase())}">${escapeHtml(String(raw))}${ICONS.pivot}</a>`;
            } else if (field.kind === 'date') {
                value = `<time datetime="${escapeHtml(String(raw))}">${escapeHtml(formatDateTime(raw))}</time>`;
            } else {
                value = escapeHtml(cellText(row, field));
            }
            return `<div class="logx-detail"><dt>${escapeHtml(field.header)}</dt><dd>${value}</dd></div>`;
        }).join('');

        this.#panel.innerHTML = `
            <header class="fa-drawer-head">
                <div>
                    <h2 id="fa-drawer-title">${escapeHtml(modelLabel)} <code class="fa-feature-key">#${escapeHtml(String(row.id))}</code></h2>
                    <p class="fa-muted">${escapeHtml(formatDateTime(row.startAt))} · row ${index + 1} of ${count} on this page</p>
                </div>
                <button type="button" class="fa-icon-button" data-action="close" aria-label="Close">${CLOSE_ICON}</button>
            </header>
            <div class="fa-drawer-body">
                ${traceLinks(row)}
                <section class="fa-section"><dl class="logx-details">${items}</dl></section>
            </div>
            <footer class="fa-drawer-foot">
                <div class="fa-actions">
                    <button type="button" class="fa-button fa-button--small" data-action="previous" ${index === 0 ? 'disabled' : ''}>${ICONS.previous}Previous</button>
                    <button type="button" class="fa-button fa-button--small" data-action="next" ${index + 1 >= count ? 'disabled' : ''}>Next${ICONS.next}</button>
                    <button type="button" class="fa-button fa-button--quiet fa-button--small" data-action="copy">${ICONS.copy}Copy as JSON</button>
                </div>
            </footer>`;
        this.#panel.querySelector('[data-action="close"]').focus();
    }

    openFields(fields, { modelLabel }) {
        this.#show();
        this.#mode = 'fields';
        this.#row = null;
        this.#fields = fields;
        this.#modelLabel = modelLabel;

        this.#panel.innerHTML = `
            <header class="fa-drawer-head">
                <div>
                    <h2 id="fa-drawer-title">Fields</h2>
                    <p class="fa-muted">${escapeHtml(modelLabel)}: which fields are profiled as facets, and which are shown as columns.</p>
                </div>
                <button type="button" class="fa-icon-button" data-action="close" aria-label="Close">${CLOSE_ICON}</button>
            </header>
            <div class="fa-drawer-body">
                <section class="fa-section">
                    <table class="logx-fields">
                        <thead><tr><th scope="col">Field</th><th scope="col">Facet</th><th scope="col">Column</th></tr></thead>
                        <tbody>${fields.map(field => `
                            <tr>
                                <th scope="row">${escapeHtml(field.header)} <code class="fa-feature-key">${escapeHtml(field.field)}</code></th>
                                <td><input type="checkbox" data-action="facet" data-field="${escapeHtml(field.field)}" ${field.facet ? 'checked' : ''} ${field.kind === 'json' || field.kind === 'list' && field.field === 'roles' ? 'disabled' : ''} aria-label="Profile ${escapeHtml(field.header)}"></td>
                                <td><input type="checkbox" data-action="column" data-field="${escapeHtml(field.field)}" ${field.column ? 'checked' : ''} aria-label="Show ${escapeHtml(field.header)}"></td>
                            </tr>`).join('')}</tbody>
                    </table>
                    <p class="fa-hint">Facet changes reload the facets; column changes apply to the next search. Remembered in this browser per model.</p>
                </section>
            </div>
            <footer class="fa-drawer-foot">
                <div class="fa-actions">
                    <button type="button" class="fa-button fa-button--quiet" data-action="reset-fields">Reset to defaults</button>
                    <button type="button" class="fa-button fa-button--primary" data-action="close">Done</button>
                </div>
            </footer>`;
        this.#panel.querySelector('[data-action="close"]').focus();
    }

    close() {
        if (!this.isOpen) return;
        this.#mode = null;
        this.#row = null;
        this.#layer.classList.remove('is-open');
        const target = this.#returnFocus;
        this.#returnFocus = null;
        this.#handlers.onClose();
        if (target?.isConnected && target !== document.body) target.focus();
    }

    #show() {
        if (this.isOpen) return;
        this.#returnFocus = document.activeElement;
        this.#layer.classList.add('is-open');
    }

    #onClick(event) {
        const target = event.target.closest('[data-action]');
        if (!target) return;
        switch (target.dataset.action) {
            case 'close': this.close(); break;
            case 'previous': this.#handlers.onStep(this.#index - 1); break;
            case 'next': this.#handlers.onStep(this.#index + 1); break;
            case 'copy':
                navigator.clipboard?.writeText(JSON.stringify(this.#row, null, 2)).then(
                    () => this.#handlers.onNotice('Copied the row as JSON'),
                    () => this.#handlers.onNotice('Could not copy. Select the text instead.', 'error'));
                break;
            case 'pivot':
                event.preventDefault();
                this.#handlers.onPivot(target.dataset.field, target.dataset.value);
                break;
            case 'reset-fields':
                this.#handlers.onResetFields();
                break;
        }
    }

    #onChange(event) {
        const input = event.target;
        if (input.dataset.action === 'facet' || input.dataset.action === 'column') {
            this.#handlers.onFieldChange(input.dataset.field, input.dataset.action, input.checked);
        }
    }

    #onKeydown(event) {
        if (!this.isOpen) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
            return;
        }
        if (this.#mode === 'row' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.target.matches('input, textarea, select')) {
            event.preventDefault();
            this.#handlers.onStep(this.#index + (event.key === 'ArrowLeft' ? -1 : 1));
            return;
        }
        if (event.key === 'Tab') {
            const focusable = [...this.#panel.querySelectorAll(FOCUSABLE)].filter(element => !element.disabled && element.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }
}
