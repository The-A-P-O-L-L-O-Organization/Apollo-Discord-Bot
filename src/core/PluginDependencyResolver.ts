export function sortByDependencies(ids: string[], getDeps: (id: string) => string[]): string[] {
    const idSet = new Set(ids);
    const visited = new Set<string>();
    const sorted: string[] = [];

    function visit(id: string, graph: Map<string, string[]>, path: Set<string>): void {
        if (path.has(id)) { throw new Error(`Circular dependency detected: ${[...path, id].join(' -> ')}`); }
        if (visited.has(id)) { return; }
        visited.add(id);
        path.add(id);
        for (const dep of graph.get(id) ?? []) {
            if (idSet.has(dep)) { visit(dep, graph, path); }
        }
        path.delete(id);
        sorted.push(id);
    }

    const graph = new Map<string, string[]>();
    for (const id of ids) {
        graph.set(id, getDeps(id));
    }

    for (const id of ids) {
        visit(id, graph, new Set());
    }

    return sorted;
}

export async function enablePluginsParallel(sortedIds: string[], getDeps: (id: string) => string[], enable: (id: string) => Promise<void>): Promise<void> {
    const graph = new Map<string, string[]>();
    const reverseGraph = new Map<string, Set<string>>();
    for (const id of sortedIds) {
        const deps = getDeps(id).filter(d => sortedIds.includes(d));
        graph.set(id, deps);
        for (const dep of getDeps(id)) {
            if (!reverseGraph.has(dep)) { reverseGraph.set(dep, new Set()); }
            reverseGraph.get(dep)!.add(id);
        }
    }

    const levels = new Map<string, number>();
    const visited = new Set<string>();

    function calculateLevel(id: string): number {
        if (visited.has(id)) { return levels.get(id)!; }
        visited.add(id);
        const deps = graph.get(id) ?? [];
        if (deps.length === 0) {
            levels.set(id, 0);
            return 0;
        }
        let maxLevel = 0;
        for (const dep of deps) {
            const depLevel = calculateLevel(dep);
            maxLevel = Math.max(maxLevel, depLevel + 1);
        }
        levels.set(id, maxLevel);
        return maxLevel;
    }

    for (const id of sortedIds) {
        calculateLevel(id);
    }

    const levelGroups = new Map<number, string[]>();
    for (const [id, level] of levels) {
        if (!levelGroups.has(level)) { levelGroups.set(level, []); }
        levelGroups.get(level)!.push(id);
    }

    if (levels.size === 0) { return; }
    const maxLevel = Math.max(...levels.values());
    for (let level = 0; level <= maxLevel; level++) {
        const idsAtLevel = levelGroups.get(level) ?? [];
        if (idsAtLevel.length === 0) { continue; }
        await Promise.all(idsAtLevel.map(id => enable(id)));
    }
}
