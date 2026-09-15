import type { AssetProcessor } from "@modsmith/core";
import { propProcessor } from "./prop";
import { inspectProcessor } from "./inspect";
import { optimizerProcessor } from "./optimizer";
import { liveryProcessor } from "./livery";
import { retextureProcessor } from "./retexture";
import { clothingProcessor } from "./clothing";
import { weaponProcessor } from "./weapon";
import { tattooProcessor } from "./tattoo";
import { faceProcessor } from "./face";
import { accessoryProcessor } from "./accessory";
import { carImporterProcessor } from "./car-importer";
import { vehicleProcessor } from "./vehicle";
import { aiPropProcessor } from "./ai-prop";
import { sketchfabProcessor } from "./sketchfab";

/** processor name (ProcessingJob.processor) → implementation. */
export const PROCESSORS: Record<string, AssetProcessor> = {
  prop: propProcessor,
  "ai-prop": aiPropProcessor,
  "car-importer": carImporterProcessor,
  vehicle: vehicleProcessor,
  livery: liveryProcessor,
  retexture: retextureProcessor,
  clothing: clothingProcessor,
  weapon: weaponProcessor,
  tattoo: tattooProcessor,
  face: faceProcessor,
  accessory: accessoryProcessor,
  optimizer: optimizerProcessor,
  inspect: inspectProcessor,
  sketchfab: sketchfabProcessor,
};

export function getProcessor(name: string): AssetProcessor | undefined {
  return PROCESSORS[name];
}

export const PROCESSOR_NAMES = Object.keys(PROCESSORS);
