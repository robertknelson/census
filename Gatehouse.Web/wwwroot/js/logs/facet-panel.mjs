import { escapeHtml } from '../feature-access/utils/dom.mjs';
import { DATE_BUCKETS } from './models.mjs';

const FILTER_THRESHOLD = 15;

// One card per profiled column: a header with the value count and an IN / NIN toggle, and a body listing
// values with counts as checkboxes. A date facet lists buckets; picking one narrows the date window instead.
export class FacetPanel {
    #host;
    #handlers;
    // Application first and open: the log tables hold every application's rows.
    #open = new Set(['application']);
    #filters = new Map();

    constructor(host, handlers) {
        this.#host = host;
        this.#handlers = handlers;
        host.addEventListener('click', event => this.#onClick(event));
        host.addEventListener('change', event => this.#onChange(event));
        host.addEventListener('input', event => this.#onInput(event));
    }

    render({ facets, fields, selection, dateBucket, loading, error }) {
        if (loading) {
            this.#host.innerHTML = `<div class="logx-facets" aria-busy="true">${'<div class="logx-facet logx-facet--skeleton"><span class="fa-skeleton"></span></div>'.repeat(5)}</div>`;
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
        if (facets.length === 0) {
            this.#host.innerHTML = '<div class="fa-empty"><p>No facets for this window. Widen the dates or profile more fields.</p></div>';
            return;
        }
        const byField = new Map(fields.map(field => [field.field, field]));
        const ordered = fields.filter(field => field.facet).map(field => facets.find(facet => facet.name === field.field)).filter(Boolean);
        this.#host.innerHTML = `<div class="logx-facets">${ordered.map(facet => this.#card(facet, byField.get(facet.name), selection.get(facet.name), dateBucket)).join('')}</div>`;
    }

    #card(facet, field, picked, dateBucket) {
        const name = facet.name;
        const isDate = field?.kind === 'date';
        const isOpen = this.#open.has(name) || Boolean(picked?.values.size);
        const isIn = picked ? picked.isIn : true;
        const items = (facet.items ?? []).map(item => ({
            value: String(item.value ?? ''),
            label: String(item.text ?? item.display ?? item.value ?? ''),
            count: Number(item.count ?? 0)
        })).filter(item => item.label.length > 0);
        const filter = (this.#filters.get(name) ?? '').toLowerCase();
        const shown = filter ? items.filter(item => item.label.toLowerCase().includes(filter)) : items;
        const pickedCount = picked?.values.size ?? 0;

        const body = isDate
            ? `
                <label class="fa-field logx-bucket">
                    <span>Bucket</span>
                    <select data-action="bucket">${DATE_BUCKETS.map(bucket => `<option value="${bucket.key}" ${bucket.key === dateBucket ? 'selected' : ''}>${bucket.label}</option>`).join('')}</select>
                </label>
                <ul class="logx-options">${shown.map(item => `
                    <li><button type="button" class="logx-jump" data-action="jump" data-value="${escapeHtml(item.value)}" title="Narrow the dates to this bucket">
                        <span>${escapeHtml(item.label)}</span><span class="fa-muted">${item.count.toLocaleString()}</span></button></li>`).join('')}
                </ul>`
            : `
                ${items.length > FILTER_THRESHOLD ? `<input type="search" class="logx-filter" data-action="filter" data-field="${escapeHtml(name)}" value="${escapeHtml(this.#filters.get(name) ?? '')}" placeholder="Filter ${items.length} values" aria-label="Filter ${escapeHtml(field?.header ?? name)} values">` : ''}
                <ul class="logx-options">${shown.map(item => `
                    <li><label class="fa-check">
                        <input type="checkbox" data-action="pick" data-field="${escapeHtml(name)}" data-value="${escapeHtml(item.value)}" ${picked?.values.has(item.value) ? 'checked' : ''}>
                        <span class="fa-check-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
                        <span class="fa-muted logx-count">${item.count.toLocaleString()}</span></label></li>`).join('')}
                </ul>
                ${shown.length === 0 ? '<p class="fa-muted">No values match.</p>' : ''}`;

        return `
            <section class="logx-facet${isOpen ? ' is-open' : ''}${pickedCount ? ' has-picks' : ''}" data-field="${escapeHtml(name)}">
                <header class="logx-facet-head">
                    <button type="button" class="logx-facet-title" data-action="open" aria-expanded="${isOpen}">
                        <span>${escapeHtml(field?.header ?? facet.display ?? name)}</span>
                        <span class="fa-count">${pickedCount ? `${pickedCount} of ` : ''}${items.length}</span>
                    </button>
                    ${isDate ? '' : `<button type="button" class="logx-inout${isIn ? '' : ' is-nin'}" data-action="toggle-in" data-field="${escapeHtml(name)}" title="${isIn ? 'Rows with these values' : 'Rows without these values'}" aria-pressed="${!isIn}">${isIn ? 'IN' : 'NOT IN'}</button>`}
                </header>
                <div class="logx-facet-body" ${isOpen ? '' : 'hidden'}>${body}</div>
            </section>`;
    }

    #onClick(event) {
        const target = event.target.closest('[data-action]');
        if (!target || !this.#host.contains(target)) return;
        const field = target.closest('.logx-facet')?.dataset.field;
        switch (target.dataset.action) {
            case 'retry':
                this.#handlers.onRetry();
                break;
            case 'open': {
                if (this.#open.has(field)) this.#open.delete(field); else this.#open.add(field);
                const section = target.closest('.logx-facet');
                const open = this.#open.has(field) || section.classList.contains('has-picks');
                section.classList.toggle('is-open', open);
                section.querySelector('.logx-facet-body').hidden = !open;
                target.setAttribute('aria-expanded', String(open));
                break;
            }
            case 'toggle-in':
                this.#handlers.onToggleIn(field);
                break;
            case 'jump':
                this.#handlers.onJump(target.dataset.value);
                break;
        }
    }

    #onChange(event) {
        const input = event.target;
        if (input.dataset.action === 'pick') {
            this.#handlers.onPick(input.dataset.field, input.dataset.value, input.checked);
        } else if (input.dataset.action === 'bucket') {
            this.#handlers.onBucket(input.value);
        }
    }

    #onInput(event) {
        const input = event.target;
        if (input.dataset.action !== 'filter') return;
        this.#filters.set(input.dataset.field, input.value.trim());
        this.#handlers.onFilter();
    }
}
