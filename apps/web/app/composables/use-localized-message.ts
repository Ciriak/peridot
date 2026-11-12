import { useI18n } from "#imports";
import type { MessageDescriptor } from "@peridot/contracts";
import { messageDescriptorOf } from "../lib/messages.ts";

type DynamicTranslatePlural = (
  key: string,
  plural: number,
  named: Record<string, string | number>,
) => string;
type DynamicTranslateNamed = (
  key: string,
  named: Record<string, string | number>,
) => string;

export function useLocalizedMessage() {
  const { t, te } = useI18n();
  const translatePlural = t as unknown as DynamicTranslatePlural;
  const translateNamed = t as unknown as DynamicTranslateNamed;

  function translate(
    descriptor: MessageDescriptor | null | undefined,
    fallback = "",
  ): string {
    if (!descriptor || !te(descriptor.key as never)) return fallback;
    if (descriptor.count !== undefined) {
      return translatePlural(
        descriptor.key,
        descriptor.count,
        descriptor.params ?? {},
      );
    }
    return translateNamed(descriptor.key, descriptor.params ?? {});
  }

  function errorMessage(reason: unknown, fallbackKey?: string): string {
    const descriptor = messageDescriptorOf(reason);
    if (descriptor) return translate(descriptor, fallbackKey ?? "");
    if (fallbackKey) return t(fallbackKey);
    return reason instanceof Error ? reason.message : "";
  }

  return { t, translate, errorMessage };
}
