// The layered strategy (layered-view.md §4): stage planes side by side, each with the
// browser / server / data rows and a side strip of downstream services, drawn from
// layered-placement.mjs. A strategy owns layout and drawing only: verdicts, crossings,
// ghosting and selection arrive through the same node/edge state as the physics view, and
// the same classes draw them, so the key cannot drift. No physics, no stored positions —
// the grid is the layout.

import { stageColor } from './stage-colors.mjs';
import { nodeShape, shapeSvg } from './physics-view.mjs';
import { place, UNSTAGED } from './layered-placement.mjs';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

// The doubtful values are settings on .atl-svg (atlas.css) — read once per mount.
function settings(host) {
    const probe = document.createElement('div');
    probe.className = 'atl-svg';
    host.appendChild(probe);
    const css = getComputedStyle(probe);
    const num = (name, fallback) => { const v = parseFloat(css.getPropertyValue(name)); return Number.isFinite(v) ? v : fallback; };
    const s = {
        slot: num('--atl-lay-slot', 150),
        row: num('--atl-lay-row', 118),
        gap: num('--atl-lay-gap', 60),
        side: num('--atl-lay-side', 48),
        glyph: num('--atl-lay-glyph', 15),
        pad: num('--atl-lay-pad', 56),
    };
    probe.remove();
    return s;
}

export class LayeredView {
    constructor(onSelect) {
        this.onSelect = onSelect;
    }

    /// graph: the API dto (observed grouping); state: { focus: Map<nodeId, 'focus'|'ghost'> }
    mount(host, graph, state) {
        this.host = host;
        this.graph = graph;
        this.state = state;
        this.s = settings(host);
        this.placement = place(graph);
        this.crossingEnds = new Set(graph.edges.filter((e) => e.crossing && !e.accepted).flatMap((e) => [e.sourceId, e.targetId]));
        this.render();
    }

    destroy() { }

    setSelected(key) {
        if (!this.svg) return;
        this.svg.querySelectorAll('.atl-selected').forEach((el) => el.classList.remove('atl-selected'));
        if (key == null) return;
        const els = key.type === 'node'
            ? this.svg.querySelectorAll(`[data-node="${CSS.escape(key.id)}"]`)
            : this.svg.querySelectorAll(`[data-edge="${key.index}"]`);
        els.forEach((el) => el.classList.add('atl-selected'));
    }

    setLift(on) {
        if (!this.svg) return;
        this.svg.classList.toggle('is-lifting', on);
    }

    // --- geometry ------------------------------------------------------------------------------

    planeWidth() {
        const p = this.placement, s = this.s;
        return p.mainWidth * s.slot + (p.sideWidth ? s.side + p.sideWidth * s.slot : 0);
    }

    planeX(index) {
        return this.s.pad + index * (this.planeWidth() + this.s.gap);
    }

    rowY(row) {
        const i = this.placement.rows.indexOf(row);
        return this.s.pad + 28 + (i < 0 ? 0 : i) * this.s.row + this.s.row / 2;
    }

    centre(inst) {
        const s = this.s, p = this.placement;
        const x = this.planeX(inst.plane)
            + (inst.region === 'side' ? p.mainWidth * s.slot + s.side : 0)
            + inst.slot * s.slot + s.slot / 2;
        return { x, y: this.rowY(inst.row) };
    }

    // --- drawing -------------------------------------------------------------------------------

