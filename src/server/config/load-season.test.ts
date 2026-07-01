import { describe, expect, it } from "vitest";
import { loadSeasonConfig } from "./load-season.ts";
import { SeasonConfigSchema } from "./schema.ts";

describe("loadSeasonConfig", () => {
  it("loads the 2026 season config with 4 validated rule entries", () => {
    const config = loadSeasonConfig("2026");

    expect(config.season).toBe("2026");
    expect(config.rules).toHaveLength(4);

    for (const entry of config.rules) {
      expect(entry.rule).toMatch(/^R\d+$/);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(typeof entry.limit).toBe("number");
      expect(entry.unit.length).toBeGreaterThan(0);
      expect(["max", "min"]).toContain(entry.operator);
    }

    const rules = config.rules.map((r) => r.rule);
    expect(rules).toEqual(expect.arrayContaining(["R101", "R103", "R104", "R408"]));
  });

  it("throws when a rule entry has a bad operator", () => {
    const malformed = {
      season: "2026",
      rules: [
        {
          rule: "R101",
          title: "Frame Perimeter",
          limit: 110,
          unit: "in",
          operator: "invalid-operator",
        },
      ],
    };

    expect(() => SeasonConfigSchema.parse(malformed)).toThrow();
  });

  it("throws when a rule entry has a malformed rule number", () => {
    const malformed = {
      season: "2026",
      rules: [
        {
          rule: "X99",
          title: "Not A Real Rule",
          limit: 1,
          unit: "in",
          operator: "max",
        },
      ],
    };

    expect(() => SeasonConfigSchema.parse(malformed)).toThrow();
  });

  it("throws a clear error when loading a non-existent season", () => {
    expect(() => loadSeasonConfig("9999")).toThrow();
  });
});
