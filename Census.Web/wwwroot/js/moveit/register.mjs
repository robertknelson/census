import { escapeHtml } from './format.mjs';

// The register (move-it.md §28): a flat list of one noun — features, releases — with a find
// box, standing questions as pills, facets with counts, sortable columns and paging, all in
// the browser over one fetch. Its state lives in the address, so a narrowed register is a
// link and the back button walks the picks. The page hands it columns, facets, pills and a
// row key; it owns nothing about what the rows mean.
//
//   columns: [{ id, label, sort(row) -> comparable | null, render(row) -> html, class? }]
//   facets:  [{ id, label, value(row) -> string | string[] | null, order?: [values],
//              hideUnlessChosen?: [values] }]   rows with these values show only when asked for
//   pills:   [{ id, label, title?, facets: { facetId: [values] }, test?(row) -> bool }]
//   find(row) -> text searched; rowKey(row) -> string; onPick(row | null)

// A facet value is one string, several, or none.
function valuesOf(facet, row) {
    const v = facet.value(row);
    if (v == null) return [];
    return Array.isArray(v) ? v.filter((x) => x != null) : [v];
}

export class Register {
    constructor({ columns, facets = [], pills = [], find, rowKey, onPick, pageSize = 50, defaultSort, emptyText = 'Nothing matches.' }) {
        this.columns = columns;
        this.facets = facets;
        this.pills = pills;
        this.find = find;
        this.rowKey = rowKey;
        this.onPick = onPick ?? (() => {});
        this.pageSize = pageSize;
        this.defaultSort = defaultSort ?? { id: columns[0].id, dir: 'asc' };
        this.emptyText = emptyText;
        this.rows = [];
        this.state = this.readState();
    }

    // ---- state in the address ----------------------------------------------------------

    readState() {
        const p = new URLSearchParams(window.location.search);
        const facets = {};
        for (const f of this.facets) {
            const v = p.get(f.id);
            if (v) facets[f.id] = v.split(',').map(decodeURIComponent).filter(Boolean);
        }
        const sortId = p.get('sort');
        const pill = this.pills.find((x) => x.id === p.get('pill')) ?? null;
        if (pill && !Object.keys(facets).length) {      // a pill link carries the question, not its facets
            for (const [id, values] of Object.entries(pill.facets ?? {})) facets[id] = [...values];
        }
        return {
            q: p.get('q') ?? '',
            sort: this.columns.some((c) => c.id === sortId) ? sortId : this.defaultSort.id,
            dir: p.get('dir') === 'desc' ? 'desc' : p.get('dir') === 'asc' ? 'asc' : this.defaultSort.dir,
            page: Math.max(1, Number(p.get('page')) || 1),
            pill: pill?.id ?? null,
            sel: p.get('sel'),
            facets,
        };
    }

    writeState() {
        const url = new URL(window.location.href);
        const p = url.searchParams;
        const keep = new Set(['view']);
        for (const key of [...p.keys()]) if (!keep.has(key)) p.delete(key);
        const s = this.state;
        if (s.q) p.set('q', s.q);
        if (s.sort !== this.defaultSort.id || s.dir !== this.defaultSort.dir) { p.set('sort', s.sort); p.set('dir', s.dir); }
        if (s.page > 1) p.set('page', String(s.page));
        if (s.pill) p.set('pill', s.pill);
        if (s.sel) p.set('sel', s.sel);
        for (const [id, values] of Object.entries(s.facets)) if (values.length) p.set(id, values.map(encodeURIComponent).join(','));
        window.history.replaceState(null, '', url);
    }

    // ---- mounting -----------------------------------------------------------------------

    // headEl sits in the page's header line (find box, sort in words, showing); bodyEl is the
    // scrolling main: pills, facets, the table, the pager.
    mount(headEl, bodyEl) {
        this.headEl = headEl;
        this.bodyEl = bodyEl;
        headEl.innerHTML = `
            <input type="search" class="rg-find" data-rg="find" placeholder="Find" aria-label="Find" value="${escapeHtml(this.state.q)}" />
            <span class="mi-showing" data-rg="showing"></span>
            <span class="mi-showing rg-sortword" data-rg="sortword"></span>`;
        this.findEl = headEl.querySelector('[data-rg="find"]');
        this.showingEl = headEl.querySelector('[data-rg="showing"]');
        this.sortWordEl = headEl.querySelector('[data-rg="sortword"]');
        this.findEl.addEventListener('input', () => { this.state.q = this.findEl.value.trim(); this.state.page = 1; this.render(); });
        window.addEventListener('popstate', () => { this.state = this.readState(); this.findEl.value = this.state.q; this.render(); });
        return this;
    }

    setRows(rows) {
        this.rows = rows;
        this.render();
    }

    // ---- filtering ----------------------------------------------------------------------

    matchesFind(row) {
        if (!this.state.q) return true;
        const needle = this.state.q.toLowerCase();
        return String(this.find(row) ?? '').toLowerCase().includes(needle);
    }

    activePill() {
        return this.pills.find((x) => x.id === this.state.pill) ?? null;
    }