    render() {
        const s = this.s, p = this.placement;
        const planeW = this.planeWidth();
        const totalW = s.pad * 2 + p.planes.length * planeW + (p.planes.length - 1) * s.gap;
        const totalH = s.pad * 2 + 28 + p.rows.length * s.row;
        const filtered = this.state.focus.size > 0;

        const planesSvg = p.planes.map((plane, i) => {
            const x = this.planeX(i);
            const label = plane.stage === UNSTAGED ? 'unstaged' : plane.stage;
            const dot = plane.stage === UNSTAGED ? '' : `<circle cx="${x + 12}" cy="${s.pad + 10}" r="4" fill="${stageColor(plane.stage)}"></circle>`;
            const rows = p.rows.map((row) => `
                <text class="atl-lay-rowlabel" x="${x + 6}" y="${this.rowY(row) - s.row / 2 + 14}">${row}</text>
                <line class="atl-lay-rowline" x1="${x}" y1="${this.rowY(row) - s.row / 2}" x2="${x + planeW}" y2="${this.rowY(row) - s.row / 2}"></line>`).join('');
            const side = p.sideWidth ? `
                <line class="atl-lay-sideline" x1="${x + p.mainWidth * s.slot + s.side / 2}" y1="${s.pad + 28}" x2="${x + p.mainWidth * s.slot + s.side / 2}" y2="${totalH - s.pad}"></line>
                <text class="atl-lay-rowlabel" x="${x + p.mainWidth * s.slot + s.side + 6}" y="${s.pad + 22}">downstream</text>` : '';
            return `
            <g class="atl-lay-plane" data-plane="${escapeHtml(plane.stage)}">
                <rect class="atl-lay-slab" x="${x}" y="${s.pad + 28}" width="${planeW}" height="${p.rows.length * s.row}" rx="10"></rect>
                ${dot}<text class="atl-lay-stage" x="${x + (plane.stage === UNSTAGED ? 6 : 22)}" y="${s.pad + 14}">${escapeHtml(label)}</text>
                ${rows}${side}
            </g>`;
        }).join('');

        // Edges between the instances the placement picks (a shared plane, else first planes).
        const edgeSvg = this.graph.edges.map((e, i) => {
            const ends = p.endpoints(e);
            if (!ends) return '';
            const [a, b] = ends.map((inst) => this.centre(inst));
            const sf = this.state.focus.get(e.sourceId) ?? 'focus';
            const tf = this.state.focus.get(e.targetId) ?? 'focus';
            const crossing = !e.crossing ? ''
                : e.accepted ? ' atl-edge-crossing atl-edge-accepted'
                : e.crossingBasis === 'derived' ? ' atl-edge-crossing atl-edge-derived'
                : ' atl-edge-crossing';
            const fade = sf === 'ghost' && tf === 'ghost' ? (e.crossing ? ' atl-edge-bleed' : ' atl-edge-ghost')
                : sf === 'ghost' || tf === 'ghost' ? ' atl-edge-bleed' : '';
            return `
            <line data-edge="${i}" class="atl-edge atl-edge-${escapeHtml(e.verdict)} atl-edgekind-${escapeHtml(e.kind)}${crossing}${fade}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>
            <line data-edge="${i}" class="atl-edge-hit" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
        }).join('');

        const nodeSvg = p.instances.map((inst) => {
            const d = inst.node;
            const { x, y } = this.centre(inst);
            const focus = this.state.focus.get(d.id) ?? 'focus';
            const alsoServes = d.serves.filter((a) => a.system && a.system.toLowerCase() !== this.graph.system.toLowerCase()).length;
            const classes = [
                'atl-node',
                `atl-kind-${nodeShape(d)}`,
                d.declared || d.external || d.phantom ? 'atl-declaredish' : '',
                d.member ? 'atl-member' : d.unclassified ? 'atl-unclassified' : d.offSystem ? 'atl-offsystem' : '',
                d.phantom ? 'atl-phantom' : '',
                this.crossingEnds.has(d.id) ? 'atl-crossing-end' : '',
                focus === 'ghost' ? 'atl-ghost' : '',
            ].filter(Boolean).join(' ');
            const unfamiliar = inst.layer && !['web', 'spa', 'api'].includes(inst.layer.toLowerCase());
            const badge = inst.row === 'unplaced'
                ? `<text class="atl-lay-badge atl-lay-badge-warn" y="-26">unplaced — tag a layer in Triage</text>`
                : unfamiliar ? `<text class="atl-lay-badge" y="-26">${escapeHtml(inst.layer)}</text>` : '';
            // The browser glyph (layered-view.md §2): a drawing of the web/spa tag above its
            // server node, joined by a stem; a spa's calls are not observed and the stem says so.
            const browser = inst.browser ? (() => {
                const by = this.rowY('browser');
                const g = s.glyph;
                return `
                <g class="atl-lay-browser ${focus === 'ghost' ? 'atl-ghost' : ''}" transform="translate(${x},${by})">
                    <line class="atl-lay-stem ${inst.unobservedCalls ? 'atl-lay-stem-unobserved' : ''}" x1="0" y1="${g}" x2="0" y2="${y - by - 24}"></line>
                    <path class="atl-shape" d="M 0 ${-g} L ${g * 1.1} ${g * 0.8} L ${-g * 1.1} ${g * 0.8} Z"></path>
                    <text class="atl-lay-badge" y="${g + 16}">${escapeHtml(inst.layer)}${inst.unobservedCalls ? ' · calls unobserved' : ''}</text>
                </g>`;
            })() : '';
            return `
            ${browser}
            <g data-node="${escapeHtml(d.id)}" class="${classes}" transform="translate(${x},${y})">
                ${shapeSvg(nodeShape(d), 21)}
                ${badge}
                ${alsoServes > 0 ? `<text class="atl-also" x="19" y="-19">+${alsoServes}</text>` : ''}
                <text class="atl-label" y="38">${escapeHtml(d.name.length > 22 ? d.name.slice(0, 21) + '…' : d.name)}</text>
                ${d.machine ? `<text class="atl-sublabel" y="52">${escapeHtml(d.machine)}</text>` : ''}
            </g>`;
        }).join('');

        this.host.innerHTML = `
            <svg class="atl-svg atl-lay ${filtered ? 'is-filtered' : ''}" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">
                <g>${planesSvg}</g>
                <g>${edgeSvg}</g>
                <g>${nodeSvg}</g>
            </svg>`;
        this.svg = this.host.querySelector('svg');
        this.bind();
    }

    bind() {
        this.svg.addEventListener('pointerdown', () => {
            if (this.svg.classList.contains('is-lifting')) {
                this.svg.classList.remove('is-lifting');
                this.onLiftCleared?.();
            }
        });
        this.svg.addEventListener('click', (ev) => {
            const g = ev.target.closest('[data-node]');
            if (g) {
                const node = this.graph.nodes.find((n) => n.id === g.dataset.node);
                this.setSelected({ type: 'node', id: node.id });
                this.onSelect({ type: 'node', item: node });
                return;
            }
            const line = ev.target.closest('[data-edge]');
            if (line) {
                const index = Number(line.dataset.edge);
                this.setSelected({ type: 'edge', index });
                this.onSelect({ type: 'edge', item: this.graph.edges[index] });
                return;
            }
            this.setSelected(null);
            this.onSelect(null);
        });
    }
}
