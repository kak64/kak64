"use client";
/**
 * The real R3F viewport. Never imported directly by pages — `viewport.tsx` loads it with
 * next/dynamic({ ssr: false }) so nothing three.js-related runs during SSR.
 */
import * as React from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { cn } from "@/lib/utils";
import type { GizmoMode, ViewportHandle, ViewportProps, ViewportStats } from "./viewport-types";

const PED_HEIGHT = 1.83;

function PedReference({ gender = "male" }: { gender?: "male" | "female" }) {
  const wide = gender === "male";
  const shoulder = wide ? 0.21 : 0.18;
  const hip = wide ? 0.15 : 0.17;
  const mat = React.useMemo(() => new THREE.MeshStandardMaterial({ color: "#3a4354", roughness: 0.9, metalness: 0, transparent: true, opacity: 0.55 }), []);
  React.useEffect(() => () => mat.dispose(), [mat]);
  return (
    <group name="__ped_reference" position={[0.9, 0, 0]} raycast={() => null}>
      {/* head */}
      <mesh material={mat} position={[0, PED_HEIGHT - 0.12, 0]} raycast={() => null}><sphereGeometry args={[0.11, 16, 12]} /></mesh>
      {/* neck + torso */}
      <mesh material={mat} position={[0, 1.36, 0]} raycast={() => null}><capsuleGeometry args={[shoulder, 0.44, 4, 12]} /></mesh>
      {/* hips */}
      <mesh material={mat} position={[0, 0.98, 0]} raycast={() => null}><capsuleGeometry args={[hip, 0.12, 4, 12]} /></mesh>
      {/* arms */}
      <mesh material={mat} position={[-shoulder - 0.07, 1.33, 0]} raycast={() => null}><capsuleGeometry args={[0.055, 0.5, 4, 8]} /></mesh>
      <mesh material={mat} position={[shoulder + 0.07, 1.33, 0]} raycast={() => null}><capsuleGeometry args={[0.055, 0.5, 4, 8]} /></mesh>
      {/* legs */}
      <mesh material={mat} position={[-0.09, 0.46, 0]} raycast={() => null}><capsuleGeometry args={[0.075, 0.68, 4, 8]} /></mesh>
      <mesh material={mat} position={[0.09, 0.46, 0]} raycast={() => null}><capsuleGeometry args={[0.075, 0.68, 4, 8]} /></mesh>
    </group>
  );
}

function ModelContent({
  object, wireframe, flatShade, onSelect, hoverEnabled, selectedMesh,
}: {
  object: THREE.Object3D;
  wireframe: boolean;
  flatShade: boolean;
  onSelect?: (meshName: string, materialName: string) => void;
  hoverEnabled: boolean;
  selectedMesh?: string | null;
}) {
  const [hovered, setHovered] = React.useState<THREE.Mesh | null>(null);
  const originals = React.useRef(new Map<THREE.Material, { wireframe: boolean; color: number | null }>());

  React.useEffect(() => {
    const store = originals.current;
    object.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        const std = m as THREE.MeshStandardMaterial;
        if (!store.has(m)) store.set(m, { wireframe: !!std.wireframe, color: std.color ? std.color.getHex() : null });
        std.wireframe = wireframe;
        if (flatShade) { if (std.color) std.color.setHex(0x9aa3b2); }
        else { const o = store.get(m); if (o?.color != null && std.color) std.color.setHex(o.color); }
        std.needsUpdate = true;
      }
    });
  }, [object, wireframe, flatShade]);

  React.useEffect(() => () => { originals.current.clear(); }, []);

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const mesh = e.object as THREE.Mesh;
    if (!mesh?.isMesh) return null;
    return mesh;
  };

  const selected = React.useMemo(() => {
    if (!selectedMesh) return null;
    let found: THREE.Mesh | null = null;
    object.traverse((n) => { const m = n as THREE.Mesh; if (!found && m.isMesh && m.name === selectedMesh) found = m; });
    return found as THREE.Mesh | null;
  }, [object, selectedMesh]);

  return (
    <group>
      <primitive
        object={object}
        onPointerOver={hoverEnabled ? (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(pick(e)); } : undefined}
        onPointerOut={hoverEnabled ? () => setHovered(null) : undefined}
        onClick={onSelect ? (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          const mesh = pick(e);
          if (!mesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const mat = typeof e.face?.materialIndex === "number" && Array.isArray(mesh.material) ? mesh.material[e.face.materialIndex] : mats[0];
          onSelect(mesh.name || "mesh", mat?.name ?? "");
        } : undefined}
      />
      {hovered && hovered !== selected ? <Highlight mesh={hovered} color="#f97316" opacity={0.22} /> : null}
      {selected ? <Highlight mesh={selected} color="#38bdf8" opacity={0.3} /> : null}
    </group>
  );
}

