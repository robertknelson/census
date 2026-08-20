// The v1 view strategy (system-view.md §4): a hand-rolled spring/repulsion simulation
// that settles and FREEZES — physics arranges, it never jiggles. Positions are seeded
// from a stable hash of node identity (the same graph settles the same way twice) and
// dragged/settled positions persist per tab, so a view reopens exactly as last seen.
// A strategy owns layout and drawing only; honesty rules (ghost-never-hide, dashed
// declared seam, unclassified shown) arrive via the node/edge state the page computes.

const W = 1400;
const H = 900;

function hashSeed(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

function nodeShape(n) {
    if (n.kind === 'database') return 'rect';
    if (n.kind === 'application') return 'circle';
    if (n.kind === 'endpoint') return 'dot';
    if (n.external) return 'hex';
    return 'diamond';
}

function shapeSvg(n, r) {
    switch (nodeShape(n)) {
        case 'rect': return `<rect x="${-r}" y="${-r * 0.72}" width="${r * 2}" height="${r * 1.44}" rx="3"></rect>`;
        case 'dot': return `<circle r="${r * 0.45}"></circle>`;
        case 'hex': {
            const p = [...Array(6)].map((_, i) => {
                const a = Math.PI / 3 * i + Math.PI / 6;
                return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
            }).join(' ');
            return `<polygon points="${p}"></polygon>`;
        }
        case 'diamond': return `<rect x="${-r * 0.8}" y="${-r * 0.8}" width="${r * 1.6}" height="${r * 1.6}" transform="rotate(45)"></rect>`;
        default: return `<circle r="${r}"></circle>`;
    }
}

export class PhysicsView {
    /**
     * @param onSelect    ({type:'node'|'edge', item} | null) => void
     * @param onPositions (positions map) => void — called when the layout settles or a drag ends
     */
    constructor(onSelect, onPositions) {
        this.onSelect = onSelect;
        this.onPositions = onPositions;
        this.frame = null;
    }

    /// graph: the API dto; state: { focus: Map<nodeId, 'focus'|'ghost'>, positions }
    mount(host, graph, state) {
        this.destroy();
        this.host = host;
        this.graph = graph;
        this.state = state;
        this.nodes = graph.nodes.map((n) => {
            const saved = state.positions?.[n.id];
            const seedA = hashSeed(n.id) * Math.PI * 2;
            const seedR = 120 + hashSeed(n.id + '#r') * Math.min(W, H) * 0.32;
            return {
                dto: n,
                x: saved?.x ?? W / 2 + Math.cos(seedA) * seedR,
                y: saved?.y ?? H / 2 + Math.sin(seedA) * seedR,
                vx: 0, vy: 0,
                pinned: saved?.pinned ?? false,
            };
        });
        this.byId = new Map(this.nodes.map((n) => [n.dto.id, n]));
        // Settle SYNCHRONOUSLY, then draw once — no animation loop at all. A frame-driven
        // simulation throttles with window focus and drifts for minutes; a settled-once
        // layout is the ratified behavior (settle-and-freeze) with zero jiggle ever, and
        // even a few hundred nodes cost well under a frame's budget.
        if (!this.nodes.every((n) => state.positions?.[n.dto.id])) {
            this.simulate();
            this.persistPositions();
        }
        this.render();
    }

    destroy() { }

    simulate() {
        const ns = this.nodes;
        for (let ticks = 0; ticks < 420; ticks++) {
            let moved = 0;
            for (let i = 0; i < ns.length; i++) {
                const a = ns[i];
                if (a.pinned) continue;
                let fx = (W / 2 - a.x) * 0.004;
                let fy = (H / 2 - a.y) * 0.004;
                for (let j = 0; j < ns.length; j++) {
                    if (i === j) continue;
                    const b = ns[j];
                    const dx = a.x - b.x, dy = a.y - b.y;
                    const d2 = Math.max(dx * dx + dy * dy, 64);
                    const f = 9000 / d2;
                    const d = Math.sqrt(d2);
                    fx += (dx / d) * f;
                    fy += (dy / d) * f;
                }
                a.vx = (a.vx + fx) * 0.82;
                a.vy = (a.vy + fy) * 0.82;
            }
            for (const e of this.graph.edges) {
                const s = this.byId.get(e.sourceId), t = this.byId.get(e.targetId);
                if (!s || !t) continue;
                const dx = t.x - s.x, dy = t.y - s.y;
                const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
                const f = (d - 170) * 0.015;
                if (!s.pinned) { s.vx += (dx / d) * f; s.vy += (dy / d) * f; }
                if (!t.pinned) { t.vx -= (dx / d) * f; t.vy -= (dy / d) * f; }
            }
            for (const n of ns) {
                if (n.pinned) continue;
                n.x = Math.min(W - 40, Math.max(40, n.x + n.vx));
                n.y = Math.min(H - 50, Math.max(40, n.y + n.vy));
                moved += Math.abs(n.vx) + Math.abs(n.vy);
            }
            if (moved < 0.6) break;
        }
    }

    persistPositions() {
        const positions = {};
        for (const n of this.nodes) positions[n.dto.id] = { x: Math.round(n.x), y: Math.round(n.y), pinned: n.pinned };
        this.onPositions(positions);
    }

    render() {
        const edgeSvg = this.graph.edges.map((e, i) => `
            <line data-edge="${i}" class="atl-edge atl-edge-${escapeHtml(e.verdict)} atl-edgekind-${escapeHtml(e.kind)}"></line>`).join('');
        const nodeSvg = this.nodes.map((n) => {
            const d = n.dto;
            const focus = this.state.focus.get(d.id) ?? 'focus';
            const alsoServes = d.serves.filter((a) => a.system && a.system.toLowerCase() !== this.graph.system.toLowerCase()).length;
            const classes = [
                'atl-node',
                `atl-kind-${nodeShape(d)}`,
                d.declared || d.external || d.phantom ? 'atl-declaredish' : '',
                d.member ? 'atl-member' : d.unclassified ? 'atl-unclassified' : d.offSystem ? 'atl-offsystem' : '',
                d.phantom ? 'atl-phantom' : '',
                focus === 'ghost' ? 'atl-ghost' : '',
            ].filter(Boolean).join(' ');
            return `
            <g data-node="${escapeHtml(d.id)}" class="${classes}">
                ${shapeSvg(d, 15)}
                ${alsoServes > 0 ? `<text class="atl-also" x="14" y="-14">+${alsoServes}</text>` : ''}
                <text class="atl-label" y="30">${escapeHtml(d.name.length > 26 ? d.name.slice(0, 25) + '…' : d.name)}</text>
                ${d.machine ? `<text class="atl-sublabel" y="42">${escapeHtml(d.machine)}</text>` : ''}
            </g>`;
        }).join('');

        this.host.innerHTML = `
            <svg class="atl-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
                <g>${edgeSvg}</g>
                <g>${nodeSvg}</g>
            </svg>`;
        this.svg = this.host.querySelector('svg');
        this.positionElements();
        this.bind();
    }

    positionElements() {
        if (!this.svg) return;
        this.svg.querySelectorAll('[data-node]').forEach((g) => {
            const n = this.byId.get(g.dataset.node);
            if (n) g.setAttribute('transform', `translate(${n.x},${n.y})`);
        });
        this.svg.querySelectorAll('[data-edge]').forEach((line) => {
            const e = this.graph.edges[Number(line.dataset.edge)];
            const s = this.byId.get(e.sourceId), t = this.byId.get(e.targetId);
            if (!s || !t) return;
            line.setAttribute('x1', s.x); line.setAttribute('y1', s.y);
            line.setAttribute('x2', t.x); line.setAttribute('y2', t.y);
        });
    }

    bind() {
        let drag = null;
        this.svg.addEventListener('pointerdown', (ev) => {
            const g = ev.target.closest('[data-node]');
            if (!g) return;
            const n = this.byId.get(g.dataset.node);
            drag = { n, moved: false, startX: ev.clientX, startY: ev.clientY };
            try { this.svg.setPointerCapture(ev.pointerId); } catch { /* synthetic pointers */ }
        });
        this.svg.addEventListener('pointermove', (ev) => {
            if (!drag) return;
            // A click is not a drag until the pointer has really traveled — mice emit
            // same-spot moves that would otherwise eat every selection.
            if (!drag.moved && Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 4) return;
            const pt = this.toGraph(ev);
            drag.n.x = pt.x; drag.n.y = pt.y;
            drag.n.pinned = true;
            drag.moved = true;
            this.positionElements();
        });
        this.svg.addEventListener('pointerup', (ev) => {
            if (!drag) return;
            const { n, moved } = drag;
            drag = null;
            if (moved) this.persistPositions();
            else this.onSelect({ type: 'node', item: n.dto });
        });
        this.svg.addEventListener('click', (ev) => {
            if (ev.target.closest('[data-node]')) return;
            const line = ev.target.closest('[data-edge]');
            if (line) this.onSelect({ type: 'edge', item: this.graph.edges[Number(line.dataset.edge)] });
            else this.onSelect(null);
        });
    }

    toGraph(ev) {
        const rect = this.svg.getBoundingClientRect();
        const scale = Math.min(rect.width / W, rect.height / H);
        const ox = (rect.width - W * scale) / 2;
        const oy = (rect.height - H * scale) / 2;
        return {
            x: Math.min(W - 40, Math.max(40, (ev.clientX - rect.left - ox) / scale)),
            y: Math.min(H - 50, Math.max(40, (ev.clientY - rect.top - oy) / scale)),
        };
    }
}
