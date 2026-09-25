import assert from "node:assert/strict";
import test from "node:test";
import { getBackendOrigin } from "../src/server/backend-config";

const mutableEnvironment = process.env as Record<string, string | undefined>;
const originalEnvironment = mutableEnvironment.NODE_ENV;
const originalBackendUrl = mutableEnvironment.ELOVA_BACKEND_URL;

test.after(() => {
  if (originalEnvironment === undefined) delete mutableEnvironment.NODE_ENV;
  else mutableEnvironment.NODE_ENV = originalEnvironment;
  if (originalBackendUrl === undefined) delete mutableEnvironment.ELOVA_BACKEND_URL;
  else mutableEnvironment.ELOVA_BACKEND_URL = originalBackendUrl;
});

test("production accepts only Tailnet IP and MagicDNS origins", () => {
  mutableEnvironment.NODE_ENV = "production";

  for (const tailnetUrl of [
    "http://100.64.0.1:43181",
    "http://100.127.255.254:43181",
    "http://[fd7a:115c:a1e0::1]:43181",
    "http://gx10.example-tailnet.ts.net:43181",
  ]) {
    mutableEnvironment.ELOVA_BACKEND_URL = tailnetUrl;
    assert.equal(getBackendOrigin().origin, tailnetUrl);
  }

  for (const rejectedUrl of [
    "http://127.0.0.1:43181",
    "http://10.0.0.2:43181",
    "http://172.16.0.2:43181",
    "http://192.168.0.2:43181",
    "http://169.254.0.2:43181",
    "http://100.128.0.1:43181",
    "http://[fd00::1]:43181",
    "http://[fe80::1]:43181",
    "http://gx10:43181",
    "http://gx10.internal:43181",
    "http://gx10.local:43181",
    "http://example-tailnet.ts.net:43181",
    "https://gx10.example-tailnet.ts.net:43181",
    "https://api.example.com:43181",
    "http://8.8.8.8:43181",
    "http://gx10.example-tailnet.ts.net:3001",
    "http://gx10.example-tailnet.ts.net:43180",
  ]) {
    mutableEnvironment.ELOVA_BACKEND_URL = rejectedUrl;
    assert.throws(() => getBackendOrigin(), /Private backend is not configured/);
  }
});

test("local development permits only explicit loopback or Tailnet origins", () => {
  mutableEnvironment.NODE_ENV = "development";
  for (const allowedUrl of [
    "http://127.0.0.1:43181",
    "http://127.255.255.254:43181",
    "http://localhost:43181",
    "http://[::1]:43181",
    "http://100.100.10.20:43181",
  ]) {
    mutableEnvironment.ELOVA_BACKEND_URL = allowedUrl;
    assert.equal(getBackendOrigin().origin, allowedUrl);
  }

  for (const rejectedUrl of [
    "http://10.0.0.2:43181",
    "http://192.168.0.2:43181",
    "http://127.attacker.example:43181",
    "http://api.example.com:43181",
  ]) {
    mutableEnvironment.ELOVA_BACKEND_URL = rejectedUrl;
    assert.throws(() => getBackendOrigin(), /Private backend is not configured/);
  }

  mutableEnvironment.NODE_ENV = "test";
  mutableEnvironment.ELOVA_BACKEND_URL = "http://127.0.0.1:43181";
  assert.throws(() => getBackendOrigin(), /Private backend is not configured/);
});
