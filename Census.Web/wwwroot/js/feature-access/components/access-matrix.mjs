import { escapeHtml, CHECK_ICON } from '../utils/dom.mjs';

const MOVES = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    Home: [0, -Infinity],
    End: [0, Infinity]
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Features × roles grid. Column 0 opens the feature, column 1 is the on/off switch, columns 2+ are role grants.
// Keyboard: one tab stop; arrow keys, Home and End move between cells. The headers sort and are tab stops of their own.
export class AccessMatrix {
    #host;
    #handlers;
    #focus = { row: 0, col: 0 };
    #hoverCol = null;

    constructor(host, handlers) {
        this.#host = host;
        this.#handlers = handlers;
        host.addEventListener('click', event => this.#onClick(event));
        host.addEventListener('keydown', event => this.#onKeydown(event));
        host.addEventListener('focusin', event => this.#onFocusIn(event));
        host.addEventListener('pointerover', event => this.#onPointerOver(event));
        host.addEventListener('pointerleave', () => this.#setHoverColumn(null));
    }

    render({ features, roles, sort, pending, gatedNames, selectedId, loading, error, emptyMessage }) {
        const hadFocus = this.#host.contains(document.activeElement);
        this.#hoverCol = null;

        if (loading) {
            this.#host.innerHTML = this.#skeleton(roles.length || 4);
            return;
        }
        if (error) {
            this.#host.innerHTML = `
                <div class="fa-empty fa-empty--error" role="alert">
                    <p>${escapeHtml(error)}</p>
                    <button type="button" class="fa-button" data-action="retry">Try again</button>
                </div>`;
            return;
        }
        if (features.length === 0) {
            this.#host.innerHTML = `<div class="fa-empty"><p>${escapeHtml(emptyMessage)}</p></div>`;
            return;
        }

        this.#focus.row = clamp(this.#focus.row, 0, features.length - 1);
        this.#focus.col = clamp(this.#focus.col, 0, roles.length + 1);

        const ariaSort = key => (sort.key === key ? `aria-sort="${sort.descending ? 'descending' : 'ascending'}"` : '');
        const sorter = (key, label, title) => `
            <button type="button" class="fa-sort" data-action="sort" data-sort="${escapeHtml(key)}" title="${escapeHtml(title)}">
                <span>${escapeHtml(label)}</span><span class="fa-sort-mark" aria-hidden="true"></span>
            </button>`;
        const roleHeaders = roles
            .map((role, index) => {
                const key = `role:${role.toLowerCase()}`;
                return `<th scope="col" class="fa-col-role" data-col="${index + 2}" ${ariaSort(key)}>${sorter(key, role, `Sort by what ${role} is granted`)}</th>`;
            })
            .join('');
        const rows = features
            .map((feature, rowIndex) => this.#row(feature, rowIndex, roles, pending, gatedNames, selectedId))
            .join('');

        this.#host.innerHTML = `
            <div class="fa-matrix-scroll">
                <table class="fa-matrix">
                    <thead>
                        <tr>
                            <th scope="col" class="fa-col-feature" ${ariaSort('name')}>${sorter('name', 'Feature', 'Sort by feature name')}</th>
                            <th scope="col" class="fa-col-on" data-col="1" ${ariaSort('on')}>${sorter('on', 'On', 'Sort by on or off')}</th>
                            ${roleHeaders}
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;

        if (hadFocus) {
            this.focusCurrent();
        }
    }

    focusCurrent() {
        this.#focusCell(this.#focus.row, this.#focus.col);
    }

    #row(feature, rowIndex, roles, pending, gatedNames, selectedId) {
        const id = feature.featureId;
        const granted = new Set(feature.roles.map(role => role.roleName.toLowerCase()));
        const voided = feature.isVoided;
        const name = escapeHtml(feature.displayName);
        const tabindex = col => (rowIndex === this.#focus.row && col === this.#focus.col ? '0' : '-1');
        const nav = col => `data-row="${rowIndex}" data-col="${col}" tabindex="${tabindex(col)}"`;
        const rowClasses = [
            'fa-row',
            feature.isEnabled ? 'is-on' : 'is-off',
            voided ? 'is-voided' : '',
            id === selectedId ? 'is-selected' : ''
        ].filter(Boolean).join(' ');

        let tag = '';
        if (voided) {
            tag = '<span class="fa-tag fa-tag--void">Voided</span>';
        } else if (gatedNames && !gatedNames.has(feature.name.toLowerCase())) {
            tag = '<span class="fa-tag" title="No [FeatureGate] in this app uses this name. It may still be checked in views or JavaScript.">No gate</span>';
        }

        const cells = roles.map((role, index) => {
            const col = index + 2;
            const isGranted = granted.has(role.toLowerCase());
            const busy = pending.has(`${id}:role:${role.toLowerCase()}`);
            const label = `${role} ${isGranted ? 'can' : 'cannot'} use ${feature.displayName}`;
            return `
                <td class="fa-cell" data-col="${col}">
                    <button type="button" class="fa-grant${isGranted ? ' is-granted' : ''}${busy ? ' is-pending' : ''}"
                        role="switch" aria-checked="${isGranted}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"
                        data-action="role" data-role="${escapeHtml(role)}" ${nav(col)} ${voided ? 'disabled' : ''}>${CHECK_ICON}</button>
                </td>`;
        }).join('');

        const enabledBusy = pending.has(`${id}:enabled`);
        return `
            <tr class="${rowClasses}" data-id="${id}">
                <th scope="row" class="fa-col-feature">
                    <div class="fa-feature-cell">
                        <button type="button" class="fa-feature" data-action="open" ${nav(0)}>
                            <span class="fa-feature-name">${name}</span>
                            <code class="fa-feature-key">${escapeHtml(feature.name)}</code>
                        </button>
                        ${tag}
                    </div>
                </th>
                <td class="fa-col-on" data-col="1">
                    <button type="button" class="fa-switch${enabledBusy ? ' is-pending' : ''}" role="switch"
                        aria-checked="${feature.isEnabled}" aria-label="${name} is on"
                        data-action="enabled" ${nav(1)} ${voided ? 'disabled' : ''}><span class="fa-switch-thumb"></span></button>
                </td>
                ${cells}
            </tr>`;
    }

    #skeleton(columns) {
        const row = `<tr>${'<td><span class="fa-skeleton"></span></td>'.repeat(columns + 2)}</tr>`;
        return `
            <div class="fa-matrix-scroll" aria-busy="true" aria-label="Loading features">
                <table class="fa-matrix fa-matrix--loading"><tbody>${row.repeat(4)}</tbody></table>
            </div>`;
    }

    #onClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button || !this.#host.contains(button)) return;

        if (button.dataset.action === 'retry') {
            this.#handlers.onRetry();
            return;
        }
        if (button.dataset.action === 'sort') {
            this.#handlers.onSort(button.dataset.sort);
            return;
        }

        this.#focus = { row: Number(button.dataset.row), col: Number(button.dataset.col) };
        if (button.classList.contains('is-pending')) return;

        const featureId = Number(button.closest('tr').dataset.id);
        switch (button.dataset.action) {
            case 'open':
                this.#handlers.onOpen(featureId);
                break;
            case 'enabled':
                this.#handlers.onToggleEnabled(featureId);
                break;
            case 'role':
                this.#handlers.onToggleRole(featureId, button.dataset.role);
                break;
        }
    }

    #onKeydown(event) {
        const move = MOVES[event.key];
        const button = event.target.closest('button[data-row]');
        if (!move || !button) return;

        event.preventDefault();
        const rowCount = this.#host.querySelectorAll('tbody tr').length;
        const colCount = this.#host.querySelectorAll('thead th').length;
        this.#focusCell(
            clamp(Number(button.dataset.row) + move[0], 0, rowCount - 1),
            clamp(Number(button.dataset.col) + move[1], 0, colCount - 1));
    }

    #onFocusIn(event) {
        const button = event.target.closest('button[data-row]');
        if (!button) return;
        this.#focus = { row: Number(button.dataset.row), col: Number(button.dataset.col) };
        this.#host.querySelectorAll('button[data-row][tabindex="0"]').forEach(other => { other.tabIndex = -1; });
        button.tabIndex = 0;
    }

    #focusCell(row, col) {
        const target = this.#host.querySelector(`button[data-row="${row}"][data-col="${col}"]`);
        if (!target) return;
        this.#focus = { row, col };
        target.focus();
    }

    #onPointerOver(event) {
        const cell = event.target.closest('td[data-col], th[data-col]');
        this.#setHoverColumn(cell && Number(cell.dataset.col) >= 2 ? cell.dataset.col : null);
    }

    #setHoverColumn(col) {
        if (this.#hoverCol === col) return;
        this.#hoverCol = col;
        this.#host.querySelectorAll('.is-col-hover').forEach(element => element.classList.remove('is-col-hover'));
        if (col !== null) {
            this.#host.querySelectorAll(`[data-col="${col}"]:is(td, th)`).forEach(element => element.classList.add('is-col-hover'));
        }
    }
}
