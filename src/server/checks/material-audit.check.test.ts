import { describe, expect, it } from "vitest";
import { materialAuditCheck } from "./material-audit.check.ts";
import type { Fact } from "../traversal/facts.ts";
import type { SeasonConfig } from "../config/schema.ts";

// The audit is a CADChecker-internal trust gate, not a Game-Manual numeric
// limit, so it does not read a limit entry from the season config -- an
// empty rules array is a valid input.
const config: SeasonConfig = { season: "2026", rules: [] };

function fact(overrides: Partial<Fact> & Pick<Fact, "partId" | "name">): Fact {
  return {
    transform: [],
    path: [overrides.partId],
    ...overrides,
  };
}

describe("materialAuditCheck", () => {
  it("FAILs and lists every non-BATTERY_ part with a KNOWN-missing material (D-08)", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail", materialAssigned: false }),
      fact({ partId: "p2", name: "MECH_gearbox", materialAssigned: false }),
      fact({ partId: "p3", name: "FRAME_ok", materialAssigned: true }),
    ];

    const verdict = materialAuditCheck(facts, config);

    expect(verdict.status).toBe("FAIL");
    expect(verdict.affectedPartCount).toBe(2);
    expect(verdict.affectedParts).toEqual([
      { name: "FRAME_rail", path: ["p1"] },
      { name: "MECH_gearbox", path: ["p2"] },
    ]);
  });

  it("PASSes with an empty affectedParts list when every non-BATTERY_ part has a material", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true }),
      fact({ partId: "p2", name: "MECH_gearbox", materialAssigned: true }),
    ];

    const verdict = materialAuditCheck(facts, config);

    expect(verdict.status).toBe("PASS");
    expect(verdict.affectedPartCount).toBe(0);
    expect(verdict.affectedParts).toEqual([]);
  });

  it("excludes a BATTERY_-prefixed part from the audit even when it is missing material (D-07)", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "BATTERY_main", materialAssigned: false }),
      fact({ partId: "p2", name: "FRAME_rail", materialAssigned: true }),
    ];

    const verdict = materialAuditCheck(facts, config);

    expect(verdict.status).toBe("PASS");
    expect(verdict.affectedPartCount).toBe(0);
  });

  it("does not report an UNRESOLVED part (materialAssigned undefined) as missing material", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "MECH_referenced", materialAssigned: undefined }),
      fact({ partId: "p2", name: "FRAME_rail", materialAssigned: true }),
    ];

    const verdict = materialAuditCheck(facts, config);

    expect(verdict.status).toBe("PASS");
    expect(verdict.affectedPartCount).toBe(0);
  });

  it("always returns caveats as an array and never sets a weight measured value", () => {
    const facts: Fact[] = [fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true })];

    const verdict = materialAuditCheck(facts, config);

    expect(verdict.caveats).toEqual([]);
    expect(verdict.measured).toBeUndefined();
  });
});
