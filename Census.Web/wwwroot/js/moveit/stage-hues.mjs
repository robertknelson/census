// Same hues as Atlas's stage-colors.mjs, pinned by stage name, so a stage reads the same
// colour on the board as it does in the system view. Lanes before the first stage are grey.
// The Calendar is the one named exception (move-it.md §21.2): it colours by release, because
// its question is what happened to a piece of work, not what sits at a stage.
const STAGE_HUE = {
    dev: '#0072b2', development: '#0072b2',
    test: '#e69f00', tst: '#e69f00',
    val: '#009e73', validation: '#009e73',
    qa: '#cc79a7',
    prod: '#d55e00', prd: '#d55e00', production: '#d55e00',
    uat: '#56b4e9',
    ref: '#8a7d00', reference: '#8a7d00',
    staging: '#9467bd', stage: '#9467bd', stg: '#9467bd',
};

const NO_STAGE = '#8e96a3';

export function laneHue(lane) {
    return stageHue(lane.stages[0]);
}

export function stageHue(stage) {
    return STAGE_HUE[String(stage ?? '').toLowerCase()] ?? NO_STAGE;
}
