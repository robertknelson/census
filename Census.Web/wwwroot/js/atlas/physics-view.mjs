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

    /// Highlight the selected node/edge element (or clear with null) — the page calls
    /// this too when the inspector is dismissed from its own close button.
    setSelected(key) {
        if (!this.svg) return;
        this.svg.querySelectorAll('.atl-selected').forEach((el) => el.classList.remove('atl-selected'));
        if (key == null) return;
        const el = key.type === 'node'
            ? this.svg.querySelector(`[data-node="${CSS.escape(key.id)}"]`)
            : this.svg.querySelector(`[data-edge="${key.index}"]`);
        el?.classList.add('atl-selected');
    }

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
                    const f = 14000 / d2;
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
                const f = (d - 200) * 0.015;
                if (!s.pinned) { s.vx += (dx / d) * f; s.vy += (dy / d) * f; }
                if (!t.pinned) { t.vx -= (dx / d) * f; t.vy -= (dy / d) * f; }
            }
            for (const n of ns) {
                if (n.pinned) continue;
                n.x = Math.min(W - 48, Math.max(48, n.x + n.vx));
                n.y = Math.min(H - 64, Math.max(48, n.y + n.vy));
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
        // Edges fade with their endpoints, three levels (ratified 2026-08-25): full when
        // both ends are in stage, mid when exactly one recedes — that line IS the
        // cross-stage bleed — and node-ghost level when both recede. Never hidden.
        const edgeSvg = this.graph.edges.map((e, i) => {
            const sf = this.state.focus.get(e.sourceId) ?? 'focus';
            const tf = this.state.focus.get(e.targetId) ?? 'focus';
            const fade = sf === 'ghost' && tf === 'ghost' ? ' atl-edge-ghost'
                : sf === 'ghost' || tf === 'ghost' ? ' atl-edge-bleed' : '';
            return `
            <line data-edge="${i}" class="atl-edge atl-edge-${escapeHtml(e.verdict)} atl-edgekind-${escapeHtml(e.kind)}${fade}"></line>`;
        }).join('');
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
                d.canonical ? 'atl-canonical' : '',
                focus === 'ghost' ? 'atl-ghost' : '',
            ].filter(Boolean).join(' ');
            // A canonical node's sublabel is its distinct hosts — the clean-view line
            // ("MyWeb / WebDev, WebVal, WebProd") drawn under the canonical name.
            const sublabel = d.machine ?? ((d.hosts ?? []).length ? d.hosts.join(', ') : null);
            return `
            <g data-node="${escapeHtml(d.id)}" class="${classes}">
                ${shapeSvg(d, 21)}
                ${alsoServes > 0 ? `<text class="atl-also" x="19" y="-19">+${alsoServes}</text>` : ''}
                ${d.canonical ? `<text class="atl-also" x="-19" y="-19" text-anchor="end">×${d.variants.length}</text>` : ''}
                <text class="atl-label" y="38">${escapeHtml(d.name.length > 26 ? d.name.slice(0, 25) + '…' : d.name)}</text>
                ${sublabel ? `<text class="atl-sublabel" y="52">${escapeHtml(sublabel.length > 40 ? sublabel.slice(0, 39) + '…' : sublabel)}</text>` : ''}
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

    // Selection lives entirely on pointerdown/pointerup — the PRESSED element decides.
    // A separate `click` listener is a trap here: after pointer capture, or with the few
    // pixels of jitter a real mouse adds, the browser retargets the follow-up click to
    // the svg itself, which used to clear the selection the same gesture had just made
    // (the inspector filled and emptied in one instant — "clicking has no effect").
    bind() {
        let press = null;
        this.svg.addEventListener('pointerdown', (ev) => {
            const g = ev.target.closest('[data-node]');
            press = {
                n: g ? this.byId.get(g.dataset.node) : null,
                target: ev.target,
                moved: false,
                startX: ev.clientX,
                startY: ev.clientY,
            };
            try { this.svg.setPointerCapture(ev.pointerId); } catch { /* synthetic pointers */ }
        });
        this.svg.addEventListener('pointermove', (ev) => {
            if (!press?.n) return;
            // A click is not a drag until the pointer has really traveled — mice emit
            // same-spot moves that would otherwise eat every selection.
            if (!press.moved && Math.hypot(ev.clientX - press.startX, ev.clientY - press.startY) < 4) return;
            const pt = this.toGraph(ev);
            press.n.x = pt.x; press.n.y = pt.y;
            press.n.pinned = true;
            press.moved = true;
            this.positionElements();
        });
        this.svg.addEventListener('pointerup', () => {
            if (!press) return;
            const { n, target, moved } = press;
            press = null;
            if (n) {
                if (moved) this.persistPositions();
                else {
                    this.setSelected({ type: 'node', id: n.dto.id });
                    this.onSelect({ type: 'node', item: n.dto });
                }
                return;
            }
            const line = target.closest('[data-edge]');
            if (line) {
                this.setSelected({ type: 'edge', index: Number(line.dataset.edge) });
                this.onSelect({ type: 'edge', item: this.graph.edges[Number(line.dataset.edge)] });
            } else {
                this.setSelected(null);
                this.onSelect(null);
            }
        });
        this.svg.addEventListener('pointercancel', () => { press = null; });
    }

    toGraph(ev) {
        const rect = this.svg.getBoundingClientRect();
        const scale = Math.min(rect.width / W, rect.height / H);
        const ox = (rect.width - W * scale) / 2;
        const oy = (rect.height - H * scale) / 2;
        return {
            x: Math.min(W - 48, Math.max(48, (ev.clientX - rect.left - ox) / scale)),
            y: Math.min(H - 64, Math.max(48, (ev.clientY - rect.top - oy) / scale)),
        };
    }
}
