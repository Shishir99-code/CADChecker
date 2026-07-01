import type { Fact } from "./facts.ts";

/**
 * Minimal structural types for the slice of getAssemblyDefinition's response
 * this pure function needs. Deliberately local/minimal rather than importing
 * openapi-typescript-generated types here, keeping this module free of any
 * network or Onshape-client dependency (it consumes plain JSON).
 */
interface InstanceInfo {
  id: string;
  name: string;
  type?: string;
  suppressed?: boolean;
}

interface OccurrenceInfo {
  path: string[];
  transform: number[];
  fixed?: boolean;
  hidden?: boolean;
}

interface SubAssemblyInfo {
  instances: InstanceInfo[];
}

interface RootAssemblyInfo {
  instances: InstanceInfo[];
  occurrences: OccurrenceInfo[];
}

export interface AssemblyDefinition {
  rootAssembly: RootAssemblyInfo;
  subAssemblies?: SubAssemblyInfo[];
}

const UNKNOWN_NAME = "UNKNOWN";

/** Builds instanceId -> InstanceInfo across rootAssembly + every subAssembly. */
function buildInstanceMap(def: AssemblyDefinition): Map<string, InstanceInfo> {
  const instanceById = new Map<string, InstanceInfo>();

  for (const inst of def.rootAssembly.instances) {
    instanceById.set(inst.id, inst);
  }
  for (const sub of def.subAssemblies ?? []) {
    for (const inst of sub.instances) {
      instanceById.set(inst.id, inst);
    }
  }

  return instanceById;
}

/**
 * Flattens an assembly definition into Facts using already-absolute
 * occurrence transforms (no matrix composition up the subassembly chain --
 * see RESEARCH Pattern 2 / Anti-Patterns).
 */
export function flattenAssembly(def: AssemblyDefinition): Fact[] {
  const instanceById = buildInstanceMap(def);

  return def.rootAssembly.occurrences.map((occ): Fact => {
    const leafId = occ.path[occ.path.length - 1] ?? "";
    const instance = instanceById.get(leafId);

    return {
      partId: leafId,
      name: instance?.name ?? UNKNOWN_NAME,
      transform: occ.transform,
      path: occ.path,
    };
  });
}
