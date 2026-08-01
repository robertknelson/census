// Hand-drawn machine silhouettes — the estate's signature element. Shape encodes class;
// color never does (color is reserved for status). 24x24 viewBox, 1.5px line work.

const GLYPH_PATHS = {
    DatabaseServer: `
        <ellipse cx="12" cy="5.5" rx="7" ry="2.8"/>
        <path d="M5 5.5v13c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8v-13"/>
        <path d="M5 12c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8"/>`,
    WebServer: `
        <circle cx="12" cy="12" r="8.2"/>
        <ellipse cx="12" cy="12" rx="3.6" ry="8.2"/>
        <path d="M4.3 9.2h15.4M4.3 14.8h15.4"/>`,
    DevServer: `
        <rect x="4" y="4.5" width="16" height="15" rx="1.8"/>
        <path d="M4 9.5h16M4 14.5h16"/>
        <circle cx="6.6" cy="7" r="0.45" fill="currentColor" stroke="none"/>
        <circle cx="6.6" cy="12" r="0.45" fill="currentColor" stroke="none"/>
        <path d="M10.4 15.9l-1.7 1.35 1.7 1.35M13.6 15.9l1.7 1.35-1.7 1.35"/>`,
    DevLaptop: `
        <rect x="5" y="5" width="14" height="9.5" rx="1.2"/>
        <path d="M3 18.5h18l-1.8-3.2H4.8z"/>
        <path d="M10.2 7.9L8.5 9.35l1.7 1.45M13.8 7.9l1.7 1.45-1.7 1.45"/>`,
    Unclassified: `
        <rect x="4.5" y="4.5" width="15" height="15" rx="1.8" stroke-dasharray="2.6 2.2"/>
        <path d="M9.9 10a2.2 2.2 0 1 1 3.2 2c-.75.42-1.05.95-1.05 1.8"/>
        <path d="M12.05 16.3v.15"/>`,
};

export function glyphSvg(cls, sizePx) {
    const paths = GLYPH_PATHS[cls] ?? GLYPH_PATHS.Unclassified;
    return `<svg class="est-glyph" width="${sizePx}" height="${sizePx}" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export const GLYPH_CLASSES = Object.keys(GLYPH_PATHS);
