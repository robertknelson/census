// Board scope, carried into the fleet panels (census-web.md §11, ratified 2026-08-28):
// what the board shows is what the panel lists. A scope is { machines: Set, label } or
// null for the whole fleet. Each panel keeps a local "show fleet" escape so a short list
// never reads as a small fleet — it resets when the panel reopens.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

export class PanelScope {
    /// getScope: () => { machines: Set<string>, label: string } | null
    constructor(getScope) {
        this.getScope = getScope;
        this.showFleet = false;
    }

    active() {
        return this.showFleet ? null : this.getScope();
    }

    has(machine) {
        const scope = this.active();
        return scope === null || scope.machines.has(machine);
    }

    /// The line above a scoped list; empty when the board itself is fleet-wide.
    lineHtml() {
        const scope = this.getScope();
        if (scope === null) return '';
        const n = scope.machines.size;
        return this.showFleet
            ? `<div class="est-scope"><span class="est-muted">showing the whole fleet</span><button class="est-btn est-btn-sm" data-ref="scope-toggle">scope to ${escapeHtml(scope.label)}</button></div>`
            : `<div class="est-scope">scoped to <strong>${escapeHtml(scope.label)}</strong><span class="est-muted">· ${n} machine${n === 1 ? '' : 's'}</span><button class="est-btn est-btn-sm" data-ref="scope-toggle">show fleet</button></div>`;
    }

    bind(container, rerender) {
        container.querySelector('[data-ref="scope-toggle"]')?.addEventListener('click', () => {
            this.showFleet = !this.showFleet;
            rerender();
        });
    }
}
