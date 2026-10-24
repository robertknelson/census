import { escapeHtml } from '../utils/format.mjs';

// One form for any row (Census's record-form.mjs): a field list says what to draw and how each
// value goes back to the API. The membership page draws an application's parts with it. toPayload is pure.
//
// Field: { name, label, type: text | textarea | select | date | datetime | int, options?: [{ value,
// label }], required?, wide?, blank?: label for an empty choice in a select }.

const pad = (n) => String(n).padStart(2, '0');

// A stored moment as the reader's local "yyyy-MM-ddTHH:mm" for <input type=datetime-local>.
export function toLocalInput(value) {
    if (!value) return '';
    const d = new Date(value);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inputValue(field, value) {
    if (value == null) return '';
    if (field.type === 'date') return String(value).slice(0, 10);
    if (field.type === 'datetime') return toLocalInput(value);
    return String(value);
}

export function renderForm(fields, values = {}, { key = '', saveLabel = 'Save', canDelete = false } = {}) {
    const control = (f) => {
        const v = inputValue(f, values[f.name]);
        const req = f.required ? ' required' : '';
        if (f.type === 'textarea') return `<textarea name="${f.name}" rows="2"${req}>${escapeHtml(v)}</textarea>`;
        if (f.type === 'select') {
            const blank = f.required ? '' : `<option value="">${escapeHtml(f.blank ?? '—')}</option>`;
            return `<select name="${f.name}"${req}>${blank}${f.options.map((o) => `<option value="${escapeHtml(o.value)}"${String(o.value) === v ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`;
        }
        const type = f.type === 'datetime' ? 'datetime-local' : f.type === 'date' ? 'date' : f.type === 'int' ? 'number' : 'text';
        return `<input type="${type}" name="${f.name}" value="${escapeHtml(v)}"${req} />`;
    };
    return `
        <form class="cu-form" data-record="${escapeHtml(key)}">
            ${fields.map((f) => `<label class="${f.wide || f.type === 'textarea' ? 'cu-wide' : ''}">${escapeHtml(f.label)}${control(f)}</label>`).join('')}
            <div class="cu-wide cu-actions">
                <button type="submit" class="ps-save">${escapeHtml(saveLabel)}</button>
                ${canDelete ? '<button type="button" class="ps-cancel cu-delete" data-delete>Delete</button>' : ''}
                <span class="ps-form-status" data-status></span>
            </div>
        </form>`;
}

// The form's raw strings, by name, to what the API takes: empty is null; an int is a number; a
// date-time is the moment the reader meant, in ISO with its offset.
export function toPayload(fields, raw) {
    const body = {};
    for (const f of fields) {
        const v = (raw[f.name] ?? '').toString().trim();
        if (v === '') body[f.name] = null;
        else if (f.type === 'int' || (f.type === 'select' && f.int)) body[f.name] = Number(v);
        else if (f.type === 'datetime') body[f.name] = new Date(v).toISOString();
        else body[f.name] = v;
    }
    return body;
}

export function readForm(form) {
    return Object.fromEntries(new FormData(form));
}
