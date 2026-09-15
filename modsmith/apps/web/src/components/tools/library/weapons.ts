/** Vanilla weapon list for the Weapon Skins editor: spawn name, display name, category and texture dictionary. */
import type { WeaponShape } from "@/components/three/procedural";

export type WeaponCategory = "melee" | "handgun" | "smg" | "shotgun" | "rifle" | "lmg" | "sniper" | "heavy" | "thrown" | "misc";

export interface WeaponEntry {
  /** WEAPON_* spawn name, stored in the export config. */
  name: string;
  label: string;
  category: WeaponCategory;
  /** Texture dictionary the skin replaces. */
  txd: string;
}

export const WEAPON_CATEGORY_LABELS: Record<WeaponCategory, string> = {
  melee: "Melee", handgun: "Handguns", smg: "Submachine guns", shotgun: "Shotguns", rifle: "Assault rifles",
  lmg: "Machine guns", sniper: "Sniper rifles", heavy: "Heavy weapons", thrown: "Thrown", misc: "Misc & gadgets",
};

export const WEAPON_SHAPES: Record<WeaponCategory, WeaponShape> = {
  melee: "melee", handgun: "pistol", smg: "smg", shotgun: "shotgun", rifle: "rifle",
  lmg: "heavy", sniper: "sniper", heavy: "heavy", thrown: "thrown", misc: "pistol",
};

const TXD_PREFIX: Record<WeaponCategory, string> = {
  melee: "w_me", handgun: "w_pi", smg: "w_sb", shotgun: "w_sg", rifle: "w_ar",
  lmg: "w_mg", sniper: "w_sr", heavy: "w_lr", thrown: "w_ex", misc: "w_am",
};

function w(name: string, label: string, category: WeaponCategory, txd?: string): WeaponEntry {
  const base = name.replace(/^(WEAPON|GADGET)_/, "").toLowerCase().replace(/_/g, "");
  return { name, label, category, txd: txd ?? `${TXD_PREFIX[category]}_${base}` };
}

