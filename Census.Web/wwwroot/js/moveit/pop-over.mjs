// A float-over behind a small button in a page's header line (move-it.md §26): what a page
// needs to say but should not spend a band of the screen on — the Calendar's key, History's
// "needs a word", Division's coverage, the notebook's line. Closes on Escape or a click
// elsewhere; the button carries the one fact worth seeing while it is closed.
export class PopOver {
    constructor({ id, align = 'right', wide = false } = {}) {
        this.id = id;
        this.align = align;
        this.wide = wide;
    }

    html() {
        return `
            <div class="mi-pop">
                <button type="button" class="mi-pop-button" data-pop-button aria-expanded="false" aria-controls="${this.id}"></button>
                <div class="mi-pop-panel ${this.align === 'left' ? 'is-left' : ''} ${this.wide ? 'is-wide' : ''}" id="${this.id}" data-pop-panel hidden></div>
            </div>`;
    }

    mount(root) {
        this.panel = root.querySelector(`#${this.id}`);
        this.box = this.panel.parentElement;
        this.button = this.box.querySelector('[data-pop-button]');
        this.button.addEventListener('click', () => this.show(this.panel.hidden));
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.box.contains(e.target)) this.show(false);
        });
        // Registered before the page's own Escape handling, so an open float-over takes the
        // key and the page's drawer stays put.
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !this.isOpen) return;
            this.show(false);
            e.stopImmediatePropagation();
        });
        return this;
    }

    get isOpen() {
        return !this.panel.hidden;
    }

    show(on) {
        this.panel.hidden = !on;
        this.button.setAttribute('aria-expanded', String(on));
    }

    setButton(html, tone = '') {
        this.button.innerHTML = html;
        this.button.className = `mi-pop-button ${tone}`;
    }

    setBody(html) {
        this.panel.innerHTML = html;
    }

    hide(hidden) {
        this.box.hidden = hidden;
        if (hidden) this.show(false);
    }
}
