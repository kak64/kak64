import { escapeXml } from "../lib/xml";
import { vehicleClassFor } from "./vehicles";

export interface HandlingPreset {
  mass: number;
  driveForce: number;
  topSpeed: number;
  brakeForce: number;
  tractionMax: number;
  tractionMin: number;
  suspensionRaise: number;
  driveBias: number; // 0 = RWD, 1 = FWD, 0.5 = AWD
  gears: number;
  handlingFlags: string;
  modelFlags: string;
}

/** Sensible per-class handling baselines used when a replace mod ships no handling.meta. */
export const HANDLING_PRESETS: Record<ReturnType<typeof vehicleClassFor>, HandlingPreset> = {
  super: { mass: 1500, driveForce: 0.35, topSpeed: 145, brakeForce: 1.2, tractionMax: 2.6, tractionMin: 2.3, suspensionRaise: 0, driveBias: 0.4, gears: 7, handlingFlags: "440010", modelFlags: "440010" },
  sports: { mass: 1400, driveForce: 0.3, topSpeed: 135, brakeForce: 1.0, tractionMax: 2.4, tractionMin: 2.1, suspensionRaise: 0, driveBias: 0.35, gears: 6, handlingFlags: "440010", modelFlags: "440010" },
  muscle: { mass: 1750, driveForce: 0.28, topSpeed: 130, brakeForce: 0.9, tractionMax: 2.2, tractionMin: 1.9, suspensionRaise: 0, driveBias: 0, gears: 5, handlingFlags: "400000", modelFlags: "440010" },
  sedan: { mass: 1600, driveForce: 0.24, topSpeed: 120, brakeForce: 0.85, tractionMax: 2.1, tractionMin: 1.9, suspensionRaise: 0, driveBias: 0.5, gears: 5, handlingFlags: "400000", modelFlags: "440010" },
  suv: { mass: 2400, driveForce: 0.25, topSpeed: 120, brakeForce: 0.8, tractionMax: 2.0, tractionMin: 1.8, suspensionRaise: 0.02, driveBias: 0.5, gears: 6, handlingFlags: "400000", modelFlags: "440010" },
  motorcycle: { mass: 220, driveForce: 0.32, topSpeed: 135, brakeForce: 1.1, tractionMax: 2.0, tractionMin: 1.8, suspensionRaise: 0, driveBias: 0, gears: 6, handlingFlags: "400000", modelFlags: "440010" },
  van: { mass: 2200, driveForce: 0.22, topSpeed: 110, brakeForce: 0.75, tractionMax: 1.9, tractionMin: 1.7, suspensionRaise: 0.01, driveBias: 1, gears: 5, handlingFlags: "400000", modelFlags: "440010" },
  emergency: { mass: 2000, driveForce: 0.27, topSpeed: 125, brakeForce: 0.95, tractionMax: 2.2, tractionMin: 2.0, suspensionRaise: 0, driveBias: 0.5, gears: 6, handlingFlags: "400000", modelFlags: "440010" },
  generic: { mass: 1700, driveForce: 0.26, topSpeed: 125, brakeForce: 0.9, tractionMax: 2.1, tractionMin: 1.9, suspensionRaise: 0, driveBias: 0.4, gears: 6, handlingFlags: "400000", modelFlags: "440010" },
};

export interface VehicleMetaOptions {
  spawnName: string;
  txdName?: string;
  handlingId?: string;
  gameName?: string;
  audioNameHash?: string;
  vehicleClass?: ReturnType<typeof vehicleClassFor>;
  seats?: number;
  layout?: string;
}