export const WEAPONS: WeaponEntry[] = [
  // Melee
  w("WEAPON_KNIFE", "Knife", "melee"),
  w("WEAPON_NIGHTSTICK", "Nightstick", "melee"),
  w("WEAPON_HAMMER", "Hammer", "melee"),
  w("WEAPON_BAT", "Baseball bat", "melee"),
  w("WEAPON_GOLFCLUB", "Golf club", "melee"),
  w("WEAPON_CROWBAR", "Crowbar", "melee"),
  w("WEAPON_BOTTLE", "Broken bottle", "melee"),
  w("WEAPON_DAGGER", "Antique cavalry dagger", "melee"),
  w("WEAPON_HATCHET", "Hatchet", "melee"),
  w("WEAPON_KNUCKLE", "Brass knuckles", "melee"),
  w("WEAPON_MACHETE", "Machete", "melee"),
  w("WEAPON_FLASHLIGHT", "Flashlight", "melee"),
  w("WEAPON_SWITCHBLADE", "Switchblade", "melee"),
  w("WEAPON_POOLCUE", "Pool cue", "melee"),
  w("WEAPON_WRENCH", "Pipe wrench", "melee"),
  w("WEAPON_BATTLEAXE", "Battle axe", "melee"),
  w("WEAPON_STONE_HATCHET", "Stone hatchet", "melee"),
  w("WEAPON_CANDYCANE", "Candy cane", "melee"),
  // Handguns
  w("WEAPON_PISTOL", "Pistol", "handgun"),
  w("WEAPON_PISTOL_MK2", "Pistol Mk II", "handgun"),
  w("WEAPON_COMBATPISTOL", "Combat pistol", "handgun"),
  w("WEAPON_APPISTOL", "AP pistol", "handgun"),
  w("WEAPON_STUNGUN", "Stun gun", "handgun"),
  w("WEAPON_PISTOL50", "Pistol .50", "handgun"),
  w("WEAPON_SNSPISTOL", "SNS pistol", "handgun"),
  w("WEAPON_SNSPISTOL_MK2", "SNS pistol Mk II", "handgun"),
  w("WEAPON_HEAVYPISTOL", "Heavy pistol", "handgun"),
  w("WEAPON_VINTAGEPISTOL", "Vintage pistol", "handgun"),
  w("WEAPON_FLAREGUN", "Flare gun", "handgun"),
  w("WEAPON_MARKSMANPISTOL", "Marksman pistol", "handgun"),
  w("WEAPON_REVOLVER", "Heavy revolver", "handgun"),
  w("WEAPON_REVOLVER_MK2", "Heavy revolver Mk II", "handgun"),
  w("WEAPON_DOUBLEACTION", "Double-action revolver", "handgun"),
  w("WEAPON_RAYPISTOL", "Up-n-Atomizer", "handgun"),
  w("WEAPON_CERAMICPISTOL", "Ceramic pistol", "handgun"),
  w("WEAPON_NAVYREVOLVER", "Navy revolver", "handgun"),
  w("WEAPON_GADGETPISTOL", "Perico pistol", "handgun"),
  w("WEAPON_PISTOLXM3", "WM 29 pistol", "handgun"),
  // SMGs
  w("WEAPON_MICROSMG", "Micro SMG", "smg"),
  w("WEAPON_SMG", "SMG", "smg"),
  w("WEAPON_SMG_MK2", "SMG Mk II", "smg"),
  w("WEAPON_ASSAULTSMG", "Assault SMG", "smg"),
  w("WEAPON_COMBATPDW", "Combat PDW", "smg"),
  w("WEAPON_MACHINEPISTOL", "Machine pistol", "smg"),
  w("WEAPON_MINISMG", "Mini SMG", "smg"),
  w("WEAPON_RAYCARBINE", "Unholy Hellbringer", "smg"),
  w("WEAPON_TECPISTOL", "Tactical SMG", "smg"),
  // Shotguns
  w("WEAPON_PUMPSHOTGUN", "Pump shotgun", "shotgun"),
  w("WEAPON_PUMPSHOTGUN_MK2", "Pump shotgun Mk II", "shotgun"),
  w("WEAPON_SAWNOFFSHOTGUN", "Sawed-off shotgun", "shotgun"),
  w("WEAPON_ASSAULTSHOTGUN", "Assault shotgun", "shotgun"),
  w("WEAPON_BULLPUPSHOTGUN", "Bullpup shotgun", "shotgun"),
  w("WEAPON_MUSKET", "Musket", "shotgun"),
  w("WEAPON_HEAVYSHOTGUN", "Heavy shotgun", "shotgun"),
  w("WEAPON_DBSHOTGUN", "Double-barrel shotgun", "shotgun"),
  w("WEAPON_AUTOSHOTGUN", "Sweeper shotgun", "shotgun"),
  w("WEAPON_COMBATSHOTGUN", "Combat shotgun", "shotgun"),
  // Assault rifles
  w("WEAPON_ASSAULTRIFLE", "Assault rifle", "rifle"),
  w("WEAPON_ASSAULTRIFLE_MK2", "Assault rifle Mk II", "rifle"),
  w("WEAPON_CARBINERIFLE", "Carbine rifle", "rifle"),
  w("WEAPON_CARBINERIFLE_MK2", "Carbine rifle Mk II", "rifle"),
  w("WEAPON_ADVANCEDRIFLE", "Advanced rifle", "rifle"),
  w("WEAPON_SPECIALCARBINE", "Special carbine", "rifle"),
  w("WEAPON_SPECIALCARBINE_MK2", "Special carbine Mk II", "rifle"),
  w("WEAPON_BULLPUPRIFLE", "Bullpup rifle", "rifle"),
  w("WEAPON_BULLPUPRIFLE_MK2", "Bullpup rifle Mk II", "rifle"),
  w("WEAPON_COMPACTRIFLE", "Compact rifle", "rifle"),
  w("WEAPON_MILITARYRIFLE", "Military rifle", "rifle"),
  w("WEAPON_HEAVYRIFLE", "Heavy rifle", "rifle"),
  w("WEAPON_TACTICALRIFLE", "Service carbine", "rifle"),
  w("WEAPON_BATTLERIFLE", "Battle rifle", "rifle"),
  // Machine guns
  w("WEAPON_MG", "MG", "lmg"),
  w("WEAPON_COMBATMG", "Combat MG", "lmg"),
  w("WEAPON_COMBATMG_MK2", "Combat MG Mk II", "lmg"),
  w("WEAPON_GUSENBERG", "Gusenberg sweeper", "lmg"),
  // Sniper rifles
  w("WEAPON_SNIPERRIFLE", "Sniper rifle", "sniper"),
  w("WEAPON_HEAVYSNIPER", "Heavy sniper", "sniper"),
  w("WEAPON_HEAVYSNIPER_MK2", "Heavy sniper Mk II", "sniper"),
  w("WEAPON_MARKSMANRIFLE", "Marksman rifle", "sniper"),
  w("WEAPON_MARKSMANRIFLE_MK2", "Marksman rifle Mk II", "sniper"),
  w("WEAPON_PRECISIONRIFLE", "Precision rifle", "sniper"),
  // Heavy
  w("WEAPON_RPG", "RPG", "heavy"),
  w("WEAPON_GRENADELAUNCHER", "Grenade launcher", "heavy"),
  w("WEAPON_GRENADELAUNCHER_SMOKE", "Smoke grenade launcher", "heavy"),
  w("WEAPON_MINIGUN", "Minigun", "heavy"),
  w("WEAPON_FIREWORK", "Firework launcher", "heavy"),
  w("WEAPON_RAILGUN", "Railgun", "heavy"),
  w("WEAPON_HOMINGLAUNCHER", "Homing launcher", "heavy"),
  w("WEAPON_COMPACTLAUNCHER", "Compact grenade launcher", "heavy"),
  w("WEAPON_RAYMINIGUN", "Widowmaker", "heavy"),
  w("WEAPON_EMPLAUNCHER", "Compact EMP launcher", "heavy"),
  w("WEAPON_RAILGUNXM3", "Railgun (XM3)", "heavy"),
  // Thrown
  w("WEAPON_GRENADE", "Grenade", "thrown"),
  w("WEAPON_BZGAS", "Tear gas", "thrown"),
  w("WEAPON_MOLOTOV", "Molotov cocktail", "thrown"),
  w("WEAPON_STICKYBOMB", "Sticky bomb", "thrown"),
  w("WEAPON_PROXMINE", "Proximity mine", "thrown"),
  w("WEAPON_SNOWBALL", "Snowball", "thrown"),
  w("WEAPON_PIPEBOMB", "Pipe bomb", "thrown"),
  w("WEAPON_BALL", "Baseball", "thrown"),
  w("WEAPON_SMOKEGRENADE", "Tear gas (smoke)", "thrown"),
  w("WEAPON_FLARE", "Flare", "thrown"),
  w("WEAPON_ACIDPACKAGE", "Acid package", "thrown"),
  // Misc & gadgets
  w("WEAPON_PETROLCAN", "Jerry can", "misc"),
  w("WEAPON_FIREEXTINGUISHER", "Fire extinguisher", "misc"),
  w("WEAPON_HAZARDCAN", "Hazardous jerry can", "misc"),
  w("WEAPON_FERTILIZERCAN", "Fertilizer can", "misc"),
  w("WEAPON_METALDETECTOR", "Metal detector", "misc"),
  w("WEAPON_HACKINGDEVICE", "Hacking device", "misc"),
  w("GADGET_PARACHUTE", "Parachute", "misc"),
];

export const WEAPONS_BY_CATEGORY = (Object.keys(WEAPON_CATEGORY_LABELS) as WeaponCategory[]).map((category) => ({
  category,
  label: WEAPON_CATEGORY_LABELS[category],
  weapons: WEAPONS.filter((x) => x.category === category),
}));

export function findWeapon(name: string) {
  return WEAPONS.find((x) => x.name === name) ?? null;
}
