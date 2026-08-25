import { MachinesListView } from './views/machines-list-view.mjs';
import { MachineDetailView } from './views/machine-detail-view.mjs';
import { DashboardView } from './views/dashboard-view.mjs';
import { CertificatesView } from './views/certificates-view.mjs';
import { CoverageView } from './views/coverage-view.mjs';
import { CompareView } from './views/compare-view.mjs';
import { BlacklistView } from './views/blacklist-view.mjs';

class CensusPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId);

        this.root.innerHTML = `
            <div class="census-app">
                <header class="census-header">
                    <h1><a href="#/">Census</a></h1>
                    <nav class="census-nav">
                        <a href="#/">Dashboard</a>
                        <a href="#/machines">Machines</a>
                        <a href="#/compare">Compare</a>
                        <a href="#/certificates">Certificates</a>
                        <a href="#/coverage">Coverage</a>
                        <a href="#/blacklist">Prohibited</a>
                    </nav>
                </header>
                <main class="census-content" data-ref="content"></main>
            </div>`;

        this.contentEl = this.root.querySelector('[data-ref="content"]');

        window.addEventListener('hashchange', () => this.route());
        this.route();
    }

    route() {
        const hash = window.location.hash.replace(/^#\/?/, '');
        const [section, param] = hash.split('/');

        if (section === 'machines' && param) {
            new MachineDetailView(this.contentEl, decodeURIComponent(param)).render();
        } else if (section === 'machines') {
            new MachinesListView(this.contentEl).render();
        } else if (section === 'compare') {
            new CompareView(this.contentEl).render();
        } else if (section === 'certificates') {
            new CertificatesView(this.contentEl).render();
        } else if (section === 'coverage') {
            new CoverageView(this.contentEl).render();
        } else if (section === 'blacklist') {
            new BlacklistView(this.contentEl).render();
        } else {
            new DashboardView(this.contentEl).render();
        }
    }
}

export default new CensusPage();
