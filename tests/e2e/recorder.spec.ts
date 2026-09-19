import { expect, test, type Page } from "@playwright/test";

/**
 * The voice recorder, driven against Chromium's synthetic microphone.
 *
 * /api/extract is stubbed: what matters here is that tapping once starts the
 * mic, tapping again stops it and hands a real audio blob to the extractor,
 * and that the mic is released afterwards.
 */

/**
 * Track every MediaStream getUserMedia hands out, so a test can assert the mic
 * was actually released rather than just that the UI stopped showing it.
 */
async function trackMediaStreams(page: Page) {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    (window as unknown as { __streams: MediaStream[] }).__streams = streams;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      streams.push(stream);
      return stream;
    };
  });
}

function liveTrackCount(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __streams: MediaStream[] }).__streams
      .flatMap((stream) => stream.getTracks())
      .filter((track) => track.readyState === "live").length,
  );
}

async function stubExtract(page: Page) {
  await page.route("**/api/extract", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: [{
          name: "Sugar", name_original: "चीनी", category: "Grocery & Staples",
          description: "Sugar for the shelf", price: 40, quantity_unit: null,
          stock_quantity: 2, stock_unit: "kg", confidence: "high",
        }],
        language_detected: "hi",
      }),
    });
  });
}

test.describe("voice recorder", () => {
  // The record button breathes on a loop, which never lets Playwright call it
  // "stable". Reduced motion stops the animation — globals.css already honours
  // it — so clicks land, and the accessibility path gets exercised too.
  test.use({ permissions: ["microphone"], reducedMotion: "reduce" });

  test("tap starts the mic, tap again stops it and extraction begins", async ({ page }) => {
    await trackMediaStreams(page);
    await stubExtract(page);
    await page.goto("/");

    await expect(page.getByText("Tap to speak")).toBeVisible();
    await page.getByRole("button", { name: "Start recording" }).click();

    const stopButton = page.getByRole("button", { name: "Stop recording" });
    await expect(stopButton).toBeVisible();
    await expect(stopButton).toHaveAttribute("aria-pressed", "true");
    // The waveform only renders while a live stream is attached.
    await expect(page.locator("canvas.waveform-canvas")).toBeVisible();
    expect(await liveTrackCount(page)).toBe(1);

    // Comfortably past the 400ms minimum take length.
    await page.waitForTimeout(1500);
    await stopButton.click();

    const request = await page.waitForRequest(
      (candidate) => candidate.url().includes("/api/extract") && candidate.method() === "POST",
    );
    expect(request.postData()).toContain("recording.");
    await expect(page.getByLabel("Product name")).toHaveValue("Sugar");
  });

  test("the microphone is released when recording stops", async ({ page }) => {
    await trackMediaStreams(page);
    await stubExtract(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Stop recording" }).click();

    await expect(page.getByLabel("Product name")).toBeVisible();
    // No track left live: useRecorder stopped every one of them.
    await expect.poll(() => liveTrackCount(page)).toBe(0);
  });

  test("a second recording works after the first", async ({ page }) => {
    await trackMediaStreams(page);
    await stubExtract(page);
    await page.goto("/");

    for (const attempt of [1, 2]) {
      await page.getByRole("button", { name: "Start recording" }).click();
      await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Stop recording" }).click();
      await expect(page.getByLabel("Product name")).toBeVisible();

      expect(await liveTrackCount(page), `take ${attempt} released the mic`).toBe(0);

      if (attempt === 1) {
        // Switching modes and back is how the screen resets between takes.
        await page.getByRole("tab", { name: "Photo" }).click();
        await page.getByRole("tab", { name: "Speak" }).click();
        await expect(page.getByText("Tap to speak")).toBeVisible();
      }
    }
  });
});

test.describe("voice recorder without permission", () => {
  test.use({ permissions: [], reducedMotion: "reduce" });

  test("explains that mic access is needed, and retry still works once granted", async ({ page, context }) => {
    await stubExtract(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Start recording" }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Shelf needs mic access");
    // Still offering the same control, not a dead end.
    await expect(page.getByRole("button", { name: "Start recording" })).toBeEnabled();

    await context.grantPermissions(["microphone"]);
    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  });
});
