import { escapeHtml, CLOSE_ICON } from '../utils/dom.mjs';
import { relativeTime, formatDateTime } from '../utils/time.mjs';
import { describeAuditEntry, shortLocation, suggestDisplayName } from '../utils/format.mjs';

const NAME_PATTERN = /^[a-z0-9]+([.-][a-z0-9]+)*$/;
const NAME_WHILE_TYPING = /^[a-z0-9]+([.-][a-z0-9]*)*$/;
const FOCUSABLE = 'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])';

function focusSelector(element) {
    if (element.dataset.role) {
        return `[data-action="${element.dataset.action}"][data-role="${CSS.escape(element.dataset.role)}"]`;
    }
    if (element.dataset.action) {
        return `[data-action="${element.dataset.action}"]`;
    }
    return element.name ? `[name="${element.name}"]` : null;
}

// Slide-over panel with two modes: feature detail (status, details, roles, enforcement, history) and create.
// Void is not offered (D13): no user retires a feature name from the page.
export class FeatureDrawer {
    #layer;
    #panel;
    #handlers;
    #mode = null;
    #feature = null;
    #roles = [];
    #gateLocations = [];
    #pending = new Set();
    #returnFocus = null;
    #displayTouched = false;

    constructor(host, handlers) {
        this.#handlers = handlers;
        host.innerHTML = `
            <div class="fa-drawer-layer">
                <div class="fa-drawer-backdrop" data-action="close"></div>
                <aside class="fa-drawer" role="dialog" aria-modal="true" aria-labelledby="fa-drawer-title"></aside>
            </div>`;
        this.#layer = host.querySelector('.fa-drawer-layer');
        this.#panel = host.querySelector('.fa-drawer');

        host.addEventListener('click', event => this.#onClick(event));
        host.addEventListener('change', event => this.#onChange(event));
        host.addEventListener('input', event => this.#onInput(event));
        host.addEventListener('submit', event => this.#onSubmit(event));
        host.addEventListener('keydown', event => this.#onKeydown(event));
    }

    get isOpen() {
        return this.#mode !== null;
    }

    get featureId() {
        return this.#mode === 'detail' ? this.#feature.featureId : null;
    }

    openDetail(feature, { roles, gateLocations, pending }) {
        this.#show();
        this.#mode = 'detail';
        this.#feature = feature;
        this.#roles = roles;
        this.#gateLocations = gateLocations;
        this.#pending = pending;

        this.#panel.innerHTML = `
            <header class="fa-drawer-head">
                <div>
                    <h2 id="fa-drawer-title" data-ref="title">${escapeHtml(feature.displayName)}</h2>
                    <code class="fa-feature-key">${escapeHtml(feature.name)}</code>
                </div>
                <button type="button" class="fa-icon-button" data-action="close" aria-label="Close">${CLOSE_ICON}</button>
            </header>
            <div class="fa-drawer-body">
                <section class="fa-section" data-ref="status"></section>
                <section class="fa-section" data-ref="details"></section>
                <section class="fa-section" data-ref="roles"></section>
                <section class="fa-section" data-ref="gate"></section>
                <section class="fa-section" data-ref="history"></section>
            </div>`;

        this.#renderStatus();
        this.#renderDetails();
        this.#renderRoles();
        this.#renderGate();
        this.setHistory(null);
        this.#panel.querySelector('[data-action="close"]').focus();
    }

    openCreate({ roles, name = '' }) {
        this.#show();
        this.#mode = 'create';
        this.#feature = null;
        this.#roles = roles;
        this.#displayTouched = false;

        const roleItems = roles.map(role => `
            <li>
                <label class="fa-check">
                    <input type="checkbox" name="roles" value="${escapeHtml(role)}">
                    <span class="fa-check-label">${escapeHtml(role)}</span>
                </label>
            </li>`).join('');

        this.#panel.innerHTML = `
            <header class="fa-drawer-head">
                <div>
                    <h2 id="fa-drawer-title">New feature</h2>
                    <p class="fa-muted">Define a name your code can gate on, then choose who can use it.</p>
                </div>
                <button type="button" class="fa-icon-button" data-action="close" aria-label="Close">${CLOSE_ICON}</button>
            </header>
            <form class="fa-drawer-form" data-form="create" novalidate>
                <div class="fa-drawer-body">
                    <section class="fa-section">
                        <label class="fa-field">
                            <span>Code name</span>
                            <input name="name" class="fa-input-code" autocomplete="off" spellcheck="false" maxlength="100"
                                value="${escapeHtml(name)}" aria-describedby="fa-name-hint fa-name-error">
                            <small class="fa-hint" id="fa-name-hint">The name used in <code>[FeatureGate("…")]</code>. Lowercase letters and numbers, separated by dots or hyphens. It can't be changed later.</small>
                            <small class="fa-field-error" id="fa-name-error" data-ref="name-error" hidden></small>
                        </label>
                        <label class="fa-field">
                            <span>Display name</span>
                            <input name="displayName" maxlength="150" autocomplete="off">
                        </label>
                        <label class="fa-field">
                            <span>Description</span>
                            <textarea name="description" rows="3" maxlength="1000"></textarea>
                            <small class="fa-hint">Optional. What the feature is, for the next person who manages it.</small>
                        </label>
                    </section>
                    <section class="fa-section">
                        <h3 class="fa-section-title">Who can use it</h3>
                        <ul class="fa-checks">${roleItems}</ul>
                    </section>
                    <section class="fa-section">
                        <label class="fa-check">
                            <input type="checkbox" name="isEnabled">
                            <span class="fa-check-label">Turn on when created</span>
                        </label>
                        <p class="fa-hint">Leave it off if you want to review the roles first.</p>
                    </section>
                </div>
                <footer class="fa-drawer-foot">
                    <p class="fa-form-error" data-ref="create-error" role="alert" hidden></p>
                    <div class="fa-actions">
                        <button type="submit" class="fa-button fa-button--primary">Create feature</button>
                        <button type="button" class="fa-button fa-button--quiet" data-action="close">Cancel</button>
                    </div>
                </footer>
            </form>`;

        const form = this.#form('create');
        if (name) {
            form.elements.displayName.value = suggestDisplayName(name);
            this.#validateName(form, false);
            form.elements.displayName.focus();
            form.elements.displayName.select();
        } else {
            form.elements.name.focus();
        }
    }

    update(feature) {
        if (this.featureId !== feature.featureId) return;
        const detailsDirty = this.#detailsDirty();

        this.#feature = feature;
        this.#ref('title').textContent = feature.displayName;
        this.#renderStatus();
        this.#renderRoles();
        if (!detailsDirty || feature.isVoided) this.#renderDetails();
    }

    setPending(pending) {
        this.#pending = pending;
        if (this.#mode === 'detail') {
            this.#renderStatus();
            this.#renderRoles();
        }
    }

    setGateLocations(locations) {
        this.#gateLocations = locations;
        if (this.#mode === 'detail') this.#renderGate();
    }

    setHistory(entries, error = null) {
        if (this.#mode !== 'detail') return;
        let body;
        if (error) {
            body = `<p class="fa-muted">History couldn't be loaded. ${escapeHtml(error)}</p>`;
        } else if (entries === null) {
            body = '<p class="fa-muted">Loading history…</p>';
        } else if (entries.length === 0) {
            body = '<p class="fa-muted">No recorded changes. Changes made directly in the database are not recorded here.</p>';
        } else {
            body = `<ol class="fa-timeline">${entries.map(entry => `
                <li class="fa-timeline-item fa-timeline-item--${entry.action.replace('.', '-')}">
                    <p>${escapeHtml(describeAuditEntry(entry))}</p>
                    <p class="fa-muted">${escapeHtml(entry.changedBy)}${entry.impersonatedBy ? ` (by ${escapeHtml(entry.impersonatedBy)})` : ''},
                        <time datetime="${escapeHtml(entry.changedAt)}" title="${escapeHtml(formatDateTime(entry.changedAt))}">${escapeHtml(relativeTime(entry.changedAt))}</time></p>
                </li>`).join('')}</ol>`;
        }
        this.#ref('history').innerHTML = `<h3 class="fa-section-title">History</h3>${body}`;
    }

    close() {
        if (!this.isOpen) return;
        this.#mode = null;
        this.#layer.classList.remove('is-open');
        const target = this.#returnFocus;
        this.#returnFocus = null;
        this.#handlers.onClose();
        if (target?.isConnected && target !== document.body) {
            target.focus();
        } else {
            this.#handlers.onReturnFocus();
        }
    }

    #show() {
        if (this.isOpen) return;
        this.#returnFocus = document.activeElement;
        this.#layer.classList.add('is-open');
    }

    #ref(name) {
        return this.#panel.querySelector(`[data-ref="${name}"]`);
    }

    #form(name) {
        return this.#panel.querySelector(`form[data-form="${name}"]`);
    }

    #rerender(ref, markup) {
        const section = this.#ref(ref);
        const active = section.contains(document.activeElement) ? document.activeElement : null;
        const selector = active ? focusSelector(active) : null;
        section.innerHTML = markup;
        if (selector) section.querySelector(selector)?.focus();
    }

