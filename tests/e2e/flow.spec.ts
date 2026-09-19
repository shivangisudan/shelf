import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end capture → review → catalog flow, against the real Supabase
 * project. The database is shared, not per-test like localStorage, so every
 * test starts by emptying it.
 *
 * /api/extract is stubbed so the assertions are about the app, not about what
 * Gemini happened to return. The real endpoint is covered in extract-api.spec.ts.
 */

const PRODUCTS_KEY = "shelf-demo-products";
const EVENTS_KEY = "shelf-demo-inventory-events";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? "";

/** Empty the catalog. The secret key bypasses RLS, which grants no delete. */
async function resetDatabase() {
  for (const table of ["inventory_events", "products"]) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=not.is.null`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_SECRET, Authorization: `Bearer ${SUPABASE_SECRET}` },
    });
    if (!response.ok) {
      throw new Error(`Could not clear ${table}: ${response.status} ${await response.text()}`);
    }
  }
}

/** Cut the browser off from Supabase, so lib/db.ts takes its offline path. */
async function goOffline(page: Page) {
  await page.route("**/*.supabase.co/**", (route) => route.abort());
}

test.beforeEach(async () => {
  await resetDatabase();
});

type StubProduct = {
  name: string;
  stock_quantity: number | null;
  stock_unit: string | null;
  price?: number | null;
};

function extraction(products: StubProduct[]) {
  return {
    products: products.map((product) => ({
      name: product.name,
      name_original: product.name,
      category: "Grocery & Staples",
      description: `${product.name} for the shelf`,
      price: product.price ?? null,
      quantity_unit: null,
      stock_quantity: product.stock_quantity,
      stock_unit: product.stock_unit,
      confidence: "high",
    })),
    language_detected: "hi",
  };
}

async function stubExtract(page: Page, products: StubProduct[]) {
  await page.route("**/api/extract", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(extraction(products)),
    });
  });
}

/** Run one capture end to end: chip → extract → save → land on /catalog. */
async function captureAndSave(page: Page, products: StubProduct[]) {
  await stubExtract(page, products);
  await page.goto("/");
  await page.getByRole("button", { name: /5 packet Parle-G/ }).click();
  await expect(page.getByLabel("Product name").first()).toBeVisible();
  await page.getByRole("button", { name: /Add .* to catalog/ }).click();
  await page.waitForURL("**/catalog");
  await expect(page.getByRole("heading", { name: "Your products" })).toBeVisible();
}

function readStorage(page: Page, key: string) {
  return page.evaluate((storageKey) => {
    return JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as Record<string, unknown>[];
  }, key);
}

/** Read a table straight from Supabase, bypassing the app entirely. */
async function fetchRows(table: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: { apikey: SUPABASE_SECRET, Authorization: `Bearer ${SUPABASE_SECRET}` },
  });
  if (!response.ok) throw new Error(`Could not read ${table}: ${response.status}`);
  return response.json();
}

test.describe("capture screen", () => {
  for (const width of [320, 390]) {
    test(`has no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "शेल्फ़" })).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    });
  }

  test("renders the warm light canvas, not a dark theme", async ({ page }) => {
    await page.goto("/");
    const background = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor,
    );
    expect(background).toBe("rgb(251, 247, 240)");
  });

  test("an example chip calls /api/extract and yields editable products", async ({ page }) => {
    await stubExtract(page, [{ name: "Sugar", stock_quantity: 2, stock_unit: "kg", price: 40 }]);
    await page.goto("/");

    const request = page.waitForRequest(
      (candidate) => candidate.url().includes("/api/extract") && candidate.method() === "POST",
    );
    await page.getByRole("button", { name: /5 packet Parle-G/ }).click();
    expect((await request).postData()).toContain("example");

    const nameField = page.getByLabel("Product name");
    await expect(nameField).toHaveValue("Sugar");
    await nameField.fill("Chini");
    await expect(nameField).toHaveValue("Chini");
  });
});

test.describe("saving to the catalog", () => {
  test("shows saving, then success, then opens the catalog", async ({ page }) => {
    await stubExtract(page, [{ name: "Sugar", stock_quantity: 2, stock_unit: "kg" }]);
    await page.goto("/");
    await page.getByRole("button", { name: /5 packet Parle-G/ }).click();

    const save = page.getByRole("button", { name: /Add 1 item to catalog/ });
    await expect(save).toBeEnabled();
    await save.click();

    await expect(page.getByRole("button", { name: /Added 1 item/ })).toBeDisabled();
    await page.waitForURL("**/catalog");
    await expect(page.getByRole("heading", { name: "Sugar" })).toBeVisible();
  });

  test("an edited name is what gets saved", async ({ page }) => {
    await stubExtract(page, [{ name: "Sugar", stock_quantity: 2, stock_unit: "kg" }]);
    await page.goto("/");
    await page.getByRole("button", { name: /5 packet Parle-G/ }).click();
    await page.getByLabel("Product name").fill("Tata Salt");
    await page.getByRole("button", { name: /Add 1 item to catalog/ }).click();

    await page.waitForURL("**/catalog");
    await expect(page.getByRole("heading", { name: "Tata Salt" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sugar" })).toHaveCount(0);
  });

  test("a double tap saves once", async ({ page }) => {
    await stubExtract(page, [{ name: "Sugar", stock_quantity: 2, stock_unit: "kg" }]);
    await page.goto("/");
    await page.getByRole("button", { name: /5 packet Parle-G/ }).click();

    await page.getByRole("button", { name: /Add 1 item to catalog/ }).dblclick();
    await page.waitForURL("**/catalog");

    const products = await fetchRows("products");
    expect(products).toHaveLength(1);
    expect(Number(products[0].stock_quantity)).toBe(2);
    // One save round means one opening stock event, not two.
    expect(await fetchRows("inventory_events")).toHaveLength(1);
  });

  test("the header badge shows the real catalog count", async ({ page }) => {
    await captureAndSave(page, [{ name: "Sugar", stock_quantity: 2, stock_unit: "kg" }]);
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Catalog/ })).toContainText("1");
  });
});

