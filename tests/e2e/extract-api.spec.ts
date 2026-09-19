import { expect, test } from "@playwright/test";

/**
 * The real /api/extract contract, against real Gemini. Kept apart from
 * flow.spec.ts because it costs a model call and its output is not fixed —
 * these assert the request contract and the response shape, never the
 * particular products the model picked out.
 *
 * Requires GEMINI_API_KEY in .env.local.
 */

const CATEGORIES = [
  "Grocery & Staples", "Snacks & Beverages", "Personal Care", "Household",
  "Stationery", "Apparel & Textiles", "Handicrafts", "Other",
];

test.describe("POST /api/extract", () => {
  test("the example field returns real, structured products", async ({ request }) => {
    const response = await request.post("/api/extract", {
      multipart: { example: "5 packet Parle-G, 10 rupees each", language: "English" },
    });

    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.products)).toBe(true);
    expect(typeof payload.language_detected).toBe("string");
    expect(payload.products.length).toBeGreaterThan(0);

    for (const product of payload.products) {
      expect(typeof product.name).toBe("string");
      expect(product.name.length).toBeGreaterThan(0);
      expect(CATEGORIES).toContain(product.category);
      expect(["high", "medium", "low"]).toContain(product.confidence);
      expect(product.price === null || typeof product.price === "number").toBe(true);
    }
  });

  test("repeated mentions of one product come back as one entry", async ({ request }) => {
    const response = await request.post("/api/extract", {
      multipart: {
        example: "do kilo cheeni, aur ek kilo cheeni aur, phir paanch packet Parle-G",
        language: "हिन्दी",
      },
    });

    expect(response.status()).toBe(200);
    const payload = await response.json();
    const canonical = payload.products.map((product: { name: string }) =>
      product.name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
    );
    expect(new Set(canonical).size).toBe(canonical.length);
  });

  test("an empty request names all three accepted fields", async ({ request }) => {
    const response = await request.post("/api/extract", { multipart: { language: "English" } });

    expect(response.status()).toBe(400);
    const { error } = await response.json();
    expect(error).toContain("audio");
    expect(error).toContain("image");
    expect(error).toContain("example");
  });

  test("sending two inputs at once says which two", async ({ request }) => {
    const response = await request.post("/api/extract", {
      multipart: {
        example: "5 packet Parle-G",
        image: { name: "shelf.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50]) },
      },
    });

    expect(response.status()).toBe(400);
    const { error } = await response.json();
    expect(error).toContain("only one");
    expect(error).toContain("image");
    expect(error).toContain("example");
  });

  test("an unsupported file format is rejected before the model is called", async ({ request }) => {
    const response = await request.post("/api/extract", {
      multipart: {
        audio: { name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
      },
    });

    expect(response.status()).toBe(400);
    const { error } = await response.json();
    expect(error).toContain("Unsupported file format");
  });
});
