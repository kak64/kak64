import type * as THREE from "three";

export type GizmoMode = "none" | "translate" | "rotate" | "scale";

export interface ViewportStats {
  fps: number;
  triangles: number;
  calls: number;
}

export interface ViewportTransform {
  position: [number, number, number];
  /** Degrees — the editors and the export config both use degrees. */
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface ViewportHandle {
  /** Renders once and returns the canvas as a PNG blob (used for thumbnails). */
  screenshot(mime?: string): Promise<Blob | null>;
  invalidate(): void;
  getScene(): THREE.Scene | null;
  getRenderer(): THREE.WebGLRenderer | null;
}

export interface ViewportProps {
  object?: THREE.Object3D | null;
  wireframe?: boolean;
  /** Ignore material colours and show a neutral clay shade. */
  flatShade?: boolean;
  showBounds?: boolean;
  showGrid?: boolean;
  showPed?: boolean;
  pedGender?: "male" | "female";
  environment?: boolean;
  gizmo?: GizmoMode;
  /** Defaults to `object`. */
  transformTarget?: THREE.Object3D | null;
  snapTransforms?: boolean;
  onTransform?: (t: ViewportTransform) => void;
  onSelect?: (meshName: string, materialName: string) => void;
  selectedMesh?: string | null;
  hoverEnabled?: boolean;
  apiRef?: React.MutableRefObject<ViewportHandle | null>;
  className?: string;
  children?: React.ReactNode;
  /** Bump to re-frame the camera on the current object. */
  frameTrigger?: number;
  cameraDistanceHint?: number;
  onStats?: (s: ViewportStats) => void;
}