/** vehicles.meta for a single add-on vehicle. */
export function buildVehiclesMeta(opts: VehicleMetaOptions): string {
  const name = escapeXml(opts.spawnName);
  const txd = escapeXml(opts.txdName ?? opts.spawnName);
  const handling = escapeXml(opts.handlingId ?? opts.spawnName);
  const game = escapeXml(opts.gameName ?? opts.spawnName.toUpperCase());
  const audio = escapeXml(opts.audioNameHash ?? "");
  const cls = opts.vehicleClass ?? "generic";
  const vehicleClass = cls === "motorcycle" ? "VC_MOTORCYCLE" : cls === "suv" ? "VC_SUV" : cls === "super" ? "VC_SUPER" : cls === "sports" ? "VC_SPORT" : cls === "muscle" ? "VC_MUSCLE" : cls === "van" ? "VC_VAN" : cls === "emergency" ? "VC_EMERGENCY" : "VC_SEDAN";
  const layout = escapeXml(opts.layout ?? (cls === "motorcycle" ? "LAYOUT_BIKE_QUAD" : "LAYOUT_STANDARD"));
  return `<?xml version="1.0" encoding="UTF-8"?>
<CVehicleModelInfo__InitDataList>
  <residentTxd>vehshare</residentTxd>
  <residentAnims />
  <InitDatas>
    <Item type="CVehicleModelInfo__InitData">
      <modelName>${name}</modelName>
      <txdName>${txd}</txdName>
      <handlingId>${handling}</handlingId>
      <gameName>${game}</gameName>
      <vehicleMakeName>MODSMITH</vehicleMakeName>
      <expressionDictName>null</expressionDictName>
      <expressionName>null</expressionName>
      <animConvRoofDictName>null</animConvRoofDictName>
      <animConvRoofName>null</animConvRoofName>
      <animConvRoofWindowsAffected />
      <ptfxAssetName>null</ptfxAssetName>
      <audioNameHash>${audio}</audioNameHash>
      <layout>${layout}</layout>
      <coverBoundOffsets>${name.toUpperCase()}_COVER_OFFSET_INFO</coverBoundOffsets>
      <explosionInfo>EXPLOSION_INFO_DEFAULT</explosionInfo>
      <scenarioLayout />
      <cameraName>DEFAULT_FOLLOW_VEHICLE_CAMERA</cameraName>
      <aimCameraName>DEFAULT_THIRD_PERSON_VEHICLE_AIM_CAMERA</aimCameraName>
      <bonnetCameraName>VEHICLE_BONNET_CAMERA_STANDARD</bonnetCameraName>
      <povCameraName>DEFAULT_POV_CAMERA</povCameraName>
      <FirstPersonDriveByIKOffset x="0.000000" y="-0.050000" z="-0.020000" />
      <FirstPersonDriveByUnarmedIKOffset x="0.000000" y="-0.020000" z="0.000000" />
      <FirstPersonProjectileDriveByIKOffset x="0.000000" y="-0.050000" z="0.020000" />
      <FirstPersonProjectileDriveByPassengerIKOffset x="0.000000" y="-0.050000" z="0.020000" />
      <FirstPersonDriveByLeftPassengerIKOffset x="0.000000" y="0.000000" z="0.000000" />
      <FirstPersonDriveByRightPassengerIKOffset x="0.000000" y="-0.050000" z="-0.020000" />
      <FirstPersonMobilePhoneOffset x="0.136000" y="0.220000" z="0.473000" />
      <PovCameraOffset x="0.000000" y="-0.200000" z="0.650000" />
      <PovCameraVerticalAdjustmentForRollCage value="0.000000" />
      <PovPassengerCameraOffset x="0.000000" y="0.000000" z="0.000000" />
      <vfxInfoName>VFXVEHICLEINFO_CAR_GENERIC</vfxInfoName>
      <shouldUseCinematicViewMode value="true" />
      <shouldCameraTransitionOnClimbUpDown value="false" />
      <shouldCameraIgnoreExiting value="false" />
      <AllowPretendOccupants value="true" />
      <AllowJoyriding value="true" />
      <AllowSundayDriving value="true" />
      <AllowBodyColorMapping value="true" />
      <wheelScale value="0.250000" />
      <wheelScaleRear value="0.250000" />
      <dirtLevelMin value="0.000000" />
      <dirtLevelMax value="0.850000" />
      <envEffScaleMin value="0.000000" />
      <envEffScaleMax value="1.000000" />
      <envEffScaleMin2 value="0.000000" />
      <envEffScaleMax2 value="1.000000" />
      <damageMapScale value="0.600000" />
      <damageOffsetScale value="1.000000" />
      <diffuseTint value="0x00FFFFFF" />
      <steerWheelMult value="1.000000" />
      <HDTextureDist value="5.000000" />
      <lodDistances content="float_array">
        35.000000 70.000000 150.000000 300.000000 600.000000 600.000000
      </lodDistances>
      <minSeatHeight value="0.860000" />
      <identicalModelSpawnDistance value="20" />
      <maxNumOfSameColor value="10" />
      <defaultBodyHealth value="1000.000000" />
      <pretendOccupantsScale value="1.000000" />
      <visibleSpawnDistScale value="1.000000" />
      <trackerPathWidth value="2.000000" />
      <weaponForceMult value="1.000000" />
      <frequency value="30" />
      <swankness>SWANKNESS_4</swankness>
      <maxNum value="10" />
      <flags>FLAG_HAS_LIVERY FLAG_EXTRAS_STRONG</flags>
      <type>VEHICLE_TYPE_CAR</type>
      <plateType>VPT_FRONT_AND_BACK_PLATES</plateType>
      <dashboardType>VDT_GENERICDIALS</dashboardType>
      <vehicleClass>${vehicleClass}</vehicleClass>
      <wheelType>VWT_SPORT</wheelType>
      <trailers />
      <additionalTrailers />
      <drivers />
      <extraIncludes />
      <doorsWithCollisionWhenClosed />
      <driveableDoors />
      <bumpersNeedToCollideWithMap value="false" />
      <needsRopeTexture value="false" />
      <requiredExtras />
      <rewards />
      <cinematicPartCamera>
        <Item>WHEEL_FRONT_RIGHT_CAMERA</Item>
        <Item>WHEEL_FRONT_LEFT_CAMERA</Item>
        <Item>WHEEL_REAR_RIGHT_CAMERA</Item>
        <Item>WHEEL_REAR_LEFT_CAMERA</Item>
      </cinematicPartCamera>
      <NmBraceOverrideSet />
      <buoyancySphereOffset x="0.000000" y="0.000000" z="0.000000" />
      <buoyancySphereSizeScale value="1.000000" />
      <pOverrideRagdollThreshold type="NULL" />
      <firstPersonDrivebyData>
        <Item>STD_${name.toUpperCase()}_FRONT_LEFT</Item>
        <Item>STD_${name.toUpperCase()}_FRONT_RIGHT</Item>
      </firstPersonDrivebyData>
    </Item>
  </InitDatas>
  <txdRelationships>
    <Item>
      <parent>vehicles_${name}_interior</parent>
      <child>${txd}</child>
    </Item>
  </txdRelationships>
</CVehicleModelInfo__InitDataList>
`;
}

