import { fetchMachines, fetchCompare } from '../api.mjs';
import { escapeHtml } from '../html-utils.mjs';

const ASPECTS = [
    { key: 'os', label: 'OS' },
    { key: 'hardware', label: 'Hardware' },
    { key: 'drives', label: 'Drives' },
    { key: 'dotnet', label: '.NET' },
    { key: 'apps', label: 'Installed apps' },
    { key: 'sqlserver', label: 'SQL Server' },
];

const ROLE_CHIPS = ['WebServer', 'DatabaseServer', 'DevLaptop'];

export class CompareView {
    constructor(container) {
        this.container = container;
        this.selected = new Set();
        this.aspects = new Set(ASPECTS.map((a) => a.key));
        this.differencesOnly = true;
        this.result = null;
    }

    async render() {
        this.container.innerHTML = '<p class="census-status">Loading…</p>';
        try {
            this.machines = await fetchMachines();
        } catch (err) {
            this.container.innerHTML = `<p class="census-status census-status-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.renderShell();
    }

    renderShell() {
        const machineBoxes = this.machines.map((m) => `
            <label class="census-check">
                <input type="checkbox" data-machine="${escapeHtml(m.machine)}" ${this.selected.has(m.machine) ? 'checked' : ''}>
                ${escapeHtml(m.machine)}
                <span class="census-muted">${(m.roles ?? []).join(', ')}</span>
            </label>`).join('');

        const roleChips = ROLE_CHIPS.map((role) => `<button class="census-chip" data-role="${escapeHtml(role)}">${escapeHtml(role)}</button>`).join('');

        const aspectBoxes = ASPECTS.map((a) => `
            <label class="census-check">
                <input type="checkbox" data-aspect="${escapeHtml(a.key)}" ${this.aspects.has(a.key) ? 'checked' : ''}>
                ${escapeHtml(a.label)}
            </label>`).join('');

        this.container.innerHTML = `
            <h2>Compare machines</h2>
            <div class="census-compare-controls">
                <div>
                    <h4>Machines <span class="census-muted">(select by role:</span> ${roleChips} <button class="census-chip" data-role="__none">clear</button><span class="census-muted">)</span></h4>
                    <div class="census-check-row">${machineBoxes}</div>
                </div>
                <div>
                    <h4>Aspects</h4>
                    <div class="census-check-row">${aspectBoxes}</div>
                </div>
                <p>
                    <label class="census-check"><input type="checkbox" data-ref="diff-only" ${this.differencesOnly ? 'checked' : ''}> Differing rows only</label>
                </p>
            </div>
            <div data-ref="result">${this.selected.size < 2 ? '<p class="census-status">Select at least two machines.</p>' : ''}</div>`;

        this.container.querySelectorAll('[data-machine]').forEach((cb) => cb.addEventListener('change', (e) => {
            if (e.target.checked) this.selected.add(e.target.dataset.machine);
            else this.selected.delete(e.target.dataset.machine);
            this.loadResult();
        }));

        this.container.querySelectorAll('[data-role]').forEach((btn) => btn.addEventListener('click', (e) => {
            const role = e.target.dataset.role;
            this.selected = role === '__none'
                ? new Set()
                : new Set(this.machines.filter((m) => (m.roles ?? []).includes(role)).map((m) => m.machine));
            this.renderShell();
            this.loadResult();
        }));

        this.container.querySelectorAll('[data-aspect]').forEach((cb) => cb.addEventListener('change', (e) => {
            if (e.target.checked) this.aspects.add(e.target.dataset.aspect);
            else this.aspects.delete(e.target.dataset.aspect);
            this.loadResult();
        }));

        this.container.querySelector('[data-ref="diff-only"]').addEventListener('change', (e) => {
            this.differencesOnly = e.target.checked;
            this.renderResult();
        });

        this.resultEl = this.container.querySelector('[data-ref="result"]');
        if (this.result) this.renderResult();
    }

    async loadResult() {
        if (this.selected.size < 2 || this.aspects.size === 0) {
            this.result = null;
            this.resultEl.innerHTML = '<p class="census-status">Select at least two machines and one aspect.</p>';
            return;
        }

        this.resultEl.innerHTML = '<p class="census-status">Comparing…</p>';
        try {
            this.result = await fetchCompare([...this.selected], [...this.aspects]);
            this.renderResult();
        } catch (err) {
            this.resultEl.innerHTML = `<p class="census-status census-status-error">${escapeHtml(err.message)}</p>`;
        }
    }

    renderResult() {
        if (!this.result) return;
        const r = this.result;

        const noData = r.machinesWithoutData.length > 0
            ? `<p class="census-status census-status-error">No snapshot data for: ${r.machinesWithoutData.map(escapeHtml).join(', ')}</p>`
            : '';

        const headerRow = `<tr><th class="census-sticky-col"></th>${r.machines.map((m) => `<th><a href="#/machines/${encodeURIComponent(m)}">${escapeHtml(m)}</a></th>`).join('')}</tr>`;

        const groupsHtml = r.groups.map((g) => {
            const verdict = g.identical
                ? '<span class="census-verdict census-verdict-ok">identical</span>'
                : `<span class="census-verdict census-verdict-diff">${g.differCount} difference${g.differCount === 1 ? '' : 's'}</span>`;

            const rows = g.rows.filter((row) => !this.differencesOnly || (row.differs && !row.volatile));
            const hiddenNote = this.differencesOnly && rows.length < g.rows.length
                ? `<tr><td class="census-sticky-col census-muted" colspan="${r.machines.length + 1}">${g.rows.length - rows.length} identical/volatile row(s) hidden</td></tr>`
                : '';

            const bodyRows = rows.map((row) => `
                <tr class="${row.volatile ? 'census-row-volatile' : ''}">
                    <td class="census-sticky-col">${escapeHtml(row.label)}${row.volatile ? ' <span class="census-muted">(volatile)</span>' : ''}</td>
                    ${row.values.map((v) => `<td class="${row.differs && !row.volatile ? 'census-cell-differs' : ''}">${v === null ? '<span class="census-muted">—</span>' : escapeHtml(v)}</td>`).join('')}
                </tr>`).join('');

            return `
                <tbody>
                    <tr class="census-group-header"><td class="census-sticky-col">${escapeHtml(g.title)} ${verdict}</td><td colspan="${r.machines.length}"></td></tr>
                    ${bodyRows}
                    ${hiddenNote}
                </tbody>`;
        }).join('');

        this.resultEl.innerHTML = `
            ${noData}
            <div class="census-compare-scroll">
                <table class="census-table census-compare-table">
                    <thead>${headerRow}</thead>
                    ${groupsHtml}
                </table>
            </div>`;
    }
}
