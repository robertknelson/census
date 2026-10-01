import { fetchBlastRadius, fetchBlastRadiusExternal } from './estate-api.mjs';

// The payoff view (blast-radius.md): "this machine down" answered as deployments —
// system × stage — with the evidence behind each line. Read-only; the tags that label the
// answer are edited in Triage.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

function verdictBadge(verdict) {
    if (verdict === 'confirmed') return '<span class="est-badge est-verdict-confirmed">confirmed</span>';
    if (verdict === 'contradicted') return '<span class="est-badge est-badge-warn">contradicted</span>';
    // An edge into a declared target has nothing to corroborate against — the badge says so.
    if (verdict === 'declared') return '<span class="est-badge est-badge-declared" title="target declared by a human, never corroborated">declared target</span>';
    return '<span class="est-badge">unobserved</span>';
}

export class BlastRadiusPanel {
    /// subject: a machine name, or { kind: 'external', name } for a declared external entity.
    constructor(subject, openDetails, openTriage) {
        this.subject = subject;
        this.openDetails = openDetails;
        this.openTriage = openTriage;
    }

    async mount(container) {
        this.container = container;
        container.innerHTML = '<p class="est-status">Walking the edges…</p>';
        try {
            this.data = this.subject?.kind === 'external'
                ? await fetchBlastRadiusExternal(this.subject.name)
                : await fetchBlastRadius(this.subject);
        } catch (err) {
            container.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.render();
    }

    render() {
        const d = this.data;
        const headline = d.deployments.length === 0
            ? '<p class="est-status">No classified deployment is touched — see the unclassified and unknown sections below before reading that as safety.</p>'
            : d.deployments.map((dep) => this.renderDeployment(dep)).join('');

        const subjectLine = d.subjectKind === 'external' ? `
            <div class="est-blast-row">
                <span class="est-badge est-badge-declared">${escapeHtml(d.subjectEntityKind ?? 'declared')}</span>
                ${(d.subjectSystem ?? []).map((v) => `<span class="est-badge est-tag-system">${escapeHtml(v)}</span>`).join('')}
                ${(d.subjectStage ?? []).map((v) => `<span class="est-badge">${escapeHtml(v)}</span>`).join('')}
                <span class="est-muted">deployments below come from the dependents' own tags</span>
            </div>` : '';

        this.container.innerHTML = `
            ${subjectLine}
            <section>
                <h3>Deployments down</h3>
                ${headline}
            </section>
            ${this.renderUnclassified(d)}
            ${d.contradicted.length > 0 ? `
            <section>
                <h3>Points here, but contradicted</h3>
                <p class="est-status">Every edge these applications aim at ${escapeHtml(d.machine)} targets something census proves is not there — config drift, not impact.</p>
                ${d.contradicted.map((dep) => this.renderDependent(dep)).join('')}
            </section>` : ''}
            ${d.unknowns.length > 0 ? `
            <section>
                <h3>Unknown</h3>
                ${d.unknowns.map((u) => {
                    const scope = u.kind === 'instance' ? `instance <span class="est-mono">${escapeHtml(u.container)}</span>`
                        : u.container ? `${u.kind.toUpperCase()} on <span class="est-mono">${escapeHtml(u.container)}</span>`
                        : u.kind.toUpperCase();
                    const tail = d.subjectKind === 'external'
                        ? 'edges from there cannot be seen, so its dependence on this entity is unknown'
                        : 'whatever runs there is in the blast and not in this answer';
                    return `<div class="est-triage-unknown">${scope} — collection ${escapeHtml(u.status)}; ${tail}</div>`;
                }).join('')}
            </section>` : ''}`;

        this.container.querySelectorAll('[data-machine]').forEach((btn) =>
            btn.addEventListener('click', () => this.openDetails(btn.dataset.machine)));
        this.container.querySelector('[data-act="triage"]')?.addEventListener('click', () => this.openTriage());
    }

    renderDeployment(dep) {
        const labels = [];
        if (dep.hosted.length > 0) labels.push(dep.hosted.length === 1 ? '1 hosted entity' : `${dep.hosted.length} hosted entities`);
        if (dep.dependents.length > 0) labels.push(dep.dependents.length === 1 ? '1 dependent app' : `${dep.dependents.length} dependent apps`);
        return `
            <details class="est-blast-deployment">
                <summary>
                    <span class="est-badge est-tag-system">${escapeHtml(dep.system || '—')}</span>
                    <span class="est-badge">${escapeHtml(dep.stage || '—')}</span>
                    <span class="est-muted">${labels.join(' · ')}</span>
                </summary>
                ${dep.hosted.length > 0 ? `
                    <h4 class="est-subhead">On the box</h4>
                    ${dep.hosted.map((h) => this.renderHosted(h)).join('')}` : ''}
                ${dep.dependents.length > 0 ? `
                    <h4 class="est-subhead">Depending on it from elsewhere</h4>
                    ${dep.dependents.map((a) => this.renderDependent(a)).join('')}` : ''}
            </details>`;
    }

    // A declared contributor has no observed container and renders with the asserted seam
    // (declared-entities.md §7) — it goes down with the box on the human's word, not census's.
    renderHosted(h, extra = '') {
        if (h.declared) {
            return `
                <div class="est-blast-row">
                    <span class="est-mono">${escapeHtml(h.name)}</span>
                    <span class="est-badge est-badge-declared" title="asserted, never observed">${escapeHtml(h.kind)}</span>
                    ${extra}
                </div>`;
        }
        return `
            <div class="est-blast-row">
                <span class="est-mono">${escapeHtml(h.container)}</span> · <span class="est-mono">${escapeHtml(h.name)}</span>
                <span class="est-muted">${escapeHtml(h.kind)}</span>
                ${extra}
            </div>`;
    }

    renderDependent(app) {
        return `
            <div class="est-blast-row">
                <button class="est-q-machine est-mono" data-machine="${escapeHtml(app.machine)}">${escapeHtml(app.machine)}</button>
                <span class="est-mono">${escapeHtml(app.siteName)}${escapeHtml(app.appPath)}</span>
                <div class="est-blast-edges">${app.edges.map((e) => {
                    // A database edge with no parsed database is "?" on purpose; an edge to
                    // a declared target has no database slot at all, so nothing renders.
                    const database = e.url ?? e.database ?? (e.verdict === 'declared' ? null : '?');
                    return `
                    <div class="est-blast-edge" ${e.detail ? `title="${escapeHtml(e.detail)}"` : ''}>
                        <span class="est-mono">${escapeHtml(e.name)}</span>
                        <span class="est-muted">→ ${escapeHtml([database, e.sourceFile].filter(Boolean).join(' · '))}</span>
                        ${verdictBadge(e.verdict)}
                    </div>`;
                }).join('')}</div>
            </div>`;
    }

    renderUnclassified(d) {
        const total = d.unclassifiedHosted.length + d.unclassifiedDependents.length;
        if (total === 0) return '';
        return `
            <section>
                <h3>In the blast, unclassified <button class="est-btn est-btn-sm" data-act="triage">Open Triage</button></h3>
                <p class="est-status">These go down too — nobody has said what they belong to, so no deployment line can claim them.</p>
                ${d.unclassifiedHosted.map((h) => this.renderHosted(h, '<span class="est-tag-none">unclassified</span>')).join('')}
                ${d.unclassifiedDependents.map((a) => this.renderDependent(a)).join('')}
            </section>`;
    }
}
