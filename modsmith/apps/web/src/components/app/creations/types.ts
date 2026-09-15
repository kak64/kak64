export interface CreationRow {
  id: string;
  name: string;
  toolSlug: string;
  status: string;
  originalFilename: string | null;
  exportVersion: number;
  lastCreditCost: number | null;
  reexportUntil: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string | null;
  currentVersion: { id: string; version: number; resourceName: string; sizeBytes: number; createdAt: string } | null;
  currentJob: { id: string; status: string; stage: string | null; progress: number } | null;
  showcase: { slug: string; status: string; title?: string; description?: string | null; category?: string; tags?: string[]; allowDownload?: boolean; allowRemix?: boolean } | null;
}

export const ACTIVE_JOB_STATUSES = ["PENDING", "QUEUED", "PROCESSING", "PACKAGING"];
export const SHOWCASE_CATEGORIES = ["props", "cars", "liveries", "clothing", "weapons", "tattoos", "other"] as const;
