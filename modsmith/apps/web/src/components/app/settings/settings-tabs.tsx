"use client";
import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SecurityTab } from "./security-tab";
import { NotificationsTab, PrivacyTab, type NotificationPrefs, type PrivacyPrefs } from "./preferences-tabs";
import { DangerZone } from "./danger-zone";

const KEY = "ms.settingsTab";

export function SettingsTabs({ notifications, privacy, discordConnected }: { notifications: NotificationPrefs; privacy: PrivacyPrefs; discordConnected: boolean }) {
  const [tab, setTab] = React.useState("security");
  React.useEffect(() => { try { const v = localStorage.getItem(KEY); if (v) setTab(v); } catch { /* ignore */ } }, []);
  const change = (v: string) => { setTab(v); try { localStorage.setItem(KEY, v); } catch { /* ignore */ } };
  return (
    <Tabs value={tab} onValueChange={change}>
      <TabsList className="flex w-full overflow-x-auto sm:w-auto">
        <TabsTrigger value="security">Security</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="privacy">Privacy</TabsTrigger>
        <TabsTrigger value="danger">Danger zone</TabsTrigger>
      </TabsList>
      <TabsContent value="security"><SecurityTab /></TabsContent>
      <TabsContent value="notifications"><NotificationsTab initial={notifications} discordConnected={discordConnected} /></TabsContent>
      <TabsContent value="privacy"><PrivacyTab initial={privacy} /></TabsContent>
      <TabsContent value="danger"><DangerZone /></TabsContent>
    </Tabs>
  );
}
