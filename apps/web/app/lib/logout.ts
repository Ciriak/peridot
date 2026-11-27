export interface LogoutProcess {
  clearCredentials: () => void;
  redirectToLogin: () => Promise<unknown>;
  clearServerSession: () => Promise<unknown>;
  clearDeviceData: () => Promise<unknown>;
}

export async function logoutImmediately(process: LogoutProcess): Promise<void> {
  process.clearCredentials();
  const navigation = process.redirectToLogin();
  void Promise.allSettled([
    process.clearServerSession(),
    process.clearDeviceData(),
  ]);
  await navigation;
}
