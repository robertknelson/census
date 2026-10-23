import { FeatureApi } from './feature-api.mjs';
import { AccessMatrix } from './components/access-matrix.mjs';
import { FeatureDrawer } from './components/feature-drawer.mjs';
import { ToastStack } from './components/toast-stack.mjs';
import { escapeHtml, isTypingTarget, CHECK_ICON } from './utils/dom.mjs';
import { shortLocation } from './utils/format.mjs';

const FILTERS = [
    { key: 'all', label: 'All', test: feature => !feature.isVoided },
    { key: 'on', label: 'On', test: feature => !feature.isVoided && feature.isEnabled },
    { key: 'off', label: 'Off', test: feature => !feature.isVoided && !feature.isEnabled },
    { key: 'voided', label: 'Voided', test: feature => feature.isVoided }
];

const EMPTY_MESSAGES = {
    all: 'No features yet. Create one, then grant it to the roles that should use it.',
    on: 'No features are on.',
    off: 'Every feature is on.',
    voided: 'No features have been voided.'
};

const SORT_STORAGE_KEY = 'feature-access.sort';
const DEFAULT_SORT = { key: 'name', descending: false };

const SEARCH_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

const SHELL = `
    <div class="fa-page">
        <header class="fa-head">
            <div>
                <h1 class="fa-title">Feature access</h1>
                <p class="fa-summary" data-ref="summary">Loading…</p>
            </div>
            <button type="button" class="fa-button fa-button--primary" data-ref="create">New feature</button>
        </header>
        <div class="fa-alerts" data-ref="alerts"></div>
        <div class="fa-toolbar">
            <label class="fa-search">
                ${SEARCH_ICON}
                <input type="search" data-ref="search" placeholder="Search features and roles" aria-label="Search features and roles">
                <kbd aria-hidden="true">/</kbd>
            </label>
            <div class="fa-segments" role="group" aria-label="Show features" data-ref="filters"></div>
        </div>
        <div data-ref="matrix"></div>
        <ul class="fa-legend" aria-label="Key">
            <li><span class="fa-grant fa-swatch is-granted">${CHECK_ICON}</span>Granted</li>
            <li><span class="fa-grant fa-swatch is-granted is-inert">${CHECK_ICON}</span>Granted, but the feature is off</li>
            <li><span class="fa-grant fa-swatch"></span>Not granted</li>
        </ul>
        <div data-ref="drawer"></div>
        <div class="fa-toasts" data-ref="toasts"></div>
    </div>`;

