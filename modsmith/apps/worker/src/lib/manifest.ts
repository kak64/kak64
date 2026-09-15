/**
 * fxmanifest.lua generators. Every resource Modsmith emits is a plain FiveM resource:
 * fx_version 'cerulean', game 'gta5', a `files` list for streamed metadata and the
 * matching `data_file` declarations.
 */

export interface ManifestOptions {
  name: string;
  author?: string;
  description?: string;
  version?: string;
  files?: string[];
  dataFiles?: [type: string, path: string][];
  clientScripts?: string[];
  serverScripts?: string[];
  sharedScripts?: string[];
  /** Extra raw lines appended verbatim (already Lua). */
  extra?: string[];
  /** Emit `this_is_a_map 'yes'` for map/ytyp resources. */
  isMap?: boolean;
}

const luaStr = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

function luaList(label: string, items: string[]): string {
  if (!items.length) return "";
  if (items.length === 1) return `${label} ${luaStr(items[0]!)}\n`;
  return `${label} {\n${items.map((f) => `    ${luaStr(f)},`).join("\n")}\n}\n`;
}

export function buildFxManifest(opts: ManifestOptions): string {
  const lines: string[] = [];
  lines.push("fx_version 'cerulean'");
  lines.push("game 'gta5'");
  lines.push("");
  lines.push(`name ${luaStr(opts.name)}`);
  lines.push(`author ${luaStr(opts.author ?? "Modsmith")}`);
  lines.push(`description ${luaStr(opts.description ?? `${opts.name} — built with Modsmith`)}`);
  lines.push(`version ${luaStr(opts.version ?? "1.0.0")}`);
  lines.push("");
  if (opts.isMap) lines.push("this_is_a_map 'yes'", "");
  if (opts.files?.length) lines.push(luaList("files", opts.files).trimEnd(), "");
  for (const [type, file] of opts.dataFiles ?? []) lines.push(`data_file ${luaStr(type)} ${luaStr(file)}`);
  if (opts.dataFiles?.length) lines.push("");
  if (opts.sharedScripts?.length) lines.push(luaList("shared_scripts", opts.sharedScripts).trimEnd(), "");
  if (opts.clientScripts?.length) lines.push(luaList("client_scripts", opts.clientScripts).trimEnd(), "");
  if (opts.serverScripts?.length) lines.push(luaList("server_scripts", opts.serverScripts).trimEnd(), "");
  if (opts.extra?.length) lines.push(...opts.extra, "");
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/** Prop resource: streamed .ydr/.ytd/.ybn plus the .ytyp declared as DLC_ITYP_REQUEST. */
export function propManifest(opts: { resourceName: string; ytypFile?: string; author?: string; clientScripts?: string[]; description?: string }): string {
  return buildFxManifest({
    name: opts.resourceName,
    author: opts.author,
    description: opts.description ?? `${opts.resourceName} prop — built with Modsmith`,
    files: opts.ytypFile ? [opts.ytypFile] : [],
    dataFiles: opts.ytypFile ? [["DLC_ITYP_REQUEST", opts.ytypFile]] : [],
    clientScripts: opts.clientScripts,
    isMap: false,
  });
}

export interface VehicleManifestOptions {
  resourceName: string;
  author?: string;
  metaDir?: string; // default "data"
  vehiclesMeta?: boolean;
  handlingMeta?: boolean;
  carcolsMeta?: boolean;
  carvariationsMeta?: boolean;
  vehicleLayoutsMeta?: boolean;
  audio?: { gameData?: string[]; soundData?: string[]; wavePacks?: string[] };
  clientScripts?: string[];
  extraFiles?: string[];
}

/** Add-on vehicle resource with metadata + optional audio declarations. */
export function vehicleManifest(opts: VehicleManifestOptions): string {
  const dir = opts.metaDir ?? "data";
  const files: string[] = [];
  const dataFiles: [string, string][] = [];
  const add = (enabled: boolean | undefined, file: string, type: string) => {
    if (!enabled) return;
    files.push(`${dir}/${file}`);
    dataFiles.push([type, `${dir}/${file}`]);
  };
  add(opts.handlingMeta, "handling.meta", "HANDLING_FILE");
  add(opts.vehiclesMeta, "vehicles.meta", "VEHICLE_METADATA_FILE");
  add(opts.carcolsMeta, "carcols.meta", "CARCOLS_FILE");
  add(opts.carvariationsMeta, "carvariations.meta", "VEHICLE_VARIATION_FILE");
  add(opts.vehicleLayoutsMeta, "vehiclelayouts.meta", "VEHICLE_LAYOUTS_FILE");
  for (const g of opts.audio?.gameData ?? []) {
    files.push(`audioconfig/${g}.dat151.rel`);
    dataFiles.push(["AUDIO_GAMEDATA", `audioconfig/${g}.dat151.rel`]);
  }
  for (const s of opts.audio?.soundData ?? []) {
    files.push(`audioconfig/${s}.dat54.rel`);
    dataFiles.push(["AUDIO_SOUNDDATA", `audioconfig/${s}.dat54.rel`]);
  }
  for (const w of opts.audio?.wavePacks ?? []) dataFiles.push(["AUDIO_WAVEPACK", `sfx/${w}`]);
  files.push(...(opts.extraFiles ?? []));
  return buildFxManifest({
    name: opts.resourceName,
    author: opts.author,
    description: `${opts.resourceName} add-on vehicle — packaged with Modsmith`,
    files,
    dataFiles,
    clientScripts: opts.clientScripts,
  });
}

/** Add-on clothing: the .ymt/meta files are listed in `files`; FiveM streams the ydd/ytd. */
export function clothingManifest(opts: { resourceName: string; author?: string; metaFiles: string[]; clientScripts?: string[] }): string {
  return buildFxManifest({
    name: opts.resourceName,
    author: opts.author,
    description: `${opts.resourceName} clothing — built with Modsmith`,
    files: opts.metaFiles,
    clientScripts: opts.clientScripts,
  });
}

export function weaponManifest(opts: { resourceName: string; author?: string; weaponCount: number }): string {
  return buildFxManifest({
    name: opts.resourceName,
    author: opts.author,
    description: `${opts.weaponCount} weapon skin${opts.weaponCount === 1 ? "" : "s"} — built with Modsmith`,
  });
}

/** Tattoo/overlay pack: the overlay XML is declared as PED_OVERLAY_FILE. */
export function tattooManifest(opts: { resourceName: string; author?: string; overlayFile: string; extraFiles?: string[] }): string {
  return buildFxManifest({
    name: opts.resourceName,
    author: opts.author,
    description: `${opts.resourceName} tattoo pack — built with Modsmith`,
    files: [opts.overlayFile, ...(opts.extraFiles ?? [])],
    dataFiles: [["PED_OVERLAY_FILE", opts.overlayFile]],
  });
}

export function faceManifest(opts: { resourceName: string; author?: string; metaFiles?: string[] }): string {
  return buildFxManifest({
    name: opts.resourceName,
    author: opts.author,
    description: `${opts.resourceName} head texture — built with Modsmith`,
    files: opts.metaFiles ?? [],
  });
}

/** Vehicle tuning / spawn helper scripts are plain client scripts. */
export function scriptOnlyManifest(opts: { resourceName: string; author?: string; clientScripts: string[]; description?: string }): string {
  return buildFxManifest({ name: opts.resourceName, author: opts.author, description: opts.description, clientScripts: opts.clientScripts });
}
