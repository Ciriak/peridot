export type PluginCapability =
  | "playlist:read"
  | "playlist:write"
  | "metadata:search"
  | "metadata:enrich"
  | "recommendations:read";
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  sdkVersion: string;
  capabilities: readonly PluginCapability[];
  permissions: readonly string[];
}
// Contract only: no plugin code is loaded or executed by this package.
