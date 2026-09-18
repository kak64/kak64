/**
 * Vanilla GTA V / FiveM vehicle model names, used by the car importer to detect
 * "replace" mods (a mod whose model name matches a base-game vehicle replaces it
 * rather than adding a new one).
 */
export const VANILLA_VEHICLES: string[] = [
  // Super
  "adder", "autarch", "banshee2", "bullet", "cheetah", "cyclone", "deveste", "emerus", "entity2", "entityxf",
  "fmj", "furia", "gp1", "infernus", "italigtb", "italigtb2", "krieger", "lm87", "nero", "nero2",
  "osiris", "penetrator", "pfister811", "prototipo", "reaper", "s80", "sc1", "sultanrs", "t20", "taipan",
  "tempesta", "tezeract", "tigon", "torero2", "turismor", "tyrant", "tyrus", "vacca", "vagner", "vigilante",
  "visione", "voltic", "voltic2", "xa21", "zentorno", "zorrusso", "ignus", "virtue", "entity3",
  // Sports
  "alpha", "banshee", "bestiagts", "blista2", "blista3", "buffalo", "buffalo2", "buffalo3", "carbonizzare", "comet2",
  "comet3", "comet4", "comet5", "coquette", "coquette4", "deveste", "drafter", "elegy", "elegy2", "feltzer2",
  "flashgt", "furoregt", "fusilade", "futo", "futo2", "gb200", "growler", "hotring", "imorgon", "italirsx",
  "issi7", "italigto", "jester", "jester2", "jester3", "jugular", "khamelion", "kuruma", "kuruma2", "locust",
  "lynx", "massacro", "massacro2", "neo", "neon", "ninef", "ninef2", "omnis", "paragon", "pariah",
  "penumbra", "penumbra2", "raiden", "rapidgt", "rapidgt2", "raptor", "revolter", "ruston", "schafter2", "schafter3",
  "schafter4", "schafter5", "schlagen", "schwarzer", "sentinel3", "seven70", "specter", "specter2", "streiter", "sugoi",
  "sultan", "sultan2", "surano", "tampa2", "tropos", "verlierer2", "vectre", "vstr", "zr350", "zr380",
  // Sedans / coupes
  "asea", "asterope", "cog55", "cognoscenti", "emperor", "fugitive", "glendale", "ingot", "intruder", "premier",
  "primo", "primo2", "regina", "romero", "stafford", "stanier", "stratum", "stretch", "superd", "surge",
  "tailgater", "warrener", "washington", "cogcabrio", "exemplar", "f620", "felon", "felon2", "jackal", "oracle",
  "oracle2", "sentinel", "sentinel2", "windsor", "windsor2", "zion", "zion2", "previon", "deity", "tailgater2",
  // Muscle
  "blade", "buccaneer", "buccaneer2", "chino", "chino2", "clique", "coquette3", "deviant", "dominator", "dominator2",
  "dominator3", "dukes", "dukes2", "ellie", "faction", "faction2", "faction3", "gauntlet", "gauntlet2", "hermes",
  "hotknife", "hustler", "impaler", "imperator", "lurcher", "moonbeam", "moonbeam2", "nightshade", "peyote", "phoenix",
  "picador", "vigero", "virgo", "voodoo", "voodoo2", "yosemite", "ruiner", "ruiner2", "sabregt", "sabregt2",
  "slamvan", "slamvan2", "slamvan3", "stalion", "tampa", "tulip", "vamos", "gauntlet3", "gauntlet4", "yosemite2",
  // Off-road / SUV
  "bfinjection", "bifta", "blazer", "bodhi2", "brawler", "bruiser", "dubsta3", "dune", "everon", "freecrawler",
  "insurgent", "kalahari", "kamacho", "mesa", "mesa3", "monster", "nightshark", "rancherxl", "rebel", "rebel2",
  "riata", "sandking", "sandking2", "technical", "trophytruck", "vagrant", "verus", "winky", "yosemite3", "zhaba",
  "baller", "baller2", "baller3", "bjxl", "cavalcade", "cavalcade2", "contender", "dubsta", "dubsta2", "fq2",
  "granger", "gresley", "habanero", "huntley", "landstalker", "patriot", "radi", "rocoto", "seminole", "serrano",
  "toros", "xls", "novak", "astron", "jubilee", "granger2",
  // Vans / commercial
  "bison", "bobcatxl", "burrito3", "camper", "gburrito", "journey", "minivan", "paradise", "pony", "rumpo",
  "speedo", "surfer", "taco", "youga", "youga2", "boxville", "benson", "biff", "hauler", "mule",
  "packer", "phantom", "pounder", "stockade", "flatbed", "tiptruck", "trash", "dump", "mixer", "rubble",
  // Motorcycles
  "akuma", "avarus", "bagger", "bati", "bati2", "bf400", "carbonrs", "chimera", "cliffhanger", "daemon",
  "daemon2", "defiler", "deathbike", "diabolus", "double", "enduro", "esskey", "faggio", "faggio2", "fcr",
  "fcr2", "gargoyle", "hakuchou", "hakuchou2", "hexer", "innovation", "lectro", "manchez", "nemesis", "nightblade",
  "oppressor", "oppressor2", "pcj", "ratbike", "ruffian", "sanchez", "sanctus", "shotaro", "sovereign", "thrust",
  "vader", "vindicator", "vortex", "wolfsbane", "zombiea", "manchez2", "reever", "stryder", "powersurge",
  // Emergency
  "ambulance", "fbi", "fbi2", "firetruk", "lguard", "pbus", "police", "police2", "police3", "police4",
  "policeb", "policeold1", "policeold2", "policet", "pranger", "predator", "riot", "riot2", "sheriff", "sheriff2",
  // Utility / industrial
  "airtug", "caddy", "caddy2", "caddy3", "docktug", "forklift", "mower", "ripley", "sadler", "scrap",
  "towtruck", "towtruck2", "tractor", "tractor2", "utillitruck", "utillitruck2", "utillitruck3", "guardian", "bulldozer", "cutter",
  "handler", "dock", "slamtruck",
  // Boats
  "dinghy", "dinghy2", "jetmax", "marquis", "seashark", "speeder", "squalo", "submersible", "suntrap", "toro",
  "tropic", "tug", "predator", "longfin", "avisa", "kosatka", "patrolboat",
  // Aircraft
  "alphaz1", "avenger", "besra", "blimp", "buzzard", "cargobob", "cargoplane", "cuban800", "dodo", "duster",
  "frogger", "havok", "hydra", "jet", "lazer", "luxor", "mammatus", "maverick", "microlight", "miljet",
  "molotok", "nimbus", "pyro", "rogue", "savage", "seabreeze", "shamal", "skylift", "sparrow", "starling",
  "strikeforce", "supervolito", "swift", "titan", "tula", "valkyrie", "velum", "vestra", "volatus", "annihilator",
  "akula", "hunter", "seasparrow", "streamer216", "conada", "raiju", "alkonost",
  // Military
  "apc", "barracks", "barracks2", "chernobog", "crusader", "halftrack", "khanjali", "minitank", "rhino", "scarab",
  "thruster", "trailersmall2", "vetir", "squaddie",
  // Compacts / vans misc
  "blista", "brioso", "brioso2", "brioso3", "dilettante", "issi2", "issi3", "panto", "prairie", "rhapsody",
  "club", "kanjo", "weevil", "asbo",
  // Service / transport
  "airbus", "bus", "coach", "rallytruck", "taxi", "tourbus", "trash2", "wastelander", "brickade", "brickade2",
];

