/**
 * Local Loopback Preview Server & Camera Ownership Relay Unit Tests
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { LocalPreviewServer } from "../src/local-preview-server.ts";

test("Local Preview Server: Binds to 127.0.0.1:41789 and serves status and preview snapshots", async () => {
  const server = new LocalPreviewServer(41789);
  const started = await server.start();
  assert.equal(started, true, "LocalPreviewServer must start on port 41789");
  assert.equal(server.getIsListening(), true);

  // Helper function for HTTP GET
  const httpGet = (path: string): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }> => {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:41789${path}`, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }).on("error", reject);
    });
  };

  try {
    // 1. Test GET /status
    const statusRes = await httpGet("/status");
    assert.equal(statusRes.statusCode, 200);
    assert.ok(statusRes.headers["content-type"]?.includes("application/json"));
    const statusJson = JSON.parse(statusRes.body.toString("utf8"));
    assert.equal(statusJson.owner, "proctor-companion");
    assert.equal(statusJson.port, 41789);
    assert.equal(statusJson.cameraActive, true);
    assert.equal(statusJson.paired, true);

    // 2. Test GET /health
    const healthRes = await httpGet("/health");
    assert.equal(healthRes.statusCode, 200);

    // 3. Test GET /preview?snapshot=true
    const previewRes = await httpGet("/preview?snapshot=true");
    assert.equal(previewRes.statusCode, 200);
    assert.equal(previewRes.headers["content-type"], "image/jpeg");
    assert.ok(previewRes.body.length > 0, "Preview snapshot must contain JPEG bytes");
    // JPEG magic bytes: FF D8
    assert.equal(previewRes.body[0], 0xff);
    assert.equal(previewRes.body[1], 0xd8);

    // 4. Test telemetry state update
    server.updateStatus({
      status: "MONITORING",
      faceCount: 1,
      speechDetected: false,
      incidentsCount: 0,
    });

    const updatedRes = await httpGet("/telemetry");
    const updatedJson = JSON.parse(updatedRes.body.toString("utf8"));
    assert.equal(updatedJson.status, "MONITORING");
    assert.equal(updatedJson.faceCount, 1);
  } finally {
    await server.stop();
    assert.equal(server.getIsListening(), false);
  }
});