    #renderStatus() {
        const feature = this.#feature;
        if (feature.isVoided) {
            this.#rerender('status', `
                <div class="fa-status fa-status--void">
                    <p class="fa-status-title">Voided</p>
                    <p>By ${escapeHtml(feature.voidedBy)}, <time datetime="${escapeHtml(feature.voidedAt)}" title="${escapeHtml(formatDateTime(feature.voidedAt))}">${escapeHtml(relativeTime(feature.voidedAt))}</time>: ${escapeHtml(feature.voidReason)}</p>
                    <p class="fa-muted">Anything gated by this name is locked for everyone. The name can be defined again as a new feature.</p>
                </div>`);
            return;
        }

        const busy = this.#pending.has(`${feature.featureId}:enabled`);
        this.#rerender('status', `
            <div class="fa-status">
                <button type="button" class="fa-switch${busy ? ' is-pending' : ''}" role="switch" aria-checked="${feature.isEnabled}"
                    aria-labelledby="fa-status-title" aria-describedby="fa-status-help" data-action="enabled"><span class="fa-switch-thumb"></span></button>
                <div>
                    <p class="fa-status-title" id="fa-status-title">${feature.isEnabled ? 'On' : 'Off'}</p>
                    <p class="fa-muted" id="fa-status-help">${feature.isEnabled
                        ? 'People with a granted role can use it.'
                        : 'Nobody can use it. Role grants are kept for when it is turned back on.'}</p>
                </div>
            </div>`);
    }

    #renderDetails() {
        const feature = this.#feature;
        if (feature.isVoided) {
            this.#ref('details').innerHTML = feature.description
                ? `<h3 class="fa-section-title">Description</h3><p>${escapeHtml(feature.description)}</p>`
                : '';
            return;
        }

        this.#ref('details').innerHTML = `
            <h3 class="fa-section-title">Details</h3>
            <form data-form="details" novalidate>
                <label class="fa-field">
                    <span>Display name</span>
                    <input name="displayName" maxlength="150" autocomplete="off" value="${escapeHtml(feature.displayName)}">
                </label>
                <label class="fa-field">
                    <span>Description</span>
                    <textarea name="description" rows="3" maxlength="1000">${escapeHtml(feature.description ?? '')}</textarea>
                </label>
                <p class="fa-form-error" data-ref="details-error" role="alert" hidden></p>
                <div class="fa-actions">
                    <button type="submit" class="fa-button fa-button--primary" disabled>Save changes</button>
                    <button type="button" class="fa-button fa-button--quiet" data-action="details-reset" hidden>Discard changes</button>
                </div>
                <p class="fa-muted fa-meta">Created by ${escapeHtml(feature.createdBy)} <time datetime="${escapeHtml(feature.createdAt)}" title="${escapeHtml(formatDateTime(feature.createdAt))}">${escapeHtml(relativeTime(feature.createdAt))}</time>${feature.modifiedBy
                    ? `. Last changed by ${escapeHtml(feature.modifiedBy)} <time datetime="${escapeHtml(feature.modifiedAt)}" title="${escapeHtml(formatDateTime(feature.modifiedAt))}">${escapeHtml(relativeTime(feature.modifiedAt))}</time>`
                    : ''}.</p>
            </form>`;
    }

    #renderRoles() {
        const feature = this.#feature;
        const catalog = new Set(this.#roles.map(role => role.toLowerCase()));
        const grants = new Map(feature.roles.map(role => [role.roleName.toLowerCase(), role]));
        const stale = feature.roles.filter(role => !catalog.has(role.roleName.toLowerCase()));

        const items = this.#roles.map(role => {
            const grant = grants.get(role.toLowerCase());
            const busy = this.#pending.has(`${feature.featureId}:role:${role.toLowerCase()}`);
            return `
                <li>
                    <label class="fa-check${busy ? ' is-pending' : ''}">
                        <input type="checkbox" data-action="role" data-role="${escapeHtml(role)}" ${grant ? 'checked' : ''} ${feature.isVoided ? 'disabled' : ''}>
                        <span class="fa-check-label">${escapeHtml(role)}</span>
                        ${grant ? `<span class="fa-muted fa-check-meta">${escapeHtml(grant.grantedBy)}, <time datetime="${escapeHtml(grant.grantedAt)}" title="${escapeHtml(formatDateTime(grant.grantedAt))}">${escapeHtml(relativeTime(grant.grantedAt))}</time></span>` : ''}
                    </label>
                </li>`;
        }).join('');

        const staleBlock = stale.length === 0 ? '' : `
            <div class="fa-stale">
                <p>Also granted to roles this app no longer has:</p>
                <ul>${stale.map(role => `
                    <li>
                        <code>${escapeHtml(role.roleName)}</code>
                        ${feature.isVoided ? '' : `<button type="button" class="fa-button fa-button--quiet fa-button--small" data-action="revoke-stale" data-role="${escapeHtml(role.roleName)}">Revoke</button>`}
                    </li>`).join('')}
                </ul>
            </div>`;

        const warning = !feature.isVoided && feature.roles.length === 0
            ? '<p class="fa-muted">No roles yet, so nobody can use it even when it is on.</p>'
            : '';

        this.#rerender('roles', `
            <h3 class="fa-section-title">Who can use it</h3>
            ${warning}
            <ul class="fa-checks">${items}</ul>
            ${staleBlock}`);
    }

    #renderGate() {
        const list = this.#gateLocations.length
            ? `<ul class="fa-locations">${this.#gateLocations.map(location => `<li><code title="${escapeHtml(location)}">${escapeHtml(shortLocation(location))}</code></li>`).join('')}</ul>`
            : '<p class="fa-muted">No <code>[FeatureGate]</code> in this app uses this name. It may still be checked in views or JavaScript.</p>';
        this.#ref('gate').innerHTML = `<h3 class="fa-section-title">Where it's enforced</h3>${list}`;
    }

    #detailsDirty() {
        const form = this.#form('details');
        if (!form) return false;
        const description = form.elements.description.value.trim() || null;
        return form.elements.displayName.value.trim() !== this.#feature.displayName
            || description !== (this.#feature.description ?? null);
    }

    #syncDetailsDirty() {
        const form = this.#form('details');
        const dirty = this.#detailsDirty();
        form.querySelector('[type="submit"]').disabled = !dirty;
        form.querySelector('[data-action="details-reset"]').hidden = !dirty;
    }

