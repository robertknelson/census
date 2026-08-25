// Deterministic stage → color. Well-known stage names (and their aliases) pin to
// distinct slots of a curated, color-blind-distinguishable palette — a pure hash put
// dev, val and prod in the same slot, which is exactly the set that must never
// collide. Unknown names fall back to an FNV hash. Same stage, same color, every
// view, every browser — nothing stored, no reshuffle when a new stage appears.
// Presentation only: a color assignment is not a classification (no-naming law safe).

const PALETTE = ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#d55e00', '#56b4e9', '#8a7d00', '#9467bd'];

const PINNED = {
    dev: 0, development: 0,
    test: 1, tst: 1,
    val: 2, validation: 2,
    qa: 3,
    prod: 4, prd: 4, production: 4,
    uat: 5,
    ref: 6, reference: 6,
    staging: 7, stage: 7, stg: 7,
};

export function stageColor(stage) {
    const text = String(stage ?? '').toLowerCase();
    if (text in PINNED) return PALETTE[PINNED[text]];
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return PALETTE[(h >>> 0) % PALETTE.length];
}