function Highlight({ mesh, color, opacity }: { mesh: THREE.Mesh; color: string; opacity: number }) {
  const ref = React.useRef<THREE.Mesh>(null);
  useFrame(() => { if (ref.current) { ref.current.matrix.copy(mesh.matrixWorld); ref.current.matrixWorld.copy(mesh.matrixWorld); } });
  return (
    <mesh ref={ref} geometry={mesh.geometry} matrixAutoUpdate={false} raycast={() => null} renderOrder={999}>
      <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
    </mesh>
  );
}

function BoundsBox({ object }: { object: THREE.Object3D }) {
  const [box, setBox] = React.useState<{ size: [number, number, number]; center: [number, number, number] } | null>(null);
  useFrame(() => {
    const b = new THREE.Box3().setFromObject(object);
    if (b.isEmpty()) return;
    const s = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    setBox((prev) => {
      if (prev && Math.abs(prev.size[0] - s.x) < 1e-4 && Math.abs(prev.size[1] - s.y) < 1e-4 && Math.abs(prev.size[2] - s.z) < 1e-4 && Math.abs(prev.center[1] - c.y) < 1e-4) return prev;
      return { size: [s.x, s.y, s.z], center: [c.x, c.y, c.z] };
    });
  });
  if (!box) return null;
  return (
    <mesh position={box.center} raycast={() => null}>
      <boxGeometry args={box.size} />
      <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.5} />
    </mesh>
  );
}

function Framer({ object, trigger, distanceHint }: { object: THREE.Object3D | null | undefined; trigger: number; distanceHint?: number }) {
  const { camera, controls } = useThree();
  React.useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    let radius = distanceHint ?? 1.5;
    let center = new THREE.Vector3(0, 0.6, 0);
    if (object) {
      const box = new THREE.Box3().setFromObject(object);
      if (!box.isEmpty()) {
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        radius = Math.max(0.3, sphere.radius);
        center = sphere.center;
      }
    }
    const fov = (cam.fov ?? 45) * (Math.PI / 180);
    const dist = (radius / Math.sin(fov / 2)) * 1.4;
    cam.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.8);
    cam.near = Math.max(0.01, dist / 500);
    cam.far = Math.max(100, dist * 50);
    cam.updateProjectionMatrix();
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (orbit?.target) { orbit.target.copy(center); orbit.update?.(); }
    else cam.lookAt(center);
  }, [object, trigger, camera, controls, distanceHint]);
  return null;
}

function StatsSampler({ onSample }: { onSample: (s: ViewportStats) => void }) {
  const { gl } = useThree();
  const frames = React.useRef(0);
  const last = React.useRef(performance.now());
  useFrame(() => {
    frames.current++;
    const now = performance.now();
    if (now - last.current >= 500) {
      onSample({ fps: Math.round((frames.current * 1000) / (now - last.current)), triangles: gl.info.render.triangles, calls: gl.info.render.calls });
      frames.current = 0;
      last.current = now;
    }
  });
  return null;
}

