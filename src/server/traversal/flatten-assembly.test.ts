import { describe, expect, it } from "vitest";
import { flattenAssembly } from "./flatten-assembly.ts";

// Hand-authored fixture modeling getAssemblyDefinition's shape:
// - rootAssembly.instances: top-level part + subassembly instances
// - rootAssembly.occurrences: includes a depth>=2 occurrence resolved through
//   the nested subassembly's own instances
// - subAssemblies[]: each with its own instances
// Instance `id` (the occurrence-path leaf) is DELIBERATELY DISTINCT from
// instance `partId` (the real CAD partId) in this fixture -- real Onshape
// Part instances carry both, and they are almost never equal on a real
// document. Asserting on the resolved partId (not the id) is the CR-01
// regression guard: it fails against pre-fix code that returned the leaf id.
const fixture = {
  rootAssembly: {
    instances: [
      { id: "root-occ-1", name: "FRAME_rail_1", type: "Part", suppressed: false, partId: "JHD" },
      { id: "sub-assembly-1", name: "Gearbox Assembly", type: "Assembly", suppressed: false },
    ],
    occurrences: [
      {
        path: ["root-occ-1"],
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        fixed: false,
        hidden: false,
      },
      {
        // depth >= 2: root subassembly instance -> nested part instance
        path: ["sub-assembly-1", "nested-occ-1"],
        transform: [1, 0, 0, 5, 0, 1, 0, 10, 0, 0, 1, 0, 0, 0, 0, 1],
        fixed: false,
        hidden: false,
      },
      {
        // unresolvable leaf id -- not present in any instance list
        path: ["sub-assembly-1", "ghost-part-99"],
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        fixed: false,
        hidden: false,
      },
    ],
  },
  subAssemblies: [
    {
      instances: [
        { id: "nested-occ-1", name: "MECH_gear_1", type: "Part", suppressed: false, partId: "GEAR" },
      ],
    },
  ],
};

describe("flattenAssembly", () => {
  it("returns one Fact per occurrence", () => {
    const facts = flattenAssembly(fixture);
    expect(facts).toHaveLength(3);
  });

  it("resolves a top-level occurrence's CAD partId (not its instance id) via rootAssembly.instances", () => {
    const facts = flattenAssembly(fixture);
    const rootFact = facts.find((f) => f.path.length === 1);
    expect(rootFact).toBeDefined();
    // CR-01 regression guard: instance id is "root-occ-1", CAD partId is
    // "JHD" -- this MUST resolve to the CAD partId, not the leaf instance id.
    expect(rootFact?.partId).toBe("JHD");
    expect(rootFact?.name).toBe("FRAME_rail_1");
  });

  it("resolves a nested (depth>=2) occurrence's CAD partId via the merged instance map", () => {
    const facts = flattenAssembly(fixture);
    const nestedFact = facts.find(
      (f) => f.path.length === 2 && f.path[1] === "nested-occ-1",
    );
    expect(nestedFact).toBeDefined();
    // CR-01 regression guard: instance id is "nested-occ-1", CAD partId is
    // "GEAR".
    expect(nestedFact?.partId).toBe("GEAR");
    expect(nestedFact?.name).toBe("MECH_gear_1");
  });

  it("passes transform through verbatim with no composition", () => {
    const facts = flattenAssembly(fixture);
    const nestedFact = facts.find(
      (f) => f.path.length === 2 && f.path[1] === "nested-occ-1",
    );
    expect(nestedFact?.transform).toEqual([1, 0, 0, 5, 0, 1, 0, 10, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it("yields name UNKNOWN for an unresolvable leaf without throwing", () => {
    const facts = flattenAssembly(fixture);
    const ghostFact = facts.find((f) => f.path[f.path.length - 1] === "ghost-part-99");
    expect(ghostFact).toBeDefined();
    expect(ghostFact?.name).toBe("UNKNOWN");
  });
});
