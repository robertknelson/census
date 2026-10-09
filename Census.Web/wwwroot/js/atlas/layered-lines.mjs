// The lines of the layered register (layered-view.md §10.3), as pure functions so they can
// be pinned under node like the placement: which edges share a line, where a line leaves a
// card, and the path it takes — straight within a plane, routed under the bands between
// planes. The view draws what these return; nothing here touches the DOM.

/// Edges grouped by their two ends, in first-seen order. endpoints(edge) is the placement's:
/// the two instances a line joins, or null when an end is not drawn.
export function pairEdges(edges, endpoints) {
    const groups = new Map();
    edges.forEach((e, i) => {
        const ends = endpoints(e);
        if (!ends) return;
        const key = `${e.sourceId}\u0000${e.targetId}`;
        if (!groups.has(key)) groups.set(key, { sourceId: e.sourceId, targetId: e.targetId, ends, edges: [], indexes: [] });
        groups.get(key).edges.push(e);
        groups.get(key).indexes.push(i);
    });
    return [...groups.values()];
}

/// The classes a pair's line wears: the verdict that sorts first (confirmed before
/// contradicted before unresolved, alphabetically — the same order the canonical merge
/// keeps), and the loudest crossing: an unaccepted one over an accepted one over none.
export function loudest(edges) {
    const verdict = edges.map((e) => e.verdict).filter(Boolean).sort()[0] ?? edges[0]?.verdict ?? null;
    const crossing = edges.find((e) => e.crossing && !e.accepted) ?? edges.find((e) => e.crossing) ?? null;
    return { verdict, crossing };
}

/// Where a line leaves a card centred at c (w × h), heading toward t: the midpoint of the
/// side facing t — bottom or top when t is clear of the card vertically, else left or right.
export function port(c, size, t) {
    if (t.y > c.y + size.h / 2) return { x: c.x, y: c.y + size.h / 2 };
    if (t.y < c.y - size.h / 2) return { x: c.x, y: c.y - size.h / 2 };
    return t.x >= c.x ? { x: c.x + size.w / 2, y: c.y } : { x: c.x - size.w / 2, y: c.y };
}

/// The path between two cards. Same plane: a straight line edge to edge. Different planes:
/// down from the caller's bottom edge to routeY, along, up to the target's bottom edge, with
/// rounded corners of radius r — touching no plane in between. Returns the SVG path data,
/// the point for the ×n pill, and whether it was routed.
export function linePath(a, b, size, routeY, r = 10) {
    if (a.plane === b.plane) {
        const pa = port(a.centre, size, b.centre), pb = port(b.centre, size, a.centre);
        return { d: `M ${pa.x} ${pa.y} L ${pb.x} ${pb.y}`, mid: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, routed: false };
    }
    const pa = { x: a.centre.x, y: a.centre.y + size.h / 2 };
    const pb = { x: b.centre.x, y: b.centre.y + size.h / 2 };
    const dir = pb.x > pa.x ? 1 : -1;
    const d = `M ${pa.x} ${pa.y} V ${routeY - r} Q ${pa.x} ${routeY} ${pa.x + dir * r} ${routeY} H ${pb.x - dir * r} Q ${pb.x} ${routeY} ${pb.x} ${routeY - r} V ${pb.y}`;
    return { d, mid: { x: (pa.x + pb.x) / 2, y: routeY }, routed: true };
}

/// The y of the k-th routing lane under the bands: lanes are `route` apart, the first a
/// half-lane below the last band.
export function laneY(bandsBottom, route, k) {
    return bandsBottom + route * (k + 1) - route / 2;
}