function HandleBridge({ apiRef, onReady }: { apiRef?: React.MutableRefObject<ViewportHandle | null>; onReady?: () => void }) {
  const { gl, scene, camera, invalidate } = useThree();
  React.useEffect(() => {
    const handle: ViewportHandle = {
      screenshot: async (mime = "image/png") => {
        gl.render(scene, camera);
        return new Promise<Blob | null>((resolve) => gl.domElement.toBlob((b) => resolve(b), mime, 0.92));
      },
      invalidate: () => invalidate(),
      getScene: () => scene,
      getRenderer: () => gl,
    };
    if (apiRef) apiRef.current = handle;
    onReady?.();
    return () => { if (apiRef) apiRef.current = null; };
  }, [apiRef, gl, scene, camera, invalidate, onReady]);
  return null;
}

function TransformBridge({ target, mode, onTransform, snap }: { target: THREE.Object3D; mode: Exclude<GizmoMode, "none">; onTransform?: ViewportProps["onTransform"]; snap?: boolean }) {
  const emit = React.useCallback(() => {
    onTransform?.({
      position: [target.position.x, target.position.y, target.position.z],
      rotation: [THREE.MathUtils.radToDeg(target.rotation.x), THREE.MathUtils.radToDeg(target.rotation.y), THREE.MathUtils.radToDeg(target.rotation.z)],
      scale: [target.scale.x, target.scale.y, target.scale.z],
    });
  }, [target, onTransform]);
  return <TransformControls object={target} mode={mode} translationSnap={snap ? 0.05 : null} rotationSnap={snap ? Math.PI / 24 : null} scaleSnap={snap ? 0.05 : null} onObjectChange={emit} size={0.8} />;
}

export default function Scene(props: ViewportProps) {
  const {
    object, wireframe = false, flatShade = false, showBounds = false, showGrid = true, showPed = false, pedGender = "male",
    environment = true, gizmo = "none", transformTarget, onTransform, onSelect, selectedMesh, hoverEnabled = true,
    apiRef, className, children, snapTransforms, frameTrigger = 0, cameraDistanceHint, onStats,
  } = props;

  const reduced = React.useRef(false);
  if (typeof window !== "undefined" && !reduced.current) reduced.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const target = transformTarget ?? object ?? null;

  return (
    <Canvas
      className={cn("h-full w-full", className)}
      dpr={[1, 2]}
      shadows={false}
      gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
      camera={{ fov: 45, position: [2.2, 1.8, 2.6], near: 0.01, far: 2000 }}
      onCreated={({ gl }) => { gl.setClearColor(0x0a0c10, 0); }}
    >
      <color attach="background" args={["#0d1016"]} />
      <hemisphereLight args={["#dbe6ff", "#1b202a", 1.1]} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} />
      <directionalLight position={[-4, 3, -3]} intensity={0.5} />
      {/* Studio-style fill instead of drei's Environment presets: those fetch HDRIs from an external CDN,
          which our Content-Security-Policy (connect-src 'self') blocks. */}
      {environment ? (
        <>
          <directionalLight position={[0, 4, -6]} intensity={0.45} color="#9fc2ff" />
          <directionalLight position={[0, -3, 2]} intensity={0.18} color="#ffd9b0" />
        </>
      ) : null}
      {showGrid ? <Grid args={[24, 24]} cellSize={0.25} cellThickness={0.5} cellColor="#232935" sectionSize={1} sectionThickness={1} sectionColor="#313949" fadeDistance={28} fadeStrength={1.2} infiniteGrid followCamera={false} /> : null}
      {showPed ? <PedReference gender={pedGender} /> : null}
      {object ? <ModelContent object={object} wireframe={wireframe} flatShade={flatShade} onSelect={onSelect} hoverEnabled={hoverEnabled} selectedMesh={selectedMesh} /> : null}
      {object && showBounds ? <BoundsBox object={object} /> : null}
      {children}
      <OrbitControls makeDefault enableDamping={!reduced.current} dampingFactor={0.08} maxPolarAngle={Math.PI * 0.499} minDistance={0.05} maxDistance={400} />
      {gizmo !== "none" && target ? <TransformBridge target={target} mode={gizmo} onTransform={onTransform} snap={snapTransforms} /> : null}
      <Framer object={object} trigger={frameTrigger} distanceHint={cameraDistanceHint} />
      {onStats ? <StatsSampler onSample={onStats} /> : null}
      <HandleBridge apiRef={apiRef} />
    </Canvas>
  );
}
