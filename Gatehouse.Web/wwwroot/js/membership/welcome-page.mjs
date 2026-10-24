import { escapeHtml, isoDate } from './utils/format.mjs';

// The visitor welcome (gatehouse.md §11): a signed-in non-member sees who Windows says they are and asks to join —
// why, for which applications, in which role. While a request waits it is shown instead of the form; a declined one
// shows its reason above a fresh form. Who is asking is the sign-in's, never typed.

class WelcomePage {
    init(config = {}) {
        this.root = typeof config.root === 'string' ? document.querySelector(config.root) : config.root;
        this.flash = '';
        this.load();
    }

    async load() {
        this.root.innerHTML = '<p class="ps-none">Reading…</p>';
        try {
            const response = await fetch('/api/welcome', { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`The welcome did not answer (${response.status}).`);
            this.data = await response.json();
        } catch (e) {
            this.root.innerHTML = `<p class="ps-error">${escapeHtml(e.message)}</p>`;
            return;
        }
        this.render();
    }

    render() {
        const { windowsIdentity, identifier, request } = this.data;
        const body = request?.status === 'pending' ? this.waitingHtml(request)
            : request?.status === 'approved' ? this.approvedHtml(request)
            : `${request?.status === 'declined' ? this.declinedHtml(request) : ''}${this.formHtml()}`;
        this.root.innerHTML = `
            <div class="mb-page wl-page">
                <header class="mb-head"><h2 class="mb-title">Welcome to Gatehouse</h2></header>
                <p class="ps-sub">You are signed in by Windows as <code>${escapeHtml(windowsIdentity)}</code>, but you are not a member yet.
                    Ask to join below; an administrator will grant you a role, and the pages your role may use appear in the sidebar.</p>
                ${this.flash ? `<p class="mb-flash">${escapeHtml(this.flash)}</p>` : ''}
                ${body}
                <p class="ps-sub">Your identifier here will be <code>${escapeHtml(identifier)}</code>.</p>
            </div>`;
        this.bind();
    }

    summaryHtml(r) {
        return `<dl class="wl-summary">
            <dt>Name</dt><dd>${escapeHtml(`${r.firstName} ${r.lastName}`)}</dd>
            <dt>Email</dt><dd>${escapeHtml(r.email)}</dd>
            <dt>Applications</dt><dd>${escapeHtml(r.applications ?? '—')}</dd>
            <dt>Role</dt><dd>${escapeHtml(r.role ?? '—')}</dd>
            <dt>Why</dt><dd>${escapeHtml(r.reason)}</dd>
            <dt>Asked</dt><dd>${escapeHtml(isoDate(r.requestedAt))}</dd>
        </dl>`;
    }

    waitingHtml(r) {
        return `<section class="ps-section"><h3 class="ps-h3">Your request is waiting for an administrator</h3>${this.summaryHtml(r)}</section>`;
    }

    approvedHtml(r) {
        return `<section class="ps-section"><h3 class="ps-h3">Your request was approved</h3>
            <p>Your membership reaches you within a few minutes of approval: reload this page then, and Home opens with your roles.</p>
            ${this.summaryHtml(r)}</section>`;
    }

    declinedHtml(r) {
        return `<section class="ps-section wl-declined"><h3 class="ps-h3">Your last request was declined</h3>
            <p>${escapeHtml(r.decisionNote ?? '')}</p><p class="ps-sub">You may ask again.</p></section>`;
    }

    formHtml() {
        const { applications, roles } = this.data;
        return `
            <section class="ps-section">
                <h3 class="ps-h3">Ask to join</h3>
                <form class="mb-form" data-form="join">
                    <label>First name <input name="firstName" required maxlength="100" autocomplete="given-name" /></label>
                    <label>Last name <input name="lastName" required maxlength="100" autocomplete="family-name" /></label>
                    <label class="mb-wide">Email <input name="email" type="email" required maxlength="100" autocomplete="email" /></label>
                    <label class="mb-wide">Why you want to join <textarea name="reason" rows="3" required maxlength="1000"></textarea></label>
                    <fieldset class="mb-wide wl-apps"><legend>Your application(s)</legend>
                        ${applications.map((a) => `<label class="wl-check"><input type="checkbox" name="applicationIds" value="${a.id}" /> ${escapeHtml(a.name)}</label>`).join('')}
                    </fieldset>
                    <label>Your role <select name="roleId" required><option value="">Pick one</option>${roles.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}</select></label>
                    <div class="mb-wide mb-actions"><button type="submit" class="ps-save">Ask to join</button><span class="ps-form-status" data-status></span></div>
                </form>
            </section>`;
    }

    bind() {
        const form = this.root.querySelector('[data-form="join"]');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const status = form.querySelector('[data-status]');
            const data = new FormData(form);
            const body = {
                firstName: data.get('firstName'), lastName: data.get('lastName'), email: data.get('email'), reason: data.get('reason'),
                roleId: Number(data.get('roleId')), applicationIds: data.getAll('applicationIds').map(Number),
            };
            status.textContent = 'Sending…';
            status.className = 'ps-form-status';
            try {
                const response = await fetch('/api/welcome/request', {
                    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error((payload.errors ?? [`The request was refused (${response.status}).`]).join(' '));
                this.flash = 'Sent. An administrator will see it on the Membership page.';
                await this.load();
            } catch (err) {
                status.textContent = err.message;
                status.className = 'ps-form-status is-error';
            }
        });
    }
}

export default new WelcomePage();
