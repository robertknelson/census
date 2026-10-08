// Placement for the layered strategies (layered-view.md §2): one pure function from the
// graph DTO to a grid — planes (one per stage, in the order the server gave), rows
// (browser, server, data, unplaced), slots (the same column for the same thing on every
// plane), and a side strip per plane for downstream services. Drawing is not here: the 2D
// view lays the planes side by side, the 3D view stacks them in depth, both from this.

export const ROWS = ['browser', 'server', 'data', 'unplaced'];
export const UNSTAGED = '(unstaged)';

/// Rows an application's layer tag lands it in (layered-view.md §2). Anything not a
/// database and not tagged is unplaced; an unfamiliar tag value is server, badge shown.
export function rowOf(node, layer) {
    if (node.kind === 'database') return 'data';
    if (node.kind === 'application') return layer ? 'server' : 'unplaced';
    return 'server';        // declared kinds (a task), externals, endpoints: server-side things
}

export function drawsBrowser(layer) {
    return layer === 'web' || layer === 'spa';
}

export function place(graph) {
    const system = graph.system.toLowerCase();
    const claimOn = (n) => n.serves.filter((a) => (a.system ?? '').toLowerCase() === system);
    const anyClaim = (n) => n.serves;

    // The plane a node sits on: a member by its claim on this system, anyone else by every
    // claim they carry; nothing staged means the unstaged plane. A node serving two stages
    // appears on both — it IS present at both — in the same slot.
    const stagesOf = (n) => {
        const claims = n.member ? claimOn(n) : anyClaim(n);
        const stages = [...new Set(claims.flatMap((a) => a.stages).map((s) => s.toLowerCase()))];
        return stages.length ? stages : [UNSTAGED];
    };
    const layerOf = (n) => (n.member ? claimOn(n) : anyClaim(n)).map((a) => a.layer).find((l) => l) ?? null;
    const slotKeyOf = (n) => {
        const canonical = claimOn(n).map((a) => a.canonicalName).find((c) => c);
        return (canonical ?? n.name).toLowerCase();
    };

    // Planes: the server's stage order for the members, then any other stage a neighbor
    // brings (alphabetical), then unstaged — shown, never dropped.
    const known = graph.stages.map((s) => s.toLowerCase());
    const extra = new Set();
    for (const n of graph.nodes) for (const s of stagesOf(n)) if (s !== UNSTAGED && !known.includes(s)) extra.add(s);
    // A plane nobody stands on is not drawn — an empty unstaged plane says nothing.
    const used = new Set(graph.nodes.flatMap(stagesOf));
    const planeOrder = [...known, ...[...extra].sort(), UNSTAGED].filter((s) => used.has(s));
    const planes = planeOrder.map((stage) => ({ stage }));
    const planeIndex = new Map(planeOrder.map((s, i) => [s, i]));

    // Slots: per row, per region (main or side), the sorted set of slot keys across every
    // plane — so MyDB is column 3 on dev, val and prod alike.
    const keys = { main: {}, side: {} };
    const instances = [];
    for (const n of graph.nodes) {
        const layer = layerOf(n);
        const row = rowOf(n, layer);
        const region = n.member ? 'main' : 'side';
        const key = slotKeyOf(n);
        (keys[region][row] ??= new Set()).add(key);
        for (const stage of stagesOf(n)) {
            instances.push({
                nodeId: n.id, node: n, plane: planeIndex.get(stage), stage, row, region, key, layer,
                browser: n.kind === 'application' && drawsBrowser(layer),
                unobservedCalls: layer === 'spa',
            });
        }
    }
    const slots = { main: {}, side: {} };
    for (const region of ['main', 'side']) {
        for (const row of ROWS) {
            const sorted = [...(keys[region][row] ?? [])].sort();
            slots[region][row] = new Map(sorted.map((k, i) => [k, i]));
        }
    }
    for (const inst of instances) inst.slot = slots[inst.region][inst.row].get(inst.key);

    const width = (region, row) => slots[region][row].size;
    const rowsInUse = ROWS.filter((row) => instances.some((i) => i.row === row) || row !== 'unplaced');
    return {
        planes,
        instances,
        rows: rowsInUse,
        mainWidth: Math.max(1, ...ROWS.map((r) => width('main', r))),
        sideWidth: Math.max(0, ...ROWS.map((r) => width('side', r))),
        // Which instance an edge end lands on: the shared plane when the two ends have one
        // (the normal case), else each end's first plane — a crossing then visibly spans planes.
        endpoints(edge) {
            const src = instances.filter((i) => i.nodeId === edge.sourceId);
            const dst = instances.filter((i) => i.nodeId === edge.targetId);
            if (!src.length || !dst.length) return null;
            for (const s of src) {
                const d = dst.find((x) => x.plane === s.plane);
                if (d) return [s, d];
            }
            const first = (list) => list.reduce((a, b) => (b.plane < a.plane ? b : a));
            return [first(src), first(dst)];
        },
    };
}
