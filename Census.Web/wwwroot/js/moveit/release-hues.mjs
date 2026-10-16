// The calendar's colour axis (move-it.md §21.2): a hue per release, so the same work effort
// reads as the same colour across the days it moved. Hues are handed out per shown month, to
// the releases with entries in it, busiest first, until the palette runs out; the rest, and
// builds no release claims, are neutral. The calendar is the one page that colours by release
// rather than by stage (stage-hues.mjs): it answers "what happened to this work", not "what
// is at this stage".

export const NEUTRAL_HUE = '#8e96a3';

export const DEFAULT_RELEASE_HUES = ['#0072b2', '#009e73', '#9467bd', '#cc79a7', '#56b4e9', '#8a7d00', '#1b7f79', '#b5651d'];

// entries: the month's entries ({ ReleaseId, Release, ApplicationId, day }), already narrowed
// to the applications shown but not to a stage, so changing the stage never recolours.
// Returns [{ releaseId, release, applicationId, hue, entries }] busiest first, every release
// present; hue is null past the palette.
export function assignReleaseHues(entries, palette = DEFAULT_RELEASE_HUES) {
    const byRelease = new Map();
    for (const e of entries) {
        if (e.ReleaseId == null) continue;
        if (!byRelease.has(e.ReleaseId)) byRelease.set(e.ReleaseId, { releaseId: e.ReleaseId, release: e.Release, applicationId: e.ApplicationId, entries: 0, first: e.day });
        const r = byRelease.get(e.ReleaseId);
        r.entries += 1;
        if (e.day < r.first) r.first = e.day;
    }
    return [...byRelease.values()]
        .sort((a, b) => b.entries - a.entries || a.first.localeCompare(b.first) || String(a.release).localeCompare(String(b.release)))
        .map((r, n) => ({ ...r, hue: n < palette.length ? palette[n] : null }));
}

export function hueOf(assigned, releaseId) {
    return assigned.find((r) => r.releaseId === releaseId)?.hue ?? NEUTRAL_HUE;
}
