import { describe, expect, it } from "vitest";
import { buildFxManifest, clothingManifest, propManifest, tattooManifest, vehicleManifest, weaponManifest } from "./manifest";

describe("buildFxManifest", () => {
  it("always declares fx_version and game", () => {
    const lua = buildFxManifest({ name: "my_res" });
    expect(lua.startsWith("fx_version 'cerulean'")).toBe(true);
    expect(lua).toContain("game 'gta5'");
    expect(lua).toContain("name 'my_res'");
    expect(lua.endsWith("\n")).toBe(true);
  });

  it("writes a single file as a scalar and several as a table", () => {
    expect(buildFxManifest({ name: "r", files: ["a.ytyp"] })).toContain("files 'a.ytyp'");
    const many = buildFxManifest({ name: "r", files: ["a.ytyp", "b.meta"] });
    expect(many).toContain("files {");
    expect(many).toContain("    'a.ytyp',");
    expect(many).toContain("    'b.meta',");
  });

  it("escapes quotes in names", () => {
    expect(buildFxManifest({ name: "it's" })).toContain("name 'it\\'s'");
  });
});

describe("propManifest", () => {
  it("declares the ytyp with DLC_ITYP_REQUEST", () => {
    const lua = propManifest({ resourceName: "my_prop", ytypFile: "stream/my_prop.ytyp", clientScripts: ["client/spawn.lua"] });
    expect(lua).toContain("files 'stream/my_prop.ytyp'");
    expect(lua).toContain("data_file 'DLC_ITYP_REQUEST' 'stream/my_prop.ytyp'");
    expect(lua).toContain("client_scripts 'client/spawn.lua'");
  });

  it("omits the data_file when no binary ytyp was produced", () => {
    const lua = propManifest({ resourceName: "my_prop" });
    expect(lua).not.toContain("DLC_ITYP_REQUEST");
    expect(lua).toContain("name 'my_prop'");
  });
});

describe("vehicleManifest", () => {
  it("declares each meta file with its data_file type", () => {
    const lua = vehicleManifest({
      resourceName: "adder_ms",
      vehiclesMeta: true,
      handlingMeta: true,
      carcolsMeta: true,
      carvariationsMeta: true,
      vehicleLayoutsMeta: true,
    });
    expect(lua).toContain("data_file 'HANDLING_FILE' 'data/handling.meta'");
    expect(lua).toContain("data_file 'VEHICLE_METADATA_FILE' 'data/vehicles.meta'");
    expect(lua).toContain("data_file 'CARCOLS_FILE' 'data/carcols.meta'");
    expect(lua).toContain("data_file 'VEHICLE_VARIATION_FILE' 'data/carvariations.meta'");
    expect(lua).toContain("data_file 'VEHICLE_LAYOUTS_FILE' 'data/vehiclelayouts.meta'");
    expect(lua).toContain("'data/vehicles.meta',");
  });

  it("declares audio game data, sound data and wave packs", () => {
    const lua = vehicleManifest({ resourceName: "adder_ms", audio: { gameData: ["adder_game"], soundData: ["adder_sounds"], wavePacks: ["dlc_adder"] } });
    expect(lua).toContain("data_file 'AUDIO_GAMEDATA' 'audioconfig/adder_game.dat151.rel'");
    expect(lua).toContain("data_file 'AUDIO_SOUNDDATA' 'audioconfig/adder_sounds.dat54.rel'");
    expect(lua).toContain("data_file 'AUDIO_WAVEPACK' 'sfx/dlc_adder'");
  });

  it("omits metadata that the resource does not have", () => {
    const lua = vehicleManifest({ resourceName: "plain" });
    expect(lua).not.toContain("data_file");
  });
});

describe("other resource manifests", () => {
  it("declares PED_OVERLAY_FILE for tattoo packs", () => {
    const lua = tattooManifest({ resourceName: "ms_tats", overlayFile: "ms_tats_overlay.xml" });
    expect(lua).toContain("data_file 'PED_OVERLAY_FILE' 'ms_tats_overlay.xml'");
    expect(lua).toContain("files 'ms_tats_overlay.xml'");
  });

  it("lists clothing metadata files", () => {
    const lua = clothingManifest({ resourceName: "ms_clothes", metaFiles: ["mp_m_freemode_01_jbib.ymt.xml"] });
    expect(lua).toContain("files 'mp_m_freemode_01_jbib.ymt.xml'");
  });

  it("describes a weapon skin pack", () => {
    const lua = weaponManifest({ resourceName: "ms_skins", weaponCount: 3 });
    expect(lua).toContain("name 'ms_skins'");
    expect(lua).toContain("3 weapon skins");
  });
});
