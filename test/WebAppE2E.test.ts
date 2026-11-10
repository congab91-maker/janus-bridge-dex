import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import deploymentsData from "../src/lib/deployments.json";

describe("Janus DEX — Next.js Production Web App E2E Verification", () => {
  let serverProc: ChildProcess | null = null;
  const PORT = 3095;
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    serverProc = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["next", "start", "-p", String(PORT)],
      {
        cwd: process.cwd(),
        stdio: "pipe",
        shell: true,
      }
    );

    // Wait up to 20s for Next.js production server to listen
    const start = Date.now();
    while (Date.now() - start < 20_000) {
      try {
        const res = await fetch(BASE_URL);
        if (res.ok) break;
      } catch {
        // wait
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }, 30_000);

  afterAll(() => {
    if (serverProc) {
      serverProc.kill();
    }
  });

  it("1. Serves Janus DEX Dashboard with HTTP 200 and renders Shared-State AMM pools, deployed contract address, and real Hadrian transactions", async () => {
    const res = await fetch(BASE_URL);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain("JANUS DEX");
    expect(html).toContain("wSOL / wUSDC");
    expect(html).toContain("wETH / wUSDC");
    expect(html).toContain("ARCV / wUSDC");
    expect(html).toContain("BPT2 / wUSDC");
    expect(html).toContain(deploymentsData.hadrian.contractAddress.slice(0, 10));
    expect(html).toContain(deploymentsData.transactions[0].txHash.slice(0, 10));
  });
});
