// Inline SVG icons for the explorer's controls: recognisable at a glance, currentColor so they follow the theme.
const svg = paths => `<svg class="logx-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${paths}</svg>`;

export const ICONS = {
    search: svg('<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    clear: svg('<path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    fields: svg('<path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="4" r="1.6" fill="currentColor"/><circle cx="11" cy="8" r="1.6" fill="currentColor"/><circle cx="5" cy="12" r="1.6" fill="currentColor"/>'),
    previous: svg('<path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    next: svg('<path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    copy: svg('<rect x="5" y="5" width="8" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 11V3.2A1.2 1.2 0 0 1 4.2 2H10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
    calendar: svg('<rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 6.5h12M5 2v2.5M11 2v2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
    pivot: svg('<path d="M3 8h8M8 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>')
};
