export interface BackHistory {
  readonly length: number;
  readonly state: unknown;
}

export interface BackRouter {
  back(): void;
}

export function navigateBack(
  router: BackRouter,
  goHome: () => unknown,
  browserHistory: BackHistory | undefined,
) {
  const state =
    browserHistory?.state && typeof browserHistory.state === "object"
      ? (browserHistory.state as { back?: unknown })
      : null;

  if (
    browserHistory &&
    browserHistory.length > 1 &&
    typeof state?.back === "string"
  ) {
    router.back();
    return;
  }

  void goHome();
}