/** handling.meta derived from the class preset. */
export function buildHandlingMeta(opts: { handlingId: string; preset: HandlingPreset }): string {
  const p = opts.preset;
  const id = escapeXml(opts.handlingId);
  const f = (n: number, digits = 6) => n.toFixed(digits);
  return `<?xml version="1.0" encoding="UTF-8"?>
<CHandlingDataMgr>
  <HandlingData>
    <Item type="CHandlingData">
      <handlingName>${id}</handlingName>
      <fMass value="${f(p.mass, 6)}" />
      <fInitialDragCoeff value="8.000000" />
      <fPercentSubmerged value="85.000000" />
      <vecCentreOfMassOffset x="0.000000" y="0.000000" z="0.000000" />
      <vecInertiaMultiplier x="1.000000" y="1.000000" z="1.000000" />
      <fDriveBiasFront value="${f(p.driveBias, 6)}" />
      <nInitialDriveGears value="${p.gears}" />
      <fInitialDriveForce value="${f(p.driveForce)}" />
      <fDriveInertia value="1.000000" />
      <fClutchChangeRateScaleUpShift value="2.000000" />
      <fClutchChangeRateScaleDownShift value="2.000000" />
      <fInitialDriveMaxFlatVel value="${f(p.topSpeed, 6)}" />
      <fBrakeForce value="${f(p.brakeForce)}" />
      <fBrakeBiasFront value="0.550000" />
      <fHandBrakeForce value="0.700000" />
      <fSteeringLock value="38.000000" />
      <fTractionCurveMax value="${f(p.tractionMax)}" />
      <fTractionCurveMin value="${f(p.tractionMin)}" />
      <fTractionCurveLateral value="22.500000" />
      <fTractionSpringDeltaMax value="0.150000" />
      <fLowSpeedTractionLossMult value="1.000000" />
      <fCamberStiffnesss value="0.000000" />
      <fTractionBiasFront value="0.490000" />
      <fTractionLossMult value="1.000000" />
      <fSuspensionForce value="1.500000" />
      <fSuspensionCompDamp value="1.300000" />
      <fSuspensionReboundDamp value="1.800000" />
      <fSuspensionUpperLimit value="0.100000" />
      <fSuspensionLowerLimit value="-0.120000" />
      <fSuspensionRaise value="${f(p.suspensionRaise)}" />
      <fSuspensionBiasFront value="0.500000" />
      <fAntiRollBarForce value="0.500000" />
      <fAntiRollBarBiasFront value="0.500000" />
      <fRollCentreHeightFront value="0.300000" />
      <fRollCentreHeightRear value="0.300000" />
      <fCollisionDamageMult value="1.000000" />
      <fWeaponDamageMult value="1.000000" />
      <fDeformationDamageMult value="1.000000" />
      <fEngineDamageMult value="1.500000" />
      <fPetrolTankVolume value="65.000000" />
      <fOilVolume value="5.000000" />
      <fSeatOffsetDistX value="0.000000" />
      <fSeatOffsetDistY value="0.000000" />
      <fSeatOffsetDistZ value="0.000000" />
      <nMonetaryValue value="65000" />
      <strModelFlags>${p.modelFlags}</strModelFlags>
      <strHandlingFlags>${p.handlingFlags}</strHandlingFlags>
      <strDamageFlags>0</strDamageFlags>
      <AIHandling>AVERAGE</AIHandling>
      <SubHandlingData>
        <Item type="CCarHandlingData">
          <fBackEndPopUpCarImpulseMult value="0.100000" />
          <fBackEndPopUpBuildingImpulseMult value="0.030000" />
          <fBackEndPopUpMaxDeltaSpeed value="0.600000" />
        </Item>
      </SubHandlingData>
    </Item>
  </HandlingData>
</CHandlingDataMgr>
`;
}

