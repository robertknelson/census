import { postEvent } from './moveit-api.mjs';
import { escapeHtml } from './format.mjs';

// Record a human event against a release (move-it.md §16): approved, verified, hold, resumed,
// note, abandoned. Kind from the event-kinds list, stage from stages, build from the ones the
// release claims. Events are history: the server inserts or reports unchanged, never updates.
export class EventForm {
    constructor(onSaved) {
        this.onSaved = onSaved;
    }

    render(el, { releaseId, lists, stages, builds }) {
        this.el = el;
        this.releaseId = releaseId;
        const kinds = lists.filter((l) => l.List === 'event-kinds').map((l) => l.Member);
        const now = new Date();
        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
        const option = (v, label, selected = false) => `<option value="${escapeHtml(v)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        el.innerHTML = `
            <h2 class="mi-detail-title">Record an event</h2>
            <p class="mi-detail-sub">What the humans did. Promotion and PROD arrival are observed, never typed.</p>
            <form class="mi-form" data-ref="form">
                <div class="mi-field-row">
                    <label class="mi-field is-grow"><span>Event</span>
                        <select name="kind">${kinds.map((k) => option(k, k, k === 'approved')).join('')}</select></label>
                    <label class="mi-field"><span>Stage</span>
                        <select name="stage">${option('', '—', true)}${stages.map((s) => option(s.Stage, s.Stage)).join('')}</select></label>
                </div>
                <label class="mi-field"><span>Build</span>
                    <select name="build">${option('', '—', true)}${builds.map((b) => option(b, b)).join('')}</select></label>
                <div class="mi-field-row">
                    <label class="mi-field is-grow"><span>When</span><input name="at" type="datetime-local" value="${local}" required /></label>
                    <label class="mi-field is-grow"><span>By whom</span><input name="by" placeholder="the approver, the tester" required /></label>
                </div>
                <label class="mi-field"><span>Note</span><input name="note" placeholder="optional" /></label>
                <div class="mi-form-actions">
                    <button type="submit" class="mi-button is-primary">Record</button>
                    <p class="mi-form-status" data-ref="status"></p>
                </div>
            </form>`;
        el.querySelector('[data-ref="form"]').addEventListener('submit', (e) => { e.preventDefault(); this.save(); });
    }

    async save() {
        const form = this.el.querySelector('[data-ref="form"]');
        const statusEl = this.el.querySelector('[data-ref="status"]');
        const request = {
            releaseId: this.releaseId,
            kind: form.kind.value,
            stage: form.stage.value || null,
            build: form.build.value || null,
            at: new Date(form.at.value).toISOString(),
            by: form.by.value,
            note: form.note.value || null,
        };
        statusEl.textContent = 'Recording…';
        statusEl.className = 'mi-form-status';
        try {
            const result = await postEvent(request);
            statusEl.textContent = result.outcome === 'inserted' ? 'Recorded.' : 'Already recorded; nothing changed.';
            statusEl.className = 'mi-form-status is-ok';
            form.note.value = '';
            await this.onSaved();
        } catch (err) {
            statusEl.textContent = err.message;
            statusEl.className = 'mi-form-status is-error';
        }
    }
}
