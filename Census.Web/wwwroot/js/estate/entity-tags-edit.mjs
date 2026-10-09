// The leaf-walk shared by every writer of config/entity-tags.json and
// declared-entities.json — Triage (the pen for classifying) and the Atlas inspector (the
// layer only, layered-view.md §3). One walk, so a name with a different case or a legacy
// flat leaf is handled the same way whoever writes.

export function findKey(obj, key) {
    const lower = String(key).toLowerCase();
    return Object.keys(obj ?? {}).find((k) => k.toLowerCase() === lower) ?? key;
}

// The read-both rule, client side (entity-associations.md §3): rows and leaves from a
// backend or file still speaking the flat shape are interpreted as the cross-product
// they always meant. Writers emit associations only.
export function servesOf(x) {
    if (x.serves) return x.serves;
    const systems = x.system ?? [];
    const stages = x.stage ?? [];
    if (!systems.length && !stages.length) return [];
    if (!systems.length) return [{ system: '', stages: [...stages], assertedBy: x.assertedBy, assertedAt: x.assertedAt }];
    return systems.map((s) => ({ system: s, stages: [...stages], assertedBy: x.assertedBy, assertedAt: x.assertedAt }));
}

// Upgrade-on-write (entity-associations.md §7.3): the first UI touch converts the whole
// leaf to associations and drops the flat axes, so a leaf speaks one shape after it.
// Leaf-level provenance stays as history; new provenance lands on the associations.
export function upgradeLeaf(leaf) {
    if (!leaf.serves) leaf.serves = servesOf(leaf);
    delete leaf.system;
    delete leaf.stage;
    return leaf.serves;
}

export function ensureLeaf(config, kind, machine, container, name) {
    // A declared entity's record is its own leaf — assert axes onto it in
    // declared-entities.json; kind, note and endpoints are untouched by a classify.
    if (kind === 'declared') {
        const tree = (config.declared.onMachines ??= {});
        const entities = (tree[findKey(tree, machine)] ??= {});
        return (entities[findKey(entities, name)] ??= {});
    }
    if (kind === 'external') {
        const entities = (config.declared.external ??= {});
        return (entities[findKey(entities, name)] ??= {});
    }
    const tree = kind === 'database' ? (config.tags.databases ??= {}) : (config.tags.applications ??= {});
    const machineKey = findKey(tree, machine);
    const containers = (tree[machineKey] ??= {});
    const containerKey = findKey(containers, container);
    const leaves = (containers[containerKey] ??= {});
    const leafKey = findKey(leaves, name);
    return (leaves[leafKey] ??= {});
}