/** carvariations.meta with a single default colour set. */
export function buildCarVariationsMeta(opts: { spawnName: string; kits?: string[] }): string {
  const name = escapeXml(opts.spawnName);
  const kits = (opts.kits ?? [`0_default_modkit`]).map((k) => `        <Item>${escapeXml(k)}</Item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<CVehicleModelInfoVariation>
  <variationData>
    <Item>
      <modelName>${name}</modelName>
      <colors>
        <Item>
          <indices content="char_array">
            111
            111
            111
            111
          </indices>
          <liveries />
        </Item>
      </colors>
      <kits>
${kits}
      </kits>
      <windowsWithExposedEdges />
      <plateProbabilities>
        <Probabilities />
      </plateProbabilities>
      <lightSettings value="0" />
      <sirenSettings value="0" />
    </Item>
  </variationData>
</CVehicleModelInfoVariation>
`;
}

/** Minimal carcols.meta declaring an empty mod kit so the vehicle works in mod shops. */
export function buildCarColsMeta(opts: { spawnName: string; kitId?: number }): string {
  const name = escapeXml(opts.spawnName);
  const id = opts.kitId ?? 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<CVehicleModelInfoVarGlobal>
  <Kits>
    <Item>
      <kitName>${id}_${name}_modkit</kitName>
      <id value="${id}" />
      <kitType>MKT_SPORT</kitType>
      <visibleMods />
      <linkMods />
      <statMods />
      <slotNames />
      <liveryNames />
    </Item>
  </Kits>
  <Lights />
</CVehicleModelInfoVarGlobal>
`;
}

/** Rewrite the model/txd/handling/game/audio identifiers inside an existing meta file. */
export function rewriteMetaIdentifiers(
  xml: string,
  mapping: { modelName?: string; txdName?: string; handlingId?: string; gameName?: string; audioNameHash?: string; kitName?: string },
): string {
  let out = xml;
  const swap = (tag: string, value?: string) => {
    if (value === undefined) return;
    out = out.replace(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi"), `<${tag}>${escapeXml(value)}</${tag}>`);
  };
  swap("modelName", mapping.modelName);
  swap("txdName", mapping.txdName);
  swap("handlingId", mapping.handlingId);
  swap("handlingName", mapping.handlingId);
  swap("gameName", mapping.gameName);
  swap("audioNameHash", mapping.audioNameHash);
  return out;
}

/** Extract `<modelName>` values from a vehicles.meta/carvariations.meta document. */
export function readModelNames(xml: string): string[] {
  const out: string[] = [];
  const re = /<modelName>\s*([^<\s]+)\s*<\/modelName>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]!.toLowerCase());
  return [...new Set(out)];
}
