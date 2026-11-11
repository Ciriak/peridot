import type {
  MetadataProviderDefinitionResponse,
  MetadataProviderResponse,
} from "@peridot/contracts";

export function metadataProviderNeedsConfiguration(
  provider: MetadataProviderResponse,
  definitions: MetadataProviderDefinitionResponse[],
) {
  if (!provider.enabled) return false;

  const definition = definitions.find((item) => item.kind === provider.kind);
  if (!definition) return false;

  const missingConfiguration = definition.configurationFields.some(
    (field) => field.required && !provider.configuration[field.key]?.trim(),
  );
  const missingCredential = Boolean(
    definition.credentialField?.required && !provider.hasCredential,
  );
  return missingConfiguration || missingCredential;
}