class FeatureAccessPage {
    #api;
    #gateTags = true;
    #refs = {};
    #matrix;
    #drawer;
    #toasts;
    #state = {
        features: [],
        roles: [],
        scan: { referenced: [], undefined: [], unreferenced: [] },
        filter: 'all',
        query: '',
        loading: true,
        error: null,
        pending: new Set(),
        selectedId: null,
        sort: DEFAULT_SORT,
        // Feature ids in display order. Set on load and on a header click only, so a row never moves under the pointer when it is toggled.
        order: []
    };

    init(config = {}) {
        const root = typeof config.root === 'string'
            ? document.querySelector(config.root)
            : config.root ?? document.querySelector('#feature-access');
        this.#api = new FeatureApi(config.apiBase ?? root.dataset.apiBase, config.headers);
        this.#gateTags = config.gateTags !== false;

        root.innerHTML = SHELL;
        root.querySelectorAll('[data-ref]').forEach(element => { this.#refs[element.dataset.ref] = element; });

        this.#toasts = new ToastStack(this.#refs.toasts);
        this.#matrix = new AccessMatrix(this.#refs.matrix, {
            onOpen: featureId => this.#openFeature(featureId),
            onToggleEnabled: featureId => this.#toggleEnabled(featureId),
            onToggleRole: (featureId, role) => this.#toggleRole(featureId, role),
            onSort: key => this.#sortBy(key),
            onRetry: () => this.#load()
        });
        this.#drawer = new FeatureDrawer(this.#refs.drawer, {
            onToggleEnabled: featureId => this.#toggleEnabled(featureId),
            onToggleRole: (featureId, role) => this.#toggleRole(featureId, role),
            onSaveDetails: (featureId, values) => this.#saveDetails(featureId, values),
            onCreate: data => this.#createFeature(data),
            onClose: () => {
                this.#state.selectedId = null;
                this.#renderMatrix();
            },
            onReturnFocus: () => this.#matrix.focusCurrent()
        });

        this.#state.sort = this.#storedSort();
        this.#bindToolbar();
        this.#load();
    }

    #storedSort() {
        try {
            const stored = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY));
            return stored && typeof stored.key === 'string' ? { key: stored.key, descending: stored.descending === true } : DEFAULT_SORT;
        } catch {
            return DEFAULT_SORT;
        }
    }

    #sortBy(key) {
        const { sort } = this.#state;
        this.#state.sort = { key, descending: sort.key === key ? !sort.descending : false };
        try {
            localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(this.#state.sort));
        } catch {
            // The order still applies for this visit.
        }
        this.#applySort();
        this.#renderMatrix();
    }

    #applySort() {
        const { features, roles } = this.#state;
        const isRole = key => key.startsWith('role:') && roles.some(role => role.toLowerCase() === key.slice(5));
        if (!['name', 'on'].includes(this.#state.sort.key) && !isRole(this.#state.sort.key)) {
            this.#state.sort = DEFAULT_SORT;
        }
        const { key, descending } = this.#state.sort;
        const rank = feature => {
            if (key === 'on') return feature.isEnabled ? 0 : 1;
            if (key === 'name') return 0;
            return feature.roles.some(grant => grant.roleName.toLowerCase() === key.slice(5)) ? 0 : 1;
        };
        const byName = (a, b) => a.displayName.localeCompare(b.displayName) || a.name.localeCompare(b.name) || a.featureId - b.featureId;
        const direction = descending ? -1 : 1;
        this.#state.order = [...features]
            .sort((a, b) => (key === 'name' ? direction * byName(a, b) : direction * (rank(a) - rank(b)) || byName(a, b)))
            .map(feature => feature.featureId);
    }

    #bindToolbar() {
        this.#refs.search.addEventListener('input', () => {
            this.#state.query = this.#refs.search.value.trim().toLowerCase();
            this.#renderMatrix();
        });
        this.#refs.filters.addEventListener('click', event => {
            const button = event.target.closest('[data-filter]');
            if (!button) return;
            this.#state.filter = button.dataset.filter;
            this.#renderFilters();
            this.#renderMatrix();
        });
        this.#refs.create.addEventListener('click', () => this.#drawer.openCreate({ roles: this.#state.roles }));
        this.#refs.alerts.addEventListener('click', event => {
            const button = event.target.closest('[data-define]');
            if (button) this.#drawer.openCreate({ roles: this.#state.roles, name: button.dataset.define });
        });
        document.addEventListener('keydown', event => {
            if (event.key === '/' && !this.#drawer.isOpen && !isTypingTarget(event.target)) {
                event.preventDefault();
                this.#refs.search.focus();
            }
        });
    }

    async #load() {
        Object.assign(this.#state, { loading: true, error: null });
        this.#render();
        try {
            const [features, roles, scan] = await Promise.all([
                this.#api.listFeatures(true),
                this.#api.getRoles(),
                this.#api.getGateScan()
            ]);
            Object.assign(this.#state, { features, roles, scan, loading: false });
            this.#applySort();
        } catch (error) {
            Object.assign(this.#state, { loading: false, error: `Feature access couldn't be loaded. ${error.message}` });
        }
        this.#render();
    }

    async #refreshScan() {
        try {
            this.#state.scan = await this.#api.getGateScan();
        } catch {
            return;
        }
        this.#renderAlerts();
        this.#renderMatrix();
        if (this.#drawer.featureId !== null) {
            this.#drawer.setGateLocations(this.#gateLocations(this.#find(this.#drawer.featureId)));
        }
    }

    #render() {
        this.#renderSummary();
        this.#renderFilters();
        this.#renderAlerts();
        this.#renderMatrix();
    }

    #renderSummary() {
        const { features, roles, loading, error } = this.#state;
        if (loading || error) {
            this.#refs.summary.textContent = loading ? 'Loading…' : '';
            return;
        }
        const active = features.filter(feature => !feature.isVoided);
        const on = active.filter(feature => feature.isEnabled).length;
        const noun = active.length === 1 ? 'feature' : 'features';
        this.#refs.summary.textContent = `${on} of ${active.length} ${noun} on, across ${roles.length} roles.`;
    }

    #renderFilters() {
        this.#refs.filters.innerHTML = FILTERS.map(filter => `
            <button type="button" class="fa-segment" data-filter="${filter.key}" aria-pressed="${this.#state.filter === filter.key}">
                ${filter.label}<span class="fa-count">${this.#state.features.filter(filter.test).length}</span>
            </button>`).join('');
    }

    #renderAlerts() {
        this.#refs.alerts.innerHTML = this.#state.scan.undefined.map(gate => {
            const places = gate.locations
                .map(location => `<code title="${escapeHtml(location)}">${escapeHtml(shortLocation(location))}</code>`)
                .join(', ');
            return `
                <div class="fa-alert" role="status">
                    <p><strong>Nobody can open ${places}.</strong>
                        ${gate.locations.length === 1 ? 'It is' : 'They are'} gated by <code>${escapeHtml(gate.feature)}</code>, which isn't defined.</p>
                    <button type="button" class="fa-button" data-define="${escapeHtml(gate.feature)}">Define feature</button>
                </div>`;
        }).join('');
    }

    #renderMatrix() {
        const { roles, pending, scan, selectedId, loading, error, query, filter, sort } = this.#state;
        this.#matrix.render({
            features: this.#visibleFeatures(),
            roles,
            sort,
            pending,
            // A host that enforces features only in its nav (the gate scan cannot see it) passes gateTags: false.
            gatedNames: this.#gateTags ? new Set(scan.referenced.map(reference => reference.feature.toLowerCase())) : null,
            selectedId,
            loading,
            error,
            emptyMessage: query ? `No features match “${query}”.` : EMPTY_MESSAGES[filter]
        });
    }

    #visibleFeatures() {
        const { order, filter, query } = this.#state;
        const test = FILTERS.find(candidate => candidate.key === filter).test;
        return order.map(featureId => this.#find(featureId)).filter(test).filter(feature => !query
            || feature.name.toLowerCase().includes(query)
            || feature.displayName.toLowerCase().includes(query)
            || feature.roles.some(role => role.roleName.toLowerCase().includes(query)));
    }

    #find(featureId) {
        return this.#state.features.find(feature => feature.featureId === featureId);
    }

    #gateLocations(feature) {
        const name = feature.name.toLowerCase();
        return this.#state.scan.referenced.find(reference => reference.feature.toLowerCase() === name)?.locations ?? [];
    }

    #replace(updated) {
        const features = this.#state.features;
        const index = features.findIndex(feature => feature.featureId === updated.featureId);
        if (index === -1) {
            features.push(updated);
            this.#applySort();
        } else {
            features[index] = updated;
        }

        this.#renderSummary();
        this.#renderFilters();
        this.#renderMatrix();
        if (this.#drawer.featureId === updated.featureId) {
            this.#drawer.update(updated);
            this.#loadHistory(updated.featureId);
        }
    }

    async #openFeature(featureId) {
        const feature = this.#find(featureId);
        this.#state.selectedId = featureId;
        this.#renderMatrix();
        this.#drawer.openDetail(feature, {
            roles: this.#state.roles,
            gateLocations: this.#gateLocations(feature),
            pending: this.#state.pending
        });
        await this.#loadHistory(featureId);
    }

    async #loadHistory(featureId) {
        try {
            const entries = await this.#api.getAudit(featureId);
            if (this.#drawer.featureId === featureId) this.#drawer.setHistory(entries);
        } catch (error) {
            if (this.#drawer.featureId === featureId) this.#drawer.setHistory([], error.message);
        }
    }

    #setPending(key, isPending) {
        if (isPending) {
            this.#state.pending.add(key);
        } else {
            this.#state.pending.delete(key);
        }
        this.#renderMatrix();
        this.#drawer.setPending(this.#state.pending);
    }

    async #toggleEnabled(featureId) {
        const feature = this.#find(featureId);
        const key = `${featureId}:enabled`;
        if (this.#state.pending.has(key)) return;
        await this.#mutate(key, feature,
            () => this.#api.setEnabled(featureId, !feature.isEnabled, feature.rowVersion),
            updated => `${updated.displayName} is ${updated.isEnabled ? 'on' : 'off'}`);
    }

    async #toggleRole(featureId, role) {
        const feature = this.#find(featureId);
        const key = `${featureId}:role:${role.toLowerCase()}`;
        if (this.#state.pending.has(key)) return;
        const granted = feature.roles.some(grant => grant.roleName.toLowerCase() === role.toLowerCase());
        await this.#mutate(key, feature,
            () => (granted ? this.#api.revokeRole(featureId, role) : this.#api.grantRole(featureId, role)),
            updated => (granted ? `Revoked ${role} from ${updated.displayName}` : `Granted ${role} on ${updated.displayName}`));
    }

    async #mutate(key, feature, call, successMessage) {
        this.#setPending(key, true);
        try {
            const updated = await call();
            this.#setPending(key, false);
            this.#replace(updated);
            this.#toasts.show(successMessage(updated));
        } catch (error) {
            this.#setPending(key, false);
            if (error.status === 409 || error.status === 404) {
                await this.#reloadFeature(feature.featureId);
                this.#toasts.show(error.status === 409
                    ? `${feature.displayName} was changed by someone else. The latest version is showing now, so try again.`
                    : `${feature.displayName} was voided or removed. The list is up to date now.`, { tone: 'error' });
            } else {
                this.#toasts.show(error.message, { tone: 'error' });
            }
        }
    }

    async #reloadFeature(featureId) {
        try {
            this.#replace(await this.#api.getFeature(featureId));
        } catch {
            await this.#load();
        }
    }

    // Form actions throw so the drawer can show the message beside the form.
    async #saveDetails(featureId, values) {
        const feature = this.#find(featureId);
        try {
            const updated = await this.#api.updateFeature(featureId, { ...values, rowVersion: feature.rowVersion });
            this.#replace(updated);
            this.#toasts.show(`Saved ${updated.displayName}`);
        } catch (error) {
            if (error.status === 409) {
                await this.#reloadFeature(featureId);
                throw new Error('Someone else changed this feature. The latest version is loaded and your edits are still here, so save again to apply them.');
            }
            throw error;
        }
    }

    async #createFeature(data) {
        const created = await this.#api.createFeature(data);
        this.#state.query = '';
        this.#refs.search.value = '';
        if (!FILTERS.find(filter => filter.key === this.#state.filter).test(created)) {
            this.#state.filter = 'all';
        }
        this.#replace(created);
        this.#toasts.show(`Created ${created.displayName}`);
        await this.#refreshScan();
        await this.#openFeature(created.featureId);
    }
}

export default new FeatureAccessPage();
