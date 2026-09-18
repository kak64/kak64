import { describe, expect, it } from "vitest";
import { detectReplace } from "../processors/car-importer";
import { buildVehiclesMeta, readModelNames, rewriteMetaIdentifiers } from "./vehicle-meta";
import { isVanillaVehicle, vanillaVehicleCount, vehicleClassFor, VANILLA_VEHICLES } from "./vehicles";

describe("isVanillaVehicle", () => {
  it("knows a few hundred base-game models", () => {
    expect(vanillaVehicleCount()).toBeGreaterThan(280);
    expect(new Set(VANILLA_VEHICLES).size).toBe(vanillaVehicleCount());
  });

  it("matches base-game names case-insensitively and ignores file suffixes", () => {
    for (const name of ["adder", "ADDER", "sultan", "police3", "elegy2", "kuruma"]) {
      expect(isVanillaVehicle(name)).toBe(true);
    }
    expect(isVanillaVehicle("adder.yft")).toBe(true);
    expect(isVanillaVehicle("adder_hi")).toBe(true);
  });

  it("does not match add-on names", () => {
    for (const name of ["adder_ms", "my_custom_supra", "rx7fd", "police_lspd_2020"]) {
      expect(isVanillaVehicle(name)).toBe(false);
    }
  });
});

describe("vehicleClassFor", () => {
  it("maps known models to a handling class and falls back to generic", () => {
    expect(vehicleClassFor("adder")).toBe("super");
    expect(vehicleClassFor("kuruma")).toBe("sports");
    expect(vehicleClassFor("dominator")).toBe("muscle");
    expect(vehicleClassFor("baller")).toBe("suv");
    expect(vehicleClassFor("bati")).toBe("motorcycle");
    expect(vehicleClassFor("police")).toBe("emergency");
    expect(vehicleClassFor("totally_unknown")).toBe("generic");
  });
});

describe("detectReplace", () => {
  const yft = (name: string) => ({ name: `${name}.yft`, data: Buffer.alloc(4) });

  it("treats a mod without vehicles.meta as a replace", () => {
    const result = detectReplace({ vehicleFiles: [yft("adder")], metaFiles: [], audioFiles: [] });
    expect(result.replaceDetected).toBe(true);
    expect(result.originalModel).toBe("adder");
    expect(result.reason).toMatch(/no vehicles.meta/i);
  });

  it("treats a vanilla model name in vehicles.meta as a replace", () => {
    const meta = { name: "vehicles.meta", text: buildVehiclesMeta({ spawnName: "sultan" }) };
    const result = detectReplace({ vehicleFiles: [yft("sultan")], metaFiles: [meta], audioFiles: [] });
    expect(result.replaceDetected).toBe(true);
    expect(result.originalModel).toBe("sultan");
    expect(result.reason).toMatch(/base-game/i);
  });

  it("treats a non-vanilla model name in vehicles.meta as an add-on", () => {
    const meta = { name: "vehicles.meta", text: buildVehiclesMeta({ spawnName: "supra_mk4" }) };
    const result = detectReplace({ vehicleFiles: [yft("supra_mk4")], metaFiles: [meta], audioFiles: [] });
    expect(result.replaceDetected).toBe(false);
    expect(result.originalModel).toBe("supra_mk4");
  });

  it("ignores the _hi model when naming the vehicle", () => {
    const result = detectReplace({ vehicleFiles: [yft("adder_hi"), yft("adder")], metaFiles: [], audioFiles: [] });
    expect(result.originalModel).toBe("adder");
  });
});

describe("vehicle meta templates", () => {
  it("builds vehicles.meta carrying every identifier the game needs", () => {
    const xml = buildVehiclesMeta({ spawnName: "adder_ms", txdName: "adder_ms", handlingId: "adder_ms", audioNameHash: "adder", vehicleClass: "super" });
    expect(xml).toContain("<modelName>adder_ms</modelName>");
    expect(xml).toContain("<txdName>adder_ms</txdName>");
    expect(xml).toContain("<handlingId>adder_ms</handlingId>");
    expect(xml).toContain("<audioNameHash>adder</audioNameHash>");
    expect(xml).toContain("<vehicleClass>VC_SUPER</vehicleClass>");
    expect(readModelNames(xml)).toEqual(["adder_ms"]);
  });

  it("rewrites identifiers when converting a replace mod", () => {
    const original = buildVehiclesMeta({ spawnName: "sultan", audioNameHash: "sultan" });
    const rewritten = rewriteMetaIdentifiers(original, { modelName: "sultan_ms", txdName: "sultan_ms", handlingId: "sultan_ms", gameName: "SULTAN_MS", audioNameHash: "sultan" });
    expect(readModelNames(rewritten)).toEqual(["sultan_ms"]);
    expect(rewritten).toContain("<txdName>sultan_ms</txdName>");
    expect(rewritten).toContain("<gameName>SULTAN_MS</gameName>");
    // The original audio hash is preserved so engine sound survives the conversion.
    expect(rewritten).toContain("<audioNameHash>sultan</audioNameHash>");
  });
});
