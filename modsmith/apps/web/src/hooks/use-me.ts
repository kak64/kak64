"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export interface Me {
  user: { id: string; email: string; username: string; role: "USER" | "MODERATOR" | "ADMIN"; emailVerified: boolean; avatarUrl: string | null; referralCode: string; createdAt: string } | null;
  credits: number;
  discord: { discordId: string; username: string; globalName: string | null; avatarUrl: string; connectedAt: string } | null;
  unreadNotifications: number;
  subscription: { id: string; status: string; plan: { name: string; slug: string; exportDiscountPct: number; aiTools: boolean }; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
}

let cache: Me | null = null;
const listeners = new Set<(m: Me) => void>();

export async function refreshMe() {
  const me = await api<Me>("/api/v1/auth/me");
  cache = me;
  listeners.forEach((l) => l(me));
  return me;
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(cache);
  const [loading, setLoading] = useState(!cache);
  useEffect(() => {
    listeners.add(setMe);
    if (!cache) refreshMe().finally(() => setLoading(false));
    return () => { listeners.delete(setMe); };
  }, []);
  const refresh = useCallback(() => refreshMe(), []);
  return { me, loading, refresh };
}