    #validateName(form, strict) {
        const input = form.elements.name;
        const value = input.value.trim();
        let error = '';
        if (!value) {
            error = strict ? 'Enter a code name.' : '';
        } else if (!(strict ? NAME_PATTERN : NAME_WHILE_TYPING).test(value)) {
            error = 'Use lowercase letters and numbers, separated by single dots or hyphens, like manager.renewals.';
        }
        this.#setError(form.querySelector('[data-ref="name-error"]'), error);
        input.setAttribute('aria-invalid', error ? 'true' : 'false');
        return !error;
    }

    #setError(element, message) {
        element.textContent = message;
        element.hidden = !message;
    }

    async #whileBusy(form, busyLabel, errorElement, work) {
        const submit = form.querySelector('[type="submit"]');
        const label = submit.textContent;
        submit.disabled = true;
        submit.textContent = busyLabel;
        this.#setError(errorElement, '');
        try {
            await work();
        } catch (error) {
            if (errorElement.isConnected) this.#setError(errorElement, error.message);
            if (submit.isConnected) {
                submit.disabled = false;
                submit.textContent = label;
            }
        }
    }

    #onClick(event) {
        const target = event.target.closest('[data-action]');
        if (!target || target.tagName === 'INPUT') return;

        switch (target.dataset.action) {
            case 'close':
                this.close();
                break;
            case 'enabled':
                if (!target.classList.contains('is-pending')) this.#handlers.onToggleEnabled(this.#feature.featureId);
                break;
            case 'revoke-stale':
                this.#handlers.onToggleRole(this.#feature.featureId, target.dataset.role);
                break;
            case 'details-reset':
                this.#renderDetails();
                this.#form('details').elements.displayName.focus();
                break;
        }
    }

    #onChange(event) {
        const input = event.target;
        if (this.#mode !== 'detail' || input.dataset.action !== 'role') return;
        // The server decides; the checkbox re-renders from the returned feature.
        input.checked = !input.checked;
        if (!this.#pending.has(`${this.#feature.featureId}:role:${input.dataset.role.toLowerCase()}`)) {
            this.#handlers.onToggleRole(this.#feature.featureId, input.dataset.role);
        }
    }

    #onInput(event) {
        const form = event.target.form;
        if (!form) return;

        if (form.dataset.form === 'details') {
            this.#syncDetailsDirty();
        } else if (form.dataset.form === 'create') {
            if (event.target.name === 'displayName') {
                this.#displayTouched = event.target.value.trim() !== '';
            }
            if (event.target.name === 'name') {
                if (!this.#displayTouched) form.elements.displayName.value = suggestDisplayName(event.target.value);
                this.#validateName(form, false);
            }
        }
    }

    async #onSubmit(event) {
        event.preventDefault();
        const form = event.target;
        switch (form.dataset.form) {
            case 'details':
                await this.#submitDetails(form);
                break;
            case 'create':
                await this.#submitCreate(form);
                break;
        }
    }

    async #submitDetails(form) {
        const errorElement = form.querySelector('[data-ref="details-error"]');
        const displayName = form.elements.displayName.value.trim();
        if (!displayName) {
            this.#setError(errorElement, 'Enter a display name.');
            form.elements.displayName.focus();
            return;
        }
        await this.#whileBusy(form, 'Saving…', errorElement, async () => {
            await this.#handlers.onSaveDetails(this.#feature.featureId, {
                displayName,
                description: form.elements.description.value.trim() || null
            });
            this.#renderDetails();
            this.#form('details')?.elements.displayName.focus();
        });
    }

    async #submitCreate(form) {
        const errorElement = form.querySelector('[data-ref="create-error"]');
        const nameValid = this.#validateName(form, true);
        const displayName = form.elements.displayName.value.trim();
        if (!nameValid) {
            form.elements.name.focus();
            return;
        }
        if (!displayName) {
            this.#setError(errorElement, 'Enter a display name.');
            form.elements.displayName.focus();
            return;
        }
        await this.#whileBusy(form, 'Creating…', errorElement, () => this.#handlers.onCreate({
            name: form.elements.name.value.trim(),
            displayName,
            description: form.elements.description.value.trim() || null,
            isEnabled: form.elements.isEnabled.checked,
            roles: [...form.querySelectorAll('input[name="roles"]:checked')].map(input => input.value)
        }));
    }

    #onKeydown(event) {
        if (!this.isOpen) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
            return;
        }

        if (event.key === 'Tab') {
            const focusable = [...this.#panel.querySelectorAll(FOCUSABLE)]
                .filter(element => !element.disabled && element.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }
}