    // Rows that pass the find box, the active pill's test and every facet but `except`.
    filtered(except = null) {
        const pill = this.activePill();
        return this.rows.filter((row) => {
            if (!this.matchesFind(row)) return false;
            if (pill?.test && !pill.test(row)) return false;
            for (const f of this.facets) {
                if (f.id === except) continue;
                const chosen = this.state.facets[f.id];
                if (!chosen?.length) {
                    if (f.hideUnlessChosen?.some((v) => valuesOf(f, row).includes(v))) return false;
                    continue;
                }
                if (!chosen.some((v) => valuesOf(f, row).includes(v))) return false;
            }
            return true;
        });
    }

    sorted(rows) {
        const col = this.columns.find((c) => c.id === this.state.sort) ?? this.columns[0];
        const dir = this.state.dir === 'desc' ? -1 : 1;
        return [...rows].sort((a, b) => {
            const ka = col.sort(a), kb = col.sort(b);
            if (ka == null && kb == null) return 0;
            if (ka == null) return 1;        // nulls last, whatever the direction
            if (kb == null) return -1;
            if (ka < kb) return -dir;
            if (ka > kb) return dir;
            return 0;
        });
    }

    // ---- rendering ----------------------------------------------------------------------

    render() {
        if (!this.bodyEl) return;
        const all = this.filtered();
        const rows = this.sorted(all);
        const pages = Math.max(1, Math.ceil(rows.length / this.pageSize));
        if (this.state.page > pages) this.state.page = pages;
        const start = (this.state.page - 1) * this.pageSize;
        const page = rows.slice(start, start + this.pageSize);
        this.writeState();

        this.showingEl.innerHTML = rows.length === 0
            ? `<strong>0</strong> of ${this.rows.length}`
            : `<strong>${start + 1}–${start + page.length}</strong> of ${rows.length}${rows.length !== this.rows.length ? ` <span class="rg-of-all">(${this.rows.length} in all)</span>` : ''}`;
        const col = this.columns.find((c) => c.id === this.state.sort);
        const isDefault = this.state.sort === this.defaultSort.id && this.state.dir === this.defaultSort.dir;
        this.sortWordEl.textContent = isDefault ? '' : `sorted by ${col.label.toLowerCase()}${this.state.dir === 'desc' ? ', descending' : ''}`;

        this.bodyEl.innerHTML = `
            ${this.renderPills()}
            ${this.renderFacets()}
            ${page.length ? this.renderTable(page) : `<p class="mi-status">${escapeHtml(this.emptyText)}</p>`}
            ${this.renderPager(pages)}`;
        this.wire();
    }

    renderPills() {
        if (!this.pills.length) return '';
        return `<div class="rg-pills" aria-label="Standing questions">${this.pills.map((x) => {
            const n = this.countPill(x);
            return `<button type="button" class="rg-pill ${x.id === this.state.pill ? 'is-active' : ''} ${n ? '' : 'is-zero'}" data-pill="${escapeHtml(x.id)}" title="${escapeHtml(x.title ?? '')}">${escapeHtml(x.label)} <span class="rg-pill-n">${n}</span></button>`;
        }).join('')}</div>`;
    }

    // How many rows the pill would show from here: the find box applied, the pill's own facets
    // and test, nothing else — a pill replaces the facets, it does not add to them.
    countPill(pill) {
        return this.rows.filter((row) => {
            if (!this.matchesFind(row)) return false;
            if (pill.test && !pill.test(row)) return false;
            for (const f of this.facets) {
                const values = pill.facets?.[f.id];
                if (!values?.length) {
                    if (f.hideUnlessChosen?.some((v) => valuesOf(f, row).includes(v))) return false;
                    continue;
                }
                if (!values.some((v) => valuesOf(f, row).includes(v))) return false;
            }
            return true;
        }).length;
    }

    renderFacets() {
        if (!this.facets.length) return '';
        const anyChosen = Object.values(this.state.facets).some((v) => v.length);
        return `<div class="rg-facets">
            ${this.facets.map((f) => {
                const others = this.filtered(f.id);
                const counts = new Map();
                for (const row of others) for (const v of valuesOf(f, row)) counts.set(v, (counts.get(v) ?? 0) + 1);
                const seen = new Set(this.rows.flatMap((r) => valuesOf(f, r)));
                const chosen = this.state.facets[f.id] ?? [];
                const values = f.order
                    ? [...f.order.filter((v) => seen.has(v)), ...[...seen].filter((v) => !f.order.includes(v)).sort()]
                    : [...seen].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || String(a).localeCompare(String(b)));
                if (!values.length) return '';
                return `<div class="rg-facet">
                    <span class="rg-facet-h"${f.title ? ` title="${escapeHtml(f.title)}"` : ""}>${escapeHtml(f.label)}</span>
                    <span class="rg-facet-vs">${values.map((v) => {
                        const n = counts.get(v) ?? 0;
                        const on = chosen.includes(v);
                        return `<button type="button" class="rg-facet-v ${on ? 'is-on' : ''} ${n || on ? '' : 'is-zero'}" data-facet="${escapeHtml(f.id)}" data-value="${escapeHtml(v)}" aria-pressed="${on}">${escapeHtml(v)}<span class="rg-facet-n">${n}</span></button>`;
                    }).join('')}</span>
                </div>`;
            }).join('')}
            ${anyChosen || this.state.pill || this.state.q ? '<button type="button" class="rg-clear" data-rg="clear">Clear all</button>' : ''}
        </div>`;
    }

