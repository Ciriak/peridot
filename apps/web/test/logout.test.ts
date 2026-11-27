import assert from "node:assert/strict";
import test from "node:test";
import { logoutImmediately } from "../app/lib/logout.ts";

test("logout redirects before background cleanup settles", async () => {
  const order: string[] = [];
  let finishNavigation: () => void = () => undefined;
  const navigation = new Promise<void>((resolve) => {
    finishNavigation = resolve;
  });
  let finishServerSession: () => void = () => undefined;
  const serverSession = new Promise<void>((resolve) => {
    finishServerSession = resolve;
  });
  let finishDeviceData: () => void = () => undefined;
  const deviceData = new Promise<void>((resolve) => {
    finishDeviceData = resolve;
  });
  let redirected = false;
  let serverCleared = false;
  let deviceCleared = false;

  const logout = logoutImmediately({
    clearCredentials() {
      order.push("credentials");
    },
    redirectToLogin() {
      order.push("redirect");
      return navigation;
    },
    clearServerSession() {
      order.push("server");
      return serverSession.finally(() => {
        serverCleared = true;
      });
    },
    clearDeviceData() {
      order.push("device");
      return deviceData.finally(() => {
        deviceCleared = true;
      });
    },
  }).then(() => {
    redirected = true;
  });

  assert.deepEqual(order, ["credentials", "redirect", "server", "device"]);
  assert.equal(redirected, false);

  finishNavigation();
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(redirected, true);
  assert.equal(serverCleared, false);
  assert.equal(deviceCleared, false);

  finishServerSession();
  finishDeviceData();
  await logout;
});
