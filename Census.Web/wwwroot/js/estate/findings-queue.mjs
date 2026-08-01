// The dev-ops working queue: every finding in the fleet, worst first, filterable by
// severity and owner. A panel, not a destination (census-web-v2-ux.md §5.1) — machine
// names pivot straight into dossiers. Raw truth, no lifecycle: rows exist exactly as
// long as the condition does.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

export function severityDotClass(severity) {
    if (severity === 'critical') return 'est-dot-red';
    if (severity === 'high' || severity === 'medium') return 'est-dot-amber';
    return 'est-dot-low';
}

export class FindingsQueue {
    /**
     * @param machines  canvas machine dtos (findings ride along, facets attached)
     * @param ownership {key,label} or null
     * @param state     persisted filter state: { severities:Set, owners:Set, query:string }
     * @param onMachine called with a machine name to pivot to its dossier
     */
    constructor(machines, ownership, state, onMachine) {
        this.ownership = ownership;
        this.state = state;
        this.onMachine = onMachine;

        this.findings = machines
            .flatMap((m) => m.findings)
            .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
                || a.machine.localeCompare(b.machine));
    }

    ownersOf(finding) {
        return finding.ownership.length > 0 ? finding.ownership : ['Unassigned'];
    }

    filtered() {
        const q = this.state.query.trim().toLowerCase();
        return this.findings.filter((f) => {
            if (this.state.severities.size > 0 && !this.state.severities.has(f.severity)) return false;
            if (this.state.owners.size > 0 && !this.ownersOf(f).some((o) => this.state.owners.has(o))) return false;
            if (q !== '' && !`${f.title} ${f.detail ?? ''} ${f.machine} ${f.kind}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }

    mount(container) {
        this.container = container;
        this.render();
    }

    render() {
        const severityCounts = {};
        const ownerCounts = {};
        for (const f of this.findings) {
            severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;
            for (const o of this.ownersOf(f)) ownerCounts[o] = (ownerCounts[o] ?? 0) + 1;
        }

        const severityChips = SEVERITY_ORDER
            .filter((s) => severityCounts[s])
            .map((s) => `
                <button class="est-chip ${this.state.severities.has(s) ? 'is-active' : ''}" data-severity="${escapeHtml(s)}">
                    ${escapeHtml(s)} <span class="est-chip-count">${severityCounts[s]}</span>
                </button>`).join('');

        const ownerChips = Object.keys(ownerCounts)
            .sort((a, b) => (a === 'Unassigned') - (b === 'Unassigned') || a.localeCompare(b))
            .map((o) => `
                <button class="est-chip ${this.state.owners.has(o) ? 'is-active' : ''}" data-owner-chip="${escapeHtml(o)}">
                    ${escapeHtml(o)} <span class="est-chip-count">${ownerCounts[o]}</span>
                </button>`).join('');

        this.container.innerHTML = `
            <div class="est-q-filters">
                <div class="est-q-filter-row">${severityChips}</div>
                <div class="est-q-filter-row">
                    <span class="est-stagebar-label">${escapeHtml(this.ownership?.label ?? 'owner')}</span>
                    ${ownerChips}
                </div>
                <input class="est-filter" type="search" placeholder="Filter findings…"
                       value="${escapeHtml(this.state.query)}" data-ref="query">
            </div>
            <ul class="est-queue" data-ref="list"></ul>`;

        this.container.querySelectorAll('[data-severity]').forEach((btn) => btn.addEventListener('click', () => {
            const s = btn.dataset.severity;
            if (this.state.severities.has(s)) this.state.severities.delete(s);
            else this.state.severities.add(s);
            this.render();
        }));

        this.container.querySelectorAll('[data-owner-chip]').forEach((btn) => btn.addEventListener('click', () => {
            const o = btn.dataset.ownerChip;
            if (this.state.owners.has(o)) this.state.owners.delete(o);
            else this.state.owners.add(o);
            this.render();
        }));

        this.container.querySelector('[data-ref="query"]').addEventListener('input', (e) => {
            this.state.query = e.target.value;
            this.renderList();
        });

        this.renderList();
    }

    renderList() {
        const listEl = this.container.querySelector('[data-ref="list"]');
        const rows = this.filtered();

        if (rows.length === 0) {
            listEl.innerHTML = this.findings.length === 0
                ? '<li class="est-q-empty">The queue is clear — nothing to effect.</li>'
                : '<li class="est-q-empty">No findings match these filters.</li>';
            return;
        }

        listEl.innerHTML = rows.map((f) => `
            <li class="est-q-row">
                <span class="est-dot ${severityDotClass(f.severity)}" title="${escapeHtml(f.severity)}"></span>
                <span class="est-q-main">
                    <span class="est-q-title">${escapeHtml(f.title)}</span>
                    ${f.detail ? `<span class="est-q-detail">${escapeHtml(f.detail)}</span>` : ''}
                </span>
                <button class="est-q-machine est-mono" data-open-machine="${escapeHtml(f.machine)}">${escapeHtml(f.machine)}</button>
                <span class="est-q-owners">${this.ownersOf(f).map((o) => `<span class="est-badge">${escapeHtml(o)}</span>`).join(' ')}</span>
                <span class="est-finding-kind">${escapeHtml(f.kind)}</span>
            </li>`).join('');

        listEl.querySelectorAll('[data-open-machine]').forEach((btn) => btn.addEventListener('click', () => {
            this.onMachine(btn.dataset.openMachine);
        }));
    }
}
