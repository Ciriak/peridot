import type { InjectionKey, Ref } from "vue";

export const MAIN_SCROLL_ELEMENT_KEY: InjectionKey<
  Readonly<Ref<HTMLElement | null>>
> = Symbol("peridot-main-scroll");