const SET = new Set(VANILLA_VEHICLES.map((v) => v.toLowerCase()));

export function isVanillaVehicle(modelName: string): boolean {
  return SET.has(modelName.trim().toLowerCase().replace(/\.(yft|ytd|ydr)$/i, "").replace(/_hi$/i, ""));
}

export function vanillaVehicleCount(): number {
  return SET.size;
}

/** Rough handling class used when synthesising metadata for a converted replace mod. */
export function vehicleClassFor(modelName: string): "super" | "sports" | "sedan" | "muscle" | "suv" | "motorcycle" | "van" | "emergency" | "generic" {
  const m = modelName.toLowerCase();
  const inRange = (list: string[]) => list.includes(m);
  if (inRange(["adder", "zentorno", "t20", "osiris", "reaper", "tyrus", "vacca", "voltic", "infernus", "bullet", "cheetah", "entityxf", "fmj", "nero", "vagner", "emerus", "krieger", "ignus"])) return "super";
  if (inRange(["elegy2", "kuruma", "sultan", "jester", "massacro", "banshee", "comet2", "ninef", "futo", "penumbra", "rapidgt", "feltzer2", "carbonizzare"])) return "sports";
  if (inRange(["dominator", "gauntlet", "sabregt", "vigero", "phoenix", "ruiner", "buccaneer", "tampa", "blade", "chino", "voodoo"])) return "muscle";
  if (inRange(["baller", "cavalcade", "granger", "huntley", "landstalker", "patriot", "rocoto", "seminole", "xls", "dubsta"])) return "suv";
  if (inRange(["akuma", "bati", "pcj", "sanchez", "hakuchou", "nemesis", "vader", "double", "defiler"])) return "motorcycle";
  if (inRange(["burrito3", "rumpo", "speedo", "youga", "boxville", "pony", "minivan"])) return "van";
  if (inRange(["police", "police2", "police3", "sheriff", "fbi", "ambulance", "firetruk", "riot"])) return "emergency";
  if (inRange(["asea", "premier", "stanier", "tailgater", "washington", "stratum", "primo", "intruder", "fugitive"])) return "sedan";
  return "generic";
}
