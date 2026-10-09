// The layered strategy (layered-view.md §4, §10): stage planes side by side over full-width
// bands (browser / server / data / unplaced), cards with names in words, a side strip of
// downstream services per plane — drawn from layered-placement.mjs. This is the management
// register (§10): the physics view is for the person who will fix the thing; this one is for
// the person who needs the shape of a system in thirty seconds. A strategy owns layout and
// drawing only: verdicts, crossings, ghosting and selection arrive through the same node/edge
// state as the physics view, and the same classes draw them, so the key cannot drift. No
// physics, no stored positions — the grid is the layout.

import { stageColor } from './stage-colors.mjs';
import { nodeShape, shapeSvg } from './physics-view.mjs';
import { place, UNSTAGED } from './layered-placement.mjs';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

function cut(text, chars) {
    const s = String(text ?? '');
    return s.length > chars ? s.slice(0, chars - 1) + '…' : s;
}

// The doubtful values are settings on .atl-svg (atlas.css) — read once per mount.
function settings(host) {
    const probe = document.createElement('div');
    probe.className = 'atl-svg';
    host.appendChild(probe);
    const css = getComputedStyle(probe);
    const num = (name, fallback) => { const v = parseFloat(css.getPropertyValue(name)); return Number.isFinite(v) ? v : fallback; };
    const cardW = num('--atl-lay-card-w', 168), cardH = num('--atl-lay-card-h', 56);
    const s = {
        cardW, cardH,
        slot: cardW + num('--atl-lay-gutter', 24),
        row: cardH + num('--atl-lay-row-room', 60),
        gap: num('--atl-lay-gap', 60),
        side: num('--atl-lay-side', 48),
        pad: num('--atl-lay-pad', 40),
        bandLabel: num('--atl-lay-band-label', 56),
        header: num('--atl-lay-header', 40),
        route: num('--atl-lay-route', 28),
        nameChars: num('--atl-lay-card-chars', 18),
        subChars: num('--atl-lay-card-sub-chars', 30),
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
            : [...this.svg.querySelectorAll('[data-edges]')].filter((el) => el.dataset.edges.split(',').map(Number).includes(key.index));
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

    originX() {
        return this.s.pad + this.s.bandLabel;
    }

    planeX(index) {
        return this.originX() + index * (this.planeWidth() + this.s.gap);
    }

    bandTop() {
        return this.s.pad + this.s.header;
    }

    bandY(row) {
        const i = this.placement.rows.indexOf(row);
        return this.bandTop() + (i < 0 ? 0 : i) * this.s.row;
    }

    rowY(row) {
        return this.bandY(row) + this.s.row / 2;
    }

    centre(inst) {
        const s = this.s, p = this.placement;
        const x = this.planeX(inst.plane)
            + (inst.region === 'side' ? p.mainWidth * s.slot + s.side : 0)
            + inst.slot * s.slot + s.slot / 2;
        return { x, y: this.rowY(inst.row) };
    }

    // --- the name rule (§10.1) -------------------------------------------------------------------
    // First line: the canonical name when the claim has one; else the association's system name
    // when the node is the only member of that system on its plane; else the observed name.

    nameOf(inst) {
        const d = inst.node;
        const system = this.graph.system.toLowerCase();
        const own = d.serves.find((a) => (a.system ?? '').toLowerCase() === system);
        const canonical = own?.canonicalName ?? d.serves.map((a) => a.canonicalName).find((c) => c);
        if (canonical) return canonical;
        for (const sys of [...new Set(d.serves.map((a) => a.system).filter(Boolean))]) {
            const peers = this.placement.instances.filter((i) => i.plane === inst.plane && i.node.kind === d.kind
                && i.node.serves.some((a) => (a.system ?? '').toLowerCase() === sys.toLowerCase()));
            if (peers.length === 1) return sys;
        }
        return d.name;
    }

    // --- drawing -------------------------------------------------------------------------------

    render() {
        const s = this.s, p = this.placement;
        const planeW = this.planeWidth();
        const bandsW = p.planes.length * planeW + (p.planes.length - 1) * s.gap;
        const totalW = s.pad * 2 + s.bandLabel + bandsW;
        const bandsH = p.rows.length * s.row;
        const totalH = s.pad * 2 + s.header + bandsH + s.route * (1 + this.crossingLanes());
        const filtered = this.state.focus.size > 0;

        // Bands (§10.2): full width behind every plane, the label once on the left.
        const bandsSvg = p.rows.map((row, i) => {
            const y = this.bandY(row);
            const label = row === 'unplaced' ? 'unplaced' : row;
            return `
            <g class="atl-lay-band ${i % 2 ? 'is-alt' : ''} ${row === 'unplaced' ? 'is-unplaced' : ''}" data-band="${row}">
                <rect class="atl-lay-band-fill" x="${s.pad}" y="${y}" width="${s.bandLabel + bandsW}" height="${s.row}"></rect>
                <text class="atl-lay-band-label" transform="translate(${s.pad + s.bandLabel / 2 - 4}, ${y + s.row / 2}) rotate(-90)">${escapeHtml(label)}</text>
            </g>`;
        }).join('');

        // Planes as columns over the bands: a header cell, two rules, the side-strip split.
        const planesSvg = p.planes.map((plane, i) => {
            const x = this.planeX(i);
            const label = plane.stage === UNSTAGED ? 'unstaged' : plane.stage;
            const dot = plane.stage === UNSTAGED ? '' : `<circle cx="${x + 16}" cy="${s.pad + s.header / 2}" r="5" fill="${stageColor(plane.stage)}"></circle>`;
            const split = x + p.mainWidth * s.slot + s.side / 2;
            const side = p.sideWidth ? `
                <line class="atl-lay-sideline" x1="${split}" y1="${this.bandTop()}" x2="${split}" y2="${this.bandTop() + bandsH}"></line>
                <text class="atl-lay-caption" x="${split + s.side / 2 + 6}" y="${s.pad + s.header / 2 + 4}">downstream</text>` : '';
            return `
            <g class="atl-lay-plane" data-plane="${escapeHtml(plane.stage)}">
                <rect class="atl-lay-header" x="${x}" y="${s.pad}" width="${planeW}" height="${s.header}" rx="6"></rect>
                ${dot}<text class="atl-lay-stage" x="${x + (plane.stage === UNSTAGED ? 12 : 28)}" y="${s.pad + s.header / 2 + 5}">${escapeHtml(label)}</text>
                <line class="atl-lay-rule" x1="${x}" y1="${s.pad + s.header}" x2="${x}" y2="${this.bandTop() + bandsH}"></line>
                <line class="atl-lay-rule" x1="${x + planeW}" y1="${s.pad + s.header}" x2="${x + planeW}" y2="${this.bandTop() + bandsH}"></line>
                ${side}
            </g>`;
        }).join('');

        const edgeSvg = this.renderEdges();

        const nodeSvg = p.instances.map((inst) => {
            const d = inst.node;
            const { x, y } = this.centre(inst);
            const focus = this.state.focus.get(d.id) ?? 'focus';
            const alsoServes = d.serves.filter((a) => a.system && a.system.toLowerCase() !== this.graph.system.toLowerCase()).length;
            const classes = [
                'atl-node', 'atl-card',
                `atl-kind-${nodeShape(d)}`,
                d.declared || d.external || d.phantom ? 'atl-declaredish' : '',
                d.member ? 'atl-member' : d.unclassified ? 'atl-unclassified' : d.offSystem ? 'atl-offsystem' : '',
                d.phantom ? 'atl-phantom' : '',
                this.crossingEnds.has(d.id) ? 'atl-crossing-end' : '',
                focus === 'ghost' ? 'atl-ghost' : '',
            ].filter(Boolean).join(' ');
            const name = this.nameOf(inst);
            const unfamiliar = inst.layer && !['web', 'spa', 'api'].includes(inst.layer.toLowerCase());
            const subParts = [name !== d.name ? d.name : null, d.machine].filter(Boolean);
            const sub = inst.row === 'unplaced'
                ? `<text class="atl-card-sub atl-card-sub-warn" x="${-s.cardW / 2 + 32}" y="13">tag a layer in Triage</text>`
                : subParts.length ? `<text class="atl-card-sub" x="${-s.cardW / 2 + 32}" y="13">${escapeHtml(cut(subParts.join(' · '), s.subChars))}</text>` : '';
            const corner = unfamiliar ? `<text class="atl-card-corner" x="${s.cardW / 2 - 8}" y="${-s.cardH / 2 + 12}">${escapeHtml(inst.layer)}</text>` : '';
            // The browser card (§10.1): a browser-shaped block in the browser band over its
            // server card, joined by a stem; a spa's stem says its calls are unobserved.
            const browser = inst.browser ? (() => {
                const by = this.rowY('browser');
                const w = s.cardW, h = s.cardH;
                return `
                <g class="atl-lay-browser ${focus === 'ghost' ? 'atl-ghost' : ''}" transform="translate(${x},${by})">
                    <line class="atl-lay-stem ${inst.unobservedCalls ? 'atl-lay-stem-unobserved' : ''}" x1="0" y1="${h / 2}" x2="0" y2="${y - by - h / 2}"></line>
                    <rect class="atl-shape" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="7"></rect>
                    <path class="atl-lay-browser-bar" d="M ${-w / 2} ${-h / 2 + 11} H ${w / 2}"></path>
                    <circle class="atl-lay-browser-dot" cx="${-w / 2 + 9}" cy="${-h / 2 + 5.5}" r="1.8"></circle>
                    <circle class="atl-lay-browser-dot" cx="${-w / 2 + 16}" cy="${-h / 2 + 5.5}" r="1.8"></circle>
                    <circle class="atl-lay-browser-dot" cx="${-w / 2 + 23}" cy="${-h / 2 + 5.5}" r="1.8"></circle>
                    <text class="atl-card-name" x="${-w / 2 + 12}" y="${7}">${escapeHtml(cut(name, s.nameChars + 4))}</text>
                    <text class="atl-card-sub" x="${-w / 2 + 12}" y="${22}">${escapeHtml(inst.layer)}${inst.unobservedCalls ? ' · calls unobserved' : ''}</text>
                </g>`;
            })() : '';
            return `
            ${browser}
            <g data-node="${escapeHtml(d.id)}" class="${classes}" transform="translate(${x},${y})">
                <rect class="atl-shape" x="${-s.cardW / 2}" y="${-s.cardH / 2}" width="${s.cardW}" height="${s.cardH}" rx="8"></rect>
                <g class="atl-card-icon" transform="translate(${-s.cardW / 2 + 17}, 0) scale(0.55)">${shapeSvg(nodeShape(d), 21)}</g>
                <text class="atl-card-name" x="${-s.cardW / 2 + 32}" y="${sub ? -3 : 5}">${escapeHtml(cut(name, s.nameChars))}</text>
                ${sub}${corner}
                ${alsoServes > 0 ? `<text class="atl-also" x="${s.cardW / 2 - 6}" y="${-s.cardH / 2 - 4}">+${alsoServes}</text>` : ''}
            </g>`;
        }).join('');

        this.host.innerHTML = `
            <svg class="atl-svg atl-lay ${filtered ? 'is-filtered' : ''}" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">
                <g>${bandsSvg}</g>
                <g>${planesSvg}</g>
                <g>${edgeSvg}</g>
                <g>${nodeSvg}</g>
            </svg>`;
        this.svg = this.host.querySelector('svg');
        this.bind();
    }

    // --- lines (§10.3): one per pair of cards, edge to edge, crossings routed under the bands ---

    // Edges grouped by their two ends; the loudest verdict and crossing win the line's class.
    pairs() {
        const groups = new Map();
        this.graph.edges.forEach((e, i) => {
            const ends = this.placement.endpoints(e);
            if (!ends) return;
            const key = `${e.sourceId}\u0000${e.targetId}`;
            if (!groups.has(key)) groups.set(key, { ends, edges: [], indexes: [] });
            groups.get(key).edges.push(e);
            groups.get(key).indexes.push(i);
        });
        return [...groups.values()];
    }

    crossingLanes() {
        return this.pairs().filter((g) => g.ends[0].plane !== g.ends[1].plane).length;
    }

    // Where a line leaves a card: the midpoint of the side facing the other end.
    port(inst, toward) {
        const c = this.centre(inst), s = this.s;
        if (toward.y > c.y + s.cardH / 2) return { x: c.x, y: c.y + s.cardH / 2 };
        if (toward.y < c.y - s.cardH / 2) return { x: c.x, y: c.y - s.cardH / 2 };
        return toward.x >= c.x ? { x: c.x + s.cardW / 2, y: c.y } : { x: c.x - s.cardW / 2, y: c.y };
    }

    renderEdges() {
        const s = this.s;
        const routeBase = this.bandTop() + this.placement.rows.length * s.row;
        let lane = 0;
        return this.pairs().map((g) => {
            const [a, b] = g.ends;
            const ca = this.centre(a), cb = this.centre(b);
            const loud = (list, pick) => list.map(pick).filter(Boolean);
            const verdict = loud(g.edges, (e) => e.verdict).sort()[0] ?? g.edges[0].verdict;
            const crossingEdge = g.edges.find((e) => e.crossing && !e.accepted) ?? g.edges.find((e) => e.crossing);
            const crossing = !crossingEdge ? ''
                : crossingEdge.accepted ? ' atl-edge-crossing atl-edge-accepted'
                : crossingEdge.crossingBasis === 'derived' ? ' atl-edge-crossing atl-edge-derived'
                : ' atl-edge-crossing';
            const sf = this.state.focus.get(a.nodeId) ?? 'focus';
            const tf = this.state.focus.get(b.nodeId) ?? 'focus';
            const fade = sf === 'ghost' && tf === 'ghost' ? (crossingEdge ? ' atl-edge-bleed' : ' atl-edge-ghost')
                : sf === 'ghost' || tf === 'ghost' ? ' atl-edge-bleed' : '';
            const kinds = [...new Set(g.edges.map((e) => e.kind))].map((k) => `atl-edgekind-${escapeHtml(k)}`).join(' ');
            const classes = `atl-edge atl-edge-${escapeHtml(verdict)} ${kinds}${crossing}${fade}`;
            let d, mid;
            if (a.plane === b.plane) {
                const pa = this.port(a, cb), pb = this.port(b, ca);
                d = `M ${pa.x} ${pa.y} L ${pb.x} ${pb.y}`;
                mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
            } else {
                // Routed (§10.3): down from the caller into the gap under the bands, along, up into
                // the target's plane — touching no plane in between.
                const y = routeBase + s.route * (1 + lane++) - s.route / 2;
                const pa = { x: ca.x, y: ca.y + s.cardH / 2 }, pb = { x: cb.x, y: cb.y + s.cardH / 2 };
                const r = 10, dir = pb.x > pa.x ? 1 : -1;
                d = `M ${pa.x} ${pa.y} V ${y - r} Q ${pa.x} ${y} ${pa.x + dir * r} ${y} H ${pb.x - dir * r} Q ${pb.x} ${y} ${pb.x} ${y - r} V ${pb.y}`;
                mid = { x: (pa.x + pb.x) / 2, y };
            }
            const count = g.edges.length > 1 ? `
                <g class="atl-lay-count" transform="translate(${mid.x},${mid.y})"><rect x="-13" y="-8" width="26" height="16" rx="8"></rect><text y="4">×${g.edges.length}</text></g>` : '';
            const idx = g.indexes.join(',');
            return `
            <path data-edges="${idx}" data-edge="${g.indexes[0]}" class="${classes}" d="${d}" fill="none"></path>
            <path data-edges="${idx}" data-edge="${g.indexes[0]}" class="atl-edge-hit" d="${d}" fill="none"></path>${count}`;
        }).join('');
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