test.describe("one row per product", () => {
  test("Aata then Atta adds stock instead of a second row", async ({ page }) => {
    await captureAndSave(page, [{ name: "Aata", stock_quantity: 5, stock_unit: "kg" }]);
    await expect(page.getByRole("article")).toHaveCount(1);

    await captureAndSave(page, [{ name: "Atta", stock_quantity: 3, stock_unit: "kg" }]);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText("8 kg");
  });

  test("Cheeni then Sugar adds stock instead of a second row", async ({ page }) => {
    await captureAndSave(page, [{ name: "Cheeni", stock_quantity: 2, stock_unit: "kg" }]);
    await captureAndSave(page, [{ name: "Sugar", stock_quantity: 4, stock_unit: "kg" }]);

    await expect(page.getByRole("article")).toHaveCount(1);
    const products = await fetchRows("products");
    expect(products).toHaveLength(1);
    expect(Number(products[0].stock_quantity)).toBe(6);
    expect(products[0].canonical_name).toBe("sugar");
  });

  test("unit aliases count as the same unit", async ({ page }) => {
    await captureAndSave(page, [{ name: "Parle-G", stock_quantity: 5, stock_unit: "packet" }]);
    await captureAndSave(page, [{ name: "Parle G", stock_quantity: 2, stock_unit: "packets" }]);

    await expect(page.getByRole("article")).toHaveCount(1);
    const products = await fetchRows("products");
    expect(products).toHaveLength(1);
    expect(Number(products[0].stock_quantity)).toBe(7);
  });

  test("duplicates already in local storage are collapsed when read", async ({ page }) => {
    // The offline path: with Supabase unreachable the browser is the database,
    // so it has to collapse duplicates the same way the SQL migration does.
    await goOffline(page);
    // Rows written by an older build: two spellings of one product, plus an
    // event belonging to the row that is about to be merged away.
    await page.addInitScript(
      ([productsKey, eventsKey]) => {
        window.localStorage.setItem(productsKey, JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111", name: "Aata", canonical_name: "",
            category: "Grocery & Staples", description: "", language_detected: "hi",
            price: null, quantity_unit: null, stock_quantity: 5, stock_unit: "kg",
            low_stock_threshold: 0, image_url: null, audio_url: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "22222222-2222-4222-8222-222222222222", name: "Atta", canonical_name: "atta",
            category: "Grocery & Staples", description: "", language_detected: "hi",
            price: null, quantity_unit: null, stock_quantity: 3, stock_unit: "kg",
            low_stock_threshold: 0, image_url: null, audio_url: null,
            created_at: "2026-01-02T00:00:00.000Z",
          },
        ]));
        window.localStorage.setItem(eventsKey, JSON.stringify([
          {
            id: "33333333-3333-4333-8333-333333333333",
            product_id: "22222222-2222-4222-8222-222222222222",
            event_type: "extraction", quantity_delta: 3, quantity_after: 3,
            unit: "kg", source: "local-demo", created_at: "2026-01-02T00:00:00.000Z",
          },
        ]));
      },
      [PRODUCTS_KEY, EVENTS_KEY],
    );

    await page.goto("/catalog");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Aata" })).toBeVisible();

    const products = await readStorage(page, PRODUCTS_KEY);
    expect(products).toHaveLength(1);
    expect(products[0].stock_quantity).toBe(8);

    // The merged row's history moved across rather than being orphaned.
    const events = await readStorage(page, EVENTS_KEY);
    const keeperId = products[0].id;
    expect(events.every((event) => event.product_id === keeperId)).toBe(true);
    expect(events.some((event) => event.source === "local-dedupe")).toBe(true);
  });
});

test.describe("stock changes", () => {
  test("restock raises stock, out of stock zeroes it, and history survives", async ({ page }) => {
    await captureAndSave(page, [{ name: "Sugar", stock_quantity: 2, stock_unit: "kg" }]);

    const row = page.getByRole("article");
    await expect(row).toContainText("2 kg");

    await page.getByLabel("Add stock").fill("4");
    await page.getByRole("button", { name: "Restock" }).click();
    await expect(row).toContainText("6 kg");

    await page.getByRole("button", { name: "Out of stock" }).click();
    await expect(row).toContainText("0 kg");

    const products = await fetchRows("products");
    expect(Number(products[0].stock_quantity)).toBe(0);

    // Going to zero must not erase how it got there.
    const events = await fetchRows("inventory_events");
    expect(events.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(["extraction", "restock", "out_of_stock"]),
    );
  });

  test("the catalog survives a reload", async ({ page }) => {
    await captureAndSave(page, [{ name: "Sugar", stock_quantity: 2, stock_unit: "kg" }]);
    await page.reload();

    await expect(page.getByRole("heading", { name: "Sugar" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(1);
  });
});
