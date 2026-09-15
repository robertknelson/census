import { escapeHtml } from './format.mjs';
import { laneFor } from './lanes.mjs';
import { laneHue } from './stage-hues.mjs';

const WEEK = 7;

// The weekly-meeting numbers (move-it.md §13, level 1): open work items per lane from
// question 01, and four release counts from questions 02 and 04. Every number is a count of
// rows the questions already return — nothing is computed here that a question does not say.
export class CountsPanel {
    render(el, { lanes, items, releases, candidates, now }) {
        const open = items.filter((i) => i.Status !== 'removed');
        const perLane = lanes.map((lane) => ({
            lane,
            count: open.filter((i) => laneFor(i.Status, lanes) === lane.id).length,
        }));

        const pastTarget = releases.filter((r) => r.PastTarget === 1).length;
        const onHold = releases.filter((r) => r.OnHold === 1).length;
        const reachedProd = releases.filter((r) => r.HighestStage === 'PROD' && r.Since
            && (now - Date.parse(r.Since)) <= WEEK * 86_400_000).length;
        const ready = candidates.filter((c) => c.Ready === 1).length;

        el.innerHTML = `
            <section class="mi-counts" aria-label="Work items now">
                <h2 class="mi-counts-title">Work items now</h2>
                <ol class="mi-lane-counts">
                    ${perLane.map(({ lane, count }) => `
                        <li class="mi-lane-count" style="--lane: ${laneHue(lane)}">
                            <span class="mi-num">${count}</span>
                            <span class="mi-num-label">${escapeHtml(lane.label)}</span>
                        </li>`).join('')}
                </ol>
            </section>
            <section class="mi-counts" aria-label="Releases">
                <h2 class="mi-counts-title">Releases</h2>
                <ul class="mi-release-counts">
                    <li class="${pastTarget ? 'is-alert' : ''}"><span class="mi-num">${pastTarget}</span><span class="mi-num-label">past target, not in PROD</span></li>
                    <li class="${onHold ? 'is-hold' : ''}"><span class="mi-num">${onHold}</span><span class="mi-num-label">on hold</span></li>
                    <li><span class="mi-num">${reachedProd}</span><span class="mi-num-label">reached PROD in the last ${WEEK} days</span></li>
                    <li><span class="mi-num">${candidates.length}</span><span class="mi-num-label">awaiting approval${candidates.length ? `, ${ready} ready` : ''}</span></li>
                </ul>
            </section>`;
    }
}
