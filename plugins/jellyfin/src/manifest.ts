import type {
  MessageDescriptor,
  PluginSourceFieldDefinition,
} from "@peridot/contracts";

function message(key: string): MessageDescriptor {
  return { key };
}

const fields: PluginSourceFieldDefinition[] = [
  {
    key: "url",
    labelMessage: message("plugin.jellyfin.field.url"),
    type: "url",
    required: true,
    secret: false,
    visible: true,
    placeholderMessage: message("plugin.jellyfin.field.urlPlaceholder"),
    helpMessage: null,
  },
  {
    key: "apiKey",
    labelMessage: message("plugin.jellyfin.field.apiKey"),
    type: "password",
    required: true,
    secret: true,
    visible: true,
    placeholderMessage: null,
    helpMessage: message("plugin.jellyfin.field.apiKeyHelp"),
  },
  {
    key: "libraryId",
    labelMessage: message("plugin.jellyfin.field.library"),
    type: "text",
    required: true,
    secret: false,
    visible: false,
    placeholderMessage: null,
    helpMessage: null,
  },
  {
    key: "libraryCollectionType",
    labelMessage: message("plugin.jellyfin.field.collectionType"),
    type: "text",
    required: false,
    secret: false,
    visible: false,
    placeholderMessage: null,
    helpMessage: null,
  },
];

export const jellyfinDefinition = {
  manifest: {
    id: "jellyfin",
    name: "Jellyfin",
    descriptionMessage: message("plugin.jellyfin.description"),
    version: "0.0.7",
    sdkVersion: "1",
    capabilities: ["source"] as const,
    permissions: ["network:jellyfin", "credentials:source"] as const,
    contributionKinds: ["source"] as const,
    installSource: "bundled" as const,
    installSourceLocator: "@peridot/plugin-jellyfin",
    icon: "jellyfin",
  },
  contributions: [
    {
      kind: "source" as const,
      configurationFields: fields,
      discovery: {
        actionMessage: message("plugin.jellyfin.discoverLibraries"),
        helpMessage: message("plugin.jellyfin.discoveryHelp"),
      },
    },
  ],
};
