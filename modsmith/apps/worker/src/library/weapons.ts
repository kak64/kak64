/**
 * Vanilla weapon → model/texture-dictionary mapping used by the Weapon Skins tool.
 * `txd` is the name of the weapon's texture dictionary (the .ytd that must be replaced);
 * `diffuse` is the texture inside it that carries the base colour.
 */
export interface WeaponEntry {
  /** WEAPON_* hash name. */
  weapon: string;
  /** Display name. */
  label: string;
  /** Weapon model / texture dictionary name (w_*). */
  txd: string;
  /** Primary diffuse texture inside the dictionary. */
  diffuse: string;
  category: "pistol" | "smg" | "rifle" | "shotgun" | "mg" | "sniper" | "heavy" | "throwable" | "melee" | "misc";
}

const e = (weapon: string, label: string, txd: string, category: WeaponEntry["category"], diffuse?: string): WeaponEntry => ({
  weapon,
  label,
  txd,
  diffuse: diffuse ?? txd,
  category,
});

export const WEAPONS: WeaponEntry[] = [
  // ── Pistols ─────────────────────────────────────────────
  e("WEAPON_PISTOL", "Pistol", "w_pi_pistol", "pistol"),
  e("WEAPON_PISTOL_MK2", "Pistol Mk II", "w_pi_pistol_mk2", "pistol"),
  e("WEAPON_COMBATPISTOL", "Combat Pistol", "w_pi_combatpistol", "pistol"),
  e("WEAPON_APPISTOL", "AP Pistol", "w_pi_appistol", "pistol"),
  e("WEAPON_STUNGUN", "Stun Gun", "w_pi_stungun", "pistol"),
  e("WEAPON_PISTOL50", "Pistol .50", "w_pi_pistol50", "pistol"),
  e("WEAPON_SNSPISTOL", "SNS Pistol", "w_pi_sns_pistol", "pistol"),
  e("WEAPON_SNSPISTOL_MK2", "SNS Pistol Mk II", "w_pi_sns_pistol_mk2", "pistol"),
  e("WEAPON_HEAVYPISTOL", "Heavy Pistol", "w_pi_heavypistol", "pistol"),
  e("WEAPON_VINTAGEPISTOL", "Vintage Pistol", "w_pi_vintage_pistol", "pistol"),
  e("WEAPON_FLAREGUN", "Flare Gun", "w_pi_flaregun", "pistol"),
  e("WEAPON_MARKSMANPISTOL", "Marksman Pistol", "w_pi_singleshot", "pistol"),
  e("WEAPON_REVOLVER", "Heavy Revolver", "w_pi_revolver", "pistol"),
  e("WEAPON_REVOLVER_MK2", "Heavy Revolver Mk II", "w_pi_revolver_mk2", "pistol"),
  e("WEAPON_DOUBLEACTION", "Double Action Revolver", "w_pi_wep2_gun", "pistol"),
  e("WEAPON_RAYPISTOL", "Up-n-Atomizer", "w_pi_raygun", "pistol"),
  e("WEAPON_CERAMICPISTOL", "Ceramic Pistol", "w_pi_ceramicpistol", "pistol"),
  e("WEAPON_NAVYREVOLVER", "Navy Revolver", "w_pi_wep1_gun", "pistol"),
  e("WEAPON_GADGETPISTOL", "Perico Pistol", "w_pi_sbpistol", "pistol"),
  e("WEAPON_PISTOLXM3", "WM 29 Pistol", "w_pi_pistolxm3", "pistol"),
  e("WEAPON_STUNGUN_MP", "Stun Gun (MP)", "w_pi_stungun", "pistol"),
  // ── SMGs ────────────────────────────────────────────────
  e("WEAPON_MICROSMG", "Micro SMG", "w_sb_microsmg", "smg"),
  e("WEAPON_SMG", "SMG", "w_sb_smg", "smg"),
  e("WEAPON_SMG_MK2", "SMG Mk II", "w_sb_smg_mk2", "smg"),
  e("WEAPON_ASSAULTSMG", "Assault SMG", "w_sb_assaultsmg", "smg"),
  e("WEAPON_COMBATPDW", "Combat PDW", "w_sb_pdw", "smg"),
  e("WEAPON_MACHINEPISTOL", "Machine Pistol", "w_sb_compactsmg", "smg"),
  e("WEAPON_MINISMG", "Mini SMG", "w_sb_minismg", "smg"),
  e("WEAPON_GUSENBERG", "Gusenberg Sweeper", "w_sb_gusenberg", "smg"),
  e("WEAPON_TECPISTOL", "Tactical SMG", "w_sb_tecpistol", "smg"),
  // ── Assault rifles ──────────────────────────────────────
  e("WEAPON_ASSAULTRIFLE", "Assault Rifle", "w_ar_assaultrifle", "rifle"),
  e("WEAPON_ASSAULTRIFLE_MK2", "Assault Rifle Mk II", "w_ar_assaultrifle_mk2", "rifle"),
  e("WEAPON_CARBINERIFLE", "Carbine Rifle", "w_ar_carbinerifle", "rifle"),
  e("WEAPON_CARBINERIFLE_MK2", "Carbine Rifle Mk II", "w_ar_carbinerifle_mk2", "rifle"),
  e("WEAPON_ADVANCEDRIFLE", "Advanced Rifle", "w_ar_advancedrifle", "rifle"),
  e("WEAPON_SPECIALCARBINE", "Special Carbine", "w_ar_specialcarbine", "rifle"),
  e("WEAPON_SPECIALCARBINE_MK2", "Special Carbine Mk II", "w_ar_specialcarbine_mk2", "rifle"),
  e("WEAPON_BULLPUPRIFLE", "Bullpup Rifle", "w_ar_bullpuprifle", "rifle"),
  e("WEAPON_BULLPUPRIFLE_MK2", "Bullpup Rifle Mk II", "w_ar_bullpuprifle_mk2", "rifle"),
  e("WEAPON_COMPACTRIFLE", "Compact Rifle", "w_ar_assaultrifle_smg", "rifle"),
  e("WEAPON_MILITARYRIFLE", "Military Rifle", "w_ar_militaryrifle", "rifle"),
  e("WEAPON_HEAVYRIFLE", "Heavy Rifle", "w_ar_heavyrifle", "rifle"),
  e("WEAPON_TACTICALRIFLE", "Service Carbine", "w_ar_tacticalrifle", "rifle"),
  e("WEAPON_MUSKET", "Musket", "w_ar_musket", "rifle"),
  e("WEAPON_RAYCARBINE", "Unholy Hellbringer", "w_ar_raycarbine", "rifle"),
  e("WEAPON_BATTLERIFLE", "Battle Rifle", "w_ar_battlerifle", "rifle"),
  // ── Shotguns ────────────────────────────────────────────
  e("WEAPON_PUMPSHOTGUN", "Pump Shotgun", "w_sg_pumpshotgun", "shotgun"),
  e("WEAPON_PUMPSHOTGUN_MK2", "Pump Shotgun Mk II", "w_sg_pumpshotgun_mk2", "shotgun"),
  e("WEAPON_SAWNOFFSHOTGUN", "Sawed-Off Shotgun", "w_sg_sawnoff", "shotgun"),
  e("WEAPON_ASSAULTSHOTGUN", "Assault Shotgun", "w_sg_assaultshotgun", "shotgun"),
  e("WEAPON_BULLPUPSHOTGUN", "Bullpup Shotgun", "w_sg_bullpupshotgun", "shotgun"),
  e("WEAPON_HEAVYSHOTGUN", "Heavy Shotgun", "w_sg_heavyshotgun", "shotgun"),
  e("WEAPON_DBSHOTGUN", "Double Barrel Shotgun", "w_sg_doublebarrel", "shotgun"),
  e("WEAPON_AUTOSHOTGUN", "Sweeper Shotgun", "w_sg_sweeper", "shotgun"),
  e("WEAPON_COMBATSHOTGUN", "Combat Shotgun", "w_sg_pumpshotgun_lr", "shotgun"),
  // ── Machine guns ────────────────────────────────────────
  e("WEAPON_MG", "MG", "w_mg_mg", "mg"),
  e("WEAPON_COMBATMG", "Combat MG", "w_mg_combatmg", "mg"),
  e("WEAPON_COMBATMG_MK2", "Combat MG Mk II", "w_mg_combatmg_mk2", "mg"),
  e("WEAPON_MINIGUN", "Minigun", "w_mg_minigun", "mg"),
  e("WEAPON_RAYMINIGUN", "Widowmaker", "w_mg_raygun", "mg"),
  // ── Sniper rifles ───────────────────────────────────────
  e("WEAPON_SNIPERRIFLE", "Sniper Rifle", "w_sr_sniperrifle", "sniper"),
  e("WEAPON_HEAVYSNIPER", "Heavy Sniper", "w_sr_heavysniper", "sniper"),
  e("WEAPON_HEAVYSNIPER_MK2", "Heavy Sniper Mk II", "w_sr_heavysniper_mk2", "sniper"),
  e("WEAPON_MARKSMANRIFLE", "Marksman Rifle", "w_sr_marksmanrifle", "sniper"),
  e("WEAPON_MARKSMANRIFLE_MK2", "Marksman Rifle Mk II", "w_sr_marksmanrifle_mk2", "sniper"),
  e("WEAPON_PRECISIONRIFLE", "Precision Rifle", "w_sr_precisionrifle", "sniper"),
  // ── Heavy weapons ───────────────────────────────────────
  e("WEAPON_RPG", "RPG", "w_lr_rpg", "heavy"),
  e("WEAPON_GRENADELAUNCHER", "Grenade Launcher", "w_lr_grenadelauncher", "heavy"),
  e("WEAPON_GRENADELAUNCHER_SMOKE", "Smoke Grenade Launcher", "w_lr_grenadelauncher", "heavy"),
  e("WEAPON_FIREWORK", "Firework Launcher", "w_lr_firework", "heavy"),
  e("WEAPON_RAILGUN", "Railgun", "w_ar_railgun", "heavy"),
  e("WEAPON_HOMINGLAUNCHER", "Homing Launcher", "w_lr_homing", "heavy"),
  e("WEAPON_COMPACTLAUNCHER", "Compact Grenade Launcher", "w_lr_compactgl", "heavy"),
  e("WEAPON_RAILGUNXM3", "Railgun XM3", "w_ar_railgunxm3", "heavy"),
  // ── Throwables ──────────────────────────────────────────
  e("WEAPON_GRENADE", "Grenade", "w_ex_grenadefrag", "throwable"),
  e("WEAPON_STICKYBOMB", "Sticky Bomb", "w_ex_pe", "throwable"),
  e("WEAPON_SMOKEGRENADE", "Tear Gas", "w_ex_grenadesmoke", "throwable"),
  e("WEAPON_BZGAS", "BZ Gas", "w_ex_grenadesmoke", "throwable"),
  e("WEAPON_MOLOTOV", "Molotov Cocktail", "w_ex_molotov", "throwable"),
  e("WEAPON_FLARE", "Flare", "w_ex_flare", "throwable"),
  e("WEAPON_PROXMINE", "Proximity Mine", "w_ex_apmine", "throwable"),
  e("WEAPON_PIPEBOMB", "Pipe Bomb", "w_ex_pipebomb", "throwable"),
  e("WEAPON_SNOWBALL", "Snowball", "w_ex_snowball", "throwable"),
  e("WEAPON_BALL", "Baseball", "w_am_baseball", "throwable"),
  // ── Melee ───────────────────────────────────────────────
  e("WEAPON_KNIFE", "Knife", "w_me_knife_01", "melee"),
  e("WEAPON_NIGHTSTICK", "Nightstick", "w_me_nightstick", "melee"),
  e("WEAPON_HAMMER", "Hammer", "w_me_hammer", "melee"),
  e("WEAPON_BAT", "Baseball Bat", "w_me_bat", "melee"),
  e("WEAPON_GOLFCLUB", "Golf Club", "w_me_gclub", "melee"),
  e("WEAPON_CROWBAR", "Crowbar", "w_me_crowbar", "melee"),
  e("WEAPON_BOTTLE", "Broken Bottle", "w_me_bottle", "melee"),
  e("WEAPON_DAGGER", "Antique Cavalry Dagger", "w_me_dagger", "melee"),
  e("WEAPON_HATCHET", "Hatchet", "w_me_hatchet", "melee"),
  e("WEAPON_KNUCKLE", "Brass Knuckles", "w_me_knuckle", "melee"),
  e("WEAPON_MACHETE", "Machete", "w_me_machette", "melee"),
  e("WEAPON_SWITCHBLADE", "Switchblade", "w_me_switchblade", "melee"),
  e("WEAPON_BATTLEAXE", "Battle Axe", "w_me_battleaxe", "melee"),
  e("WEAPON_POOLCUE", "Pool Cue", "w_me_poolcue", "melee"),
  e("WEAPON_WRENCH", "Pipe Wrench", "w_me_wrench", "melee"),
  e("WEAPON_STONE_HATCHET", "Stone Hatchet", "w_me_stonehatchet", "melee"),
  e("WEAPON_FLASHLIGHT", "Flashlight", "w_me_flashlight", "melee"),
  e("WEAPON_CANDYCANE", "Candy Cane", "w_me_candycane", "melee"),
  e("WEAPON_ACIDPACKAGE", "Acid Package", "w_am_acidpackage", "melee"),
  // ── Tools / misc ────────────────────────────────────────
  e("WEAPON_PETROLCAN", "Jerry Can", "w_am_jerrycan", "misc"),
  e("WEAPON_FIREEXTINGUISHER", "Fire Extinguisher", "w_am_fire_exting", "misc"),
  e("WEAPON_HAZARDCAN", "Hazardous Jerry Can", "w_am_jerrycan", "misc"),
  e("WEAPON_FERTILIZERCAN", "Fertilizer Can", "w_am_jerrycan", "misc"),
  e("WEAPON_METALDETECTOR", "Metal Detector", "w_am_metaldetector", "misc"),
  e("WEAPON_HACKINGDEVICE", "Hacking Device", "w_am_hackingdevice", "misc"),
  e("WEAPON_PARACHUTE", "Parachute", "p_parachute_s", "misc"),
  e("GADGET_PARACHUTE", "Parachute (gadget)", "p_parachute_s", "misc"),
];

export const WEAPONS_BY_NAME: Record<string, WeaponEntry> = Object.fromEntries(WEAPONS.map((w) => [w.weapon.toUpperCase(), w]));

/** Look up a weapon by WEAPON_* name, plain name ("pistol") or model name ("w_pi_pistol"). */
export function findWeapon(input: string): WeaponEntry | undefined {
  const key = input.trim().toUpperCase();
  const direct = WEAPONS_BY_NAME[key] ?? WEAPONS_BY_NAME[`WEAPON_${key}`];
  if (direct) return direct;
  const lower = input.trim().toLowerCase();
  return WEAPONS.find((w) => w.txd === lower || w.label.toLowerCase() === lower);
}
