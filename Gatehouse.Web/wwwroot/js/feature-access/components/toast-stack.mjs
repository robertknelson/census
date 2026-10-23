import { CLOSE_ICON } from '../utils/dom.mjs';

const MAX_TOASTS = 4;

export class ToastStack {
    #host;

    constructor(host) {
        this.#host = host;
    }

    show(message, { tone = 'info', duration = 4500 } = {}) {
        const toast = document.createElement('div');
        toast.className = `fa-toast fa-toast--${tone}`;
        toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');

        const text = document.createElement('p');
        text.textContent = message;

        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'fa-toast-dismiss';
        dismiss.setAttribute('aria-label', 'Dismiss');
        dismiss.innerHTML = CLOSE_ICON;

        toast.append(text, dismiss);
        this.#host.append(toast);
        requestAnimationFrame(() => toast.classList.add('is-shown'));

        const remove = () => {
            toast.classList.remove('is-shown');
            setTimeout(() => toast.remove(), 200);
        };
        const lifetime = tone === 'error' ? duration * 2 : duration;
        let timer = setTimeout(remove, lifetime);

        toast.addEventListener('pointerenter', () => clearTimeout(timer));
        toast.addEventListener('pointerleave', () => { timer = setTimeout(remove, 1500); });
        dismiss.addEventListener('click', remove);

        while (this.#host.children.length > MAX_TOASTS) {
            this.#host.firstElementChild.remove();
        }
    }
}
