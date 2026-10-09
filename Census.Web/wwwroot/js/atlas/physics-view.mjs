// The v1 view strategy (system-view.md §4): a hand-rolled spring/repulsion simulation
// that settles and FREEZES — physics arranges, it never jiggles. Positions are seeded
// from a stable hash of node identity (the same graph settles the same way twice) and
// dragged/settled positions persist per tab, so a view reopens exactly as last seen.
// A strategy owns layout and drawing only; honesty rules (ghost-never-hide, dashed
// declared seam, unclassified shown) arrive via the node/edge state the page computes.

import { stageColor } from './stage-colors.mjs';

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

export function nodeShape(n) {
    if (n.service) return 'capsule';
    if (n.kind === 'database') return 'cylinder';
    if (n.kind === 'application') return 'globe';
    if (n.kind === 'endpoint') return 'dot';
    if (n.external) return 'cloud';
    return 'diamond';
}

// The common-understanding vocabulary (his 2026-08-25 ruling, and §4's promise of
// consistency with the Estate glyphs): database = cylinder, application/website =
// globe, external = cloud; diamond stays the neutral "declared kind" (free-form kinds
// can't each be honest as a pictogram), dot stays the unresolved endpoint. The
// silhouette (.atl-shape) is closed and fillable so the state vocabulary — member
// fill, declared dash, phantom dotted, canonical weight — survives; interior line
// work (.atl-detail) tints with the state but never fights the fill. Exported so the
// key renders from this exact code and cannot drift.
export function shapeSvg(shape, r) {
    switch (shape) {
        case 'cylinder': {
            const rx = (r * 0.82).toFixed(1), ry = (r * 0.32).toFixed(1), h = (r * 0.52).toFixed(1);
            return `<path class="atl-shape" d="M ${-rx} ${-h} A ${rx} ${ry} 0 0 1 ${rx} ${-h} V ${h} A ${rx} ${ry} 0 0 1 ${-rx} ${h} Z"></path>
                <path class="atl-detail" d="M ${-rx} ${-h} A ${rx} ${ry} 0 0 0 ${rx} ${-h}"></path>`;
        }
        case 'globe': {
            const cr = r * 0.9;
            const y = cr * 0.48, cx = Math.sqrt(cr * cr - y * y).toFixed(1);
            return `<circle class="atl-shape" r="${cr.toFixed(1)}"></circle>
                <ellipse class="atl-detail" rx="${(cr * 0.45).toFixed(1)}" ry="${cr.toFixed(1)}"></ellipse>
                <path class="atl-detail" d="M ${(-cr).toFixed(1)} 0 H ${cr.toFixed(1)} M ${-cx} ${(-y).toFixed(1)} H ${cx} M ${-cx} ${y.toFixed(1)} H ${cx}"></path>`;
        }
        case 'cloud': {
            const s = (r / 21).toFixed(3);
            return `<path class="atl-shape" transform="scale(${s})" d="M -14 9 A 8.5 8.5 0 0 1 -12.5 -7.5 A 11.5 11.5 0 0 1 9 -9.5 A 8.5 8.5 0 0 1 14.5 9 Z"></path>`;
        }
        case 'dot': return `<circle class="atl-shape" r="${(r * 0.45).toFixed(1)}"></circle>`;
        // A cross-cutting system's members folded per stage (cross-cutting-systems.md §4): a wide
        // capsule, so it reads as a service rather than as one more peer of the members.
        case 'capsule': return `<rect class="atl-shape" x="${(-r * 1.6).toFixed(1)}" y="${(-r * 0.55).toFixed(1)}" width="${(r * 3.2).toFixed(1)}" height="${(r * 1.1).toFixed(1)}" rx="${(r * 0.55).toFixed(1)}"></rect>
            <path class="atl-detail" d="M ${(-r * 0.9).toFixed(1)} 0 H ${(r * 0.9).toFixed(1)}"></path>`;
        // The browser tier's glyph (layered-view.md §2) — his triangle; drawn by the layered
        // strategy above a web/spa app, and by the key.
        case 'triangle': return `<path class="atl-shape" d="M 0 ${-r * 0.85} L ${r * 0.95} ${r * 0.7} L ${-r * 0.95} ${r * 0.7} Z"></path>`;
        default: return `<rect class="atl-shape" x="${-r * 0.8}" y="${-r * 0.8}" width="${r * 1.6}" height="${r * 1.6}" transform="rotate(45)"></rect>`;
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
        // The ends of every unaccepted crossing — what the toolbar's lift keeps at full.
        this.crossingEnds = new Set(graph.edges.filter((e) => e.crossing && !e.accepted).flatMap((e) => [e.sourceId, e.targetId]));
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

    /// Lift the crossing edges and their ends; everything else recedes to the ghost level.
    /// Transient — any press on the graph clears it (stage-crossings.md §3.2).
    setLift(on) {
        if (!this.svg) return;
        this.svg.classList.toggle('is-lifting', on);
    }

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
            // A crossing (stage-crossings.md §3.2) draws distinctly on every tab regardless of
            // the filter and never recedes past the bleed level; verdict and crossing are
            // independent axes, so the verdict's dash survives underneath.
            const crossing = !e.crossing ? ''
                : e.accepted ? ' atl-edge-crossing atl-edge-accepted'
                : e.crossingBasis === 'derived' ? ' atl-edge-crossing atl-edge-derived'
                : ' atl-edge-crossing';
            const fade = sf === 'ghost' && tf === 'ghost' ? (e.crossing ? ' atl-edge-bleed' : ' atl-edge-ghost')
                : sf === 'ghost' || tf === 'ghost' ? ' atl-edge-bleed' : '';
            return `
            <line data-edge="${i}" class="atl-edge atl-edge-${escapeHtml(e.verdict)} atl-edgekind-${escapeHtml(e.kind)}${crossing}${fade}"></line>`;
        }).join('');
        // A rendered edge is barely over a CSS pixel wide once the viewBox scales down —
        // an invisible fat twin under the nodes gives every connection a real hit target.
        // Same data-edge index, so positionElements moves both and selection resolves the
        // visible line first (it precedes the twin in document order).
        const edgeHitSvg = this.graph.edges.map((e, i) => `
            <line data-edge="${i}" class="atl-edge-hit"></line>`).join('');
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
                this.crossingEnds.has(d.id) ? 'atl-crossing-end' : '',
                focus === 'ghost' ? 'atl-ghost' : '',
            ].filter(Boolean).join(' ');
            // A canonical node's sublabel is its distinct hosts — the clean-view line
            // ("MyWeb / WebDev, WebVal, WebProd") drawn under the canonical name.
            const sublabel = d.machine ?? ((d.hosts ?? []).length ? d.hosts.join(', ') : null);
            // Stage dots (ratified 2026-08-25): one colored dot per stage this node's
            // claim on the viewed system asserts — stage reads at a glance without a
            // filter. Color is a dedicated channel; fill stays state, edges stay verdict.
            const stages = [...new Set(d.serves
                .filter((a) => a.system && a.system.toLowerCase() === this.graph.system.toLowerCase())
                .flatMap((a) => a.stages.map((s) => s.toLowerCase())))];
            const stageDots = stages.map((s, si) => `
                <circle class="atl-stage-dot" cx="${((si - (stages.length - 1) / 2) * 9).toFixed(1)}" cy="26" r="3.4" fill="${stageColor(s)}"><title>${escapeHtml(s)}</title></circle>`).join('');
            return `
            <g data-node="${escapeHtml(d.id)}" class="${classes}">
                ${shapeSvg(nodeShape(d), 21)}
                ${stageDots}
                ${alsoServes > 0 ? `<text class="atl-also" x="19" y="-19">+${alsoServes}</text>` : ''}
                ${d.canonical || d.service ? `<text class="atl-also" x="-19" y="-19" text-anchor="end">×${d.variants.length}</text>` : ''}
                <text class="atl-label" y="38">${escapeHtml(d.name.length > 26 ? d.name.slice(0, 25) + '…' : d.name)}</text>
                ${sublabel ? `<text class="atl-sublabel" y="52">${escapeHtml(sublabel.length > 40 ? sublabel.slice(0, 39) + '…' : sublabel)}</text>` : ''}
            </g>`;
        }).join('');

        this.host.innerHTML = `
            <svg class="atl-svg ${this.state.focus.size ? 'is-filtered' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
                <g>${edgeSvg}</g>
                <g>${edgeHitSvg}</g>
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
            if (this.svg.classList.contains('is-lifting')) {
                this.svg.classList.remove('is-lifting');
                this.onLiftCleared?.();
            }
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