    renderTable(page) {
        const arrow = (c) => c.id !== this.state.sort ? '' : this.state.dir === 'desc' ? ' ▾' : ' ▴';
        return `<table class="rg-table">
            <thead><tr>${this.columns.map((c) => `<th class="${c.class ?? ''} ${c.id === this.state.sort ? 'is-sorted' : ''}" scope="col"${c.title ? ` title="${escapeHtml(c.title)}"` : ''}><button type="button" class="rg-th" data-sort="${escapeHtml(c.id)}">${escapeHtml(c.label)}${arrow(c)}</button></th>`).join('')}</tr></thead>
            <tbody>${page.map((row) => {
                const key = String(this.rowKey(row));
                return `<tr class="rg-row ${key === this.state.sel ? 'is-selected' : ''}" data-key="${escapeHtml(key)}" tabindex="0">${this.columns.map((c) => `<td class="${c.class ?? ''}">${c.render(row)}</td>`).join('')}</tr>`;
            }).join('')}</tbody>
        </table>`;
    }

    renderPager(pages) {
        if (pages <= 1) return '';
        const cur = this.state.page;
        const nums = new Set([1, pages, cur - 1, cur, cur + 1].filter((n) => n >= 1 && n <= pages));
        const list = [...nums].sort((a, b) => a - b);
        const parts = [];
        let last = 0;
        for (const n of list) {
            if (n - last > 1) parts.push('<span class="rg-gap">…</span>');
            parts.push(`<button type="button" class="rg-page ${n === cur ? 'is-current' : ''}" data-page="${n}" ${n === cur ? 'aria-current="page"' : ''}>${n}</button>`);
            last = n;
        }
        return `<nav class="rg-pager" aria-label="Pages">
            <button type="button" class="rg-page" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
            ${parts.join('')}
            <button type="button" class="rg-page" data-page="${cur + 1}" ${cur === pages ? 'disabled' : ''} aria-label="Next page">›</button>
        </nav>`;
    }

    wire() {
        const on = (sel, fn) => this.bodyEl.querySelectorAll(sel).forEach((el) => el.addEventListener('click', () => fn(el)));
        on('[data-pill]', (el) => {
            const pill = this.pills.find((x) => x.id === el.dataset.pill);
            if (this.state.pill === pill.id) { this.state.pill = null; this.state.facets = {}; }
            else { this.state.pill = pill.id; this.state.facets = Object.fromEntries(Object.entries(pill.facets ?? {}).map(([k, v]) => [k, [...v]])); }
            this.state.page = 1;
            this.render();
        });
        on('[data-facet]', (el) => {
            const { facet, value } = el.dataset;
            const chosen = this.state.facets[facet] ?? [];
            this.state.facets[facet] = chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value];
            this.state.pill = null;     // a hand-picked facet is no longer the pill's question
            this.state.page = 1;
            this.render();
        });
        on('[data-rg="clear"]', () => {
            this.state.facets = {}; this.state.pill = null; this.state.q = ''; this.state.page = 1;
            this.findEl.value = '';
            this.render();
        });
        on('[data-sort]', (el) => {
            const id = el.dataset.sort;
            if (this.state.sort === id) this.state.dir = this.state.dir === 'asc' ? 'desc' : 'asc';
            else { this.state.sort = id; this.state.dir = this.columns.find((c) => c.id === id).defaultDir ?? 'asc'; }
            this.render();
        });
        on('[data-page]', (el) => { this.state.page = Number(el.dataset.page); this.render(); this.bodyEl.scrollTop = 0; });
        const pick = (tr) => {
            const key = tr.dataset.key;
            this.state.sel = key === this.state.sel ? null : key;
            this.writeState();
            this.bodyEl.querySelectorAll('.rg-row').forEach((r) => r.classList.toggle('is-selected', r.dataset.key === this.state.sel));
            this.onPick(this.state.sel == null ? null : this.rows.find((row) => String(this.rowKey(row)) === this.state.sel));
        };
        this.bodyEl.querySelectorAll('.rg-row').forEach((tr) => {
            tr.addEventListener('click', (e) => { if (!e.target.closest('a')) pick(tr); });
            tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(tr); } });
        });
    }

    // The row the address names, if it is in the data: the page opens on its story.
    selectedRow() {
        return this.state.sel == null ? null : this.rows.find((row) => String(this.rowKey(row)) === this.state.sel) ?? null;
    }

    clearSelection() {
        this.state.sel = null;
        this.writeState();
        this.bodyEl?.querySelectorAll('.rg-row.is-selected').forEach((r) => r.classList.remove('is-selected'));
    }
}
