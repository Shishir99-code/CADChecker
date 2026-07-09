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

/**
 * One entry per unique CAD part, per 02-MASS-PROPERTIES-CONTRACT.md rule 3:
 * `definition.parts[]` is a flat, deduplicated (one entry per unique partId)
 * array joining a traversal occurrence to its mass/material by `partId`
 * within the same `documentId:elementId:configuration` context.
 *
 * `documentVersion`/`documentMicroversion`/`isStandardContent` are carried
 * through additively for cross-document mass addressing (contract F3):
 * referenced-document parts (documentId !== the assembly's own document)
 * cannot be read via the assembly's `w/{workspaceId}` and need
 * `v/{documentVersion}` (or `m/{documentMicroversion}` fallback) addressing.
 */
export interface AssemblyPartInfo {
  documentId: string;
  elementId: string;
  partId: string;
  configuration?: string;
  documentVersion?: string;
  documentMicroversion?: string;
  isStandardContent?: boolean;
}

export interface AssemblyDefinition {
  rootAssembly: RootAssemblyInfo;
  subAssemblies?: SubAssemblyInfo[];
  parts?: AssemblyPartInfo[];
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

/**
 * Groups AssemblyDefinition.parts[] by owning Part Studio element
 * (`documentId:elementId`), for the route's per-group mass/material
 * enrichment step (RESEARCH Architecture Pattern 1). Preserves every field
 * of each AssemblyPartInfo (no narrowing) -- the merge step reads
 * documentVersion/documentMicroversion off a group's first entry to address
 * referenced documents (contract F3); a single documentId:elementId group
 * shares one version, so the first entry is the authoritative version
 * source. Pure and network-free, matching flattenAssembly's constraint (no
 * client import in this file).
 */
export function groupPartsByElement(def: AssemblyDefinition): Map<string, AssemblyPartInfo[]> {
  const byElement = new Map<string, AssemblyPartInfo[]>();

  for (const part of def.parts ?? []) {
    const key = `${part.documentId}:${part.elementId}`;
    const list = byElement.get(key) ?? [];
    list.push(part);
    byElement.set(key, list);
  }

  return byElement;
}
