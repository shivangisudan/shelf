import { GoogleGenAI, Type } from "@google/genai";
import { CATEGORIES, isCategory, type Category } from "@/lib/taxonomy";
import { canonicalProductName, compatibleUnits } from "@/lib/catalog";

const MODEL = "gemini-3.6-flash";
const ACCEPTED_FORMATS =
  "m4a, mp3, wav, webm, ogg, jpg, jpeg, png, webp, or heic";
const EXTENSION_MIME_TYPES: Record<string, string> = {
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};
const SUPPORTED_MIME_TYPES = new Set(Object.values(EXTENSION_MIME_TYPES));
const SYSTEM_INSTRUCTION = `You are a cataloging assistant for small Indian retail merchants — kirana store
owners, artisans, and street vendors. You receive either a voice note or a
photograph of a shelf, and you turn it into clean structured product data.

For AUDIO input:
The merchant is speaking in an Indian language — Hindi, Tamil, Marathi, Bengali,
Telugu, Kannada, Gujarati, Punjabi, Malayalam, or Indian English. Code-mixing
with English is extremely common and normal ("do packet Maggi", "sau gram haldi").
Understand the audio directly. Do not ask for clarification.
Extract starting stock from the audio itself. A spoken count such as "do packet
Maggi" means stock_quantity 2 and stock_unit "packets". A phrase such as "five
kilo rice" means stock_quantity 5 and stock_unit "kg". Convert Indian number
words and quantity phrases into a numeric stock quantity and a short unit. If a
product is named without a count, use stock_quantity 1 and stock_unit "unit" as
the inferred starting stock so the merchant can correct it during review.
The merchant may describe one product or several in a single recording. Extract
every distinct product mentioned.
Return exactly one product entry per real product. If the same product is
mentioned more than once, merge the mentions into one entry and sum compatible
stock quantities. Never return one entry per packet, shelf occurrence, or repeat
mention. Treat common variants such as aata/atta and cheeni/sugar as the same
product.
Preserve brand names exactly as spoken — Parle-G, Tata Salt, Amul, Surf Excel,
Colgate, Maggi, Britannia, Fortune, Aashirvaad. Do not translate or "correct"
brand names.
Indian quantity vocabulary: "pav" = 250g, "adha/aadha kilo" = 500g, "sawa kilo"
= 1.25kg, "dozen" = 12 units, "packet" and "pouch" are units, not weights.
Prices are in Indian Rupees. "Das rupaye" = 10, "pachaas" = 50, "sau" = 100,
"dhai sau" = 250.

For IMAGE input:
Read product labels off the packaging visible on the shelf. Identify every
clearly distinguishable product. Several stacked units of the same product are
ONE product entry, not many.
Do not guess at products that are blurry, cut off at the frame edge, or turned
away from the camera — omit them entirely rather than inventing a name.
If a price tag or shelf label is legible, read the price. Otherwise price is null.

FOR BOTH:
- Category must be exactly one of the allowed values. If unsure, use "Other".
  Never invent a category.
- Description is a short, plain retail listing a customer would read. No
  marketing hype, no exclamation marks, no invented health claims.
- NEVER invent a price. If none was stated or shown, price is null.
- NEVER invent a quantity. If none was stated or shown, quantity_unit is null.
- Confidence is "low" when audio is unclear or the image is hard to read,
  "medium" when you inferred something reasonable, "high" only when the product
  was stated or shown plainly.
- If you cannot extract a single product with any confidence, return an empty
  products array. An empty array is a correct answer. A fabricated product is not.

Allowed categories: ${CATEGORIES.join(", ")}`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    products: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          name_original: { type: Type.STRING },
          category: { type: Type.STRING, enum: [...CATEGORIES] },
          description: { type: Type.STRING },
          price: { type: Type.NUMBER, nullable: true },
          quantity_unit: { type: Type.STRING, nullable: true },
          stock_quantity: { type: Type.NUMBER, nullable: true },
          stock_unit: { type: Type.STRING, nullable: true },
          confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
        },
        required: [
          "name",
          "name_original",
          "category",
          "description",
          "price",
          "quantity_unit",
          "stock_quantity",
          "stock_unit",
          "confidence",
        ],
      },
    },
    language_detected: { type: Type.STRING },
  },
  required: ["products", "language_detected"],
};

function normalizeCategory(value: unknown): Category {
  return isCategory(value) ? value : "Other";
}

function normalizeProducts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value.map((product) => {
    const item = product && typeof product === "object" ? product : {};
    const record = item as Record<string, unknown>;

    return {
      name: typeof record.name === "string" ? record.name : "",
      name_original:
        typeof record.name_original === "string" ? record.name_original : "",
      category: normalizeCategory(record.category),
      description:
        typeof record.description === "string" ? record.description : "",
      price: typeof record.price === "number" ? record.price : null,
      quantity_unit:
        typeof record.quantity_unit === "string"
          ? record.quantity_unit
          : null,
      stock_quantity:
        typeof record.stock_quantity === "number" && record.stock_quantity >= 0
          ? record.stock_quantity
          : null,
      stock_unit: typeof record.stock_unit === "string" ? record.stock_unit : null,
      confidence:
        record.confidence === "high" ||
        record.confidence === "medium" ||
        record.confidence === "low"
          ? record.confidence
          : "low",
    };
  });

  const merged = new Map<string, (typeof normalized)[number]>();
  for (const product of normalized) {
    const key = canonicalProductName(product.name || product.name_original);
    if (!key) {
      merged.set(`unnamed-${merged.size}`, product);
      continue;
    }
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, product);
      continue;
    }
    const sameUnit = compatibleUnits(previous.stock_unit, product.stock_unit);
    previous.stock_quantity = sameUnit
      ? (previous.stock_quantity ?? 0) + (product.stock_quantity ?? 0)
      : previous.stock_quantity;
    if (!previous.stock_unit) previous.stock_unit = product.stock_unit;
    if (!previous.name_original) previous.name_original = product.name_original;
    if (previous.confidence === "low" && product.confidence !== "low") previous.confidence = product.confidence;
  }
  return [...merged.values()];
}

function resolveMimeType(file: File): string | null {
  const incomingType = file.type.trim().toLowerCase().split(";", 1)[0];

  if (incomingType && incomingType !== "application/octet-stream") {
    return SUPPORTED_MIME_TYPES.has(incomingType) ? incomingType : null;
  }

  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_MIME_TYPES[extension] ?? null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    const image = formData.get("image");
    const language = formData.get("language");
    const example = formData.get("example");
    const audioFile = audio instanceof File ? audio : null;
    const imageFile = image instanceof File ? image : null;
    const exampleText = typeof example === "string" && example.trim() ? example.trim() : null;
    const languageContext = typeof language === "string" && language.trim() ? language.trim() : "auto-detect";

    // Exactly one input. "example" is a text field, "audio" and "image" are
    // files, and all three are named here so a malformed request says which
    // one it got wrong.
    const provided = [
      audioFile ? "audio" : null,
      imageFile ? "image" : null,
      exampleText ? "example" : null,
    ].filter((field): field is string => field !== null);

    if (provided.length === 0) {
      return Response.json(
        { error: 'Provide one input: an "audio" file, an "image" file, or an "example" text field.' },
        { status: 400 },
      );
    }
    if (provided.length > 1) {
      return Response.json(
        { error: `Provide only one input. Received ${provided.join(" and ")}.` },
        { status: 400 },
      );
    }

    if (exampleText) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Extract products from this merchant example: ${exampleText}\nPreferred language context: ${languageContext}.`,
              },
            ],
          },
        ],
        config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: "application/json", responseSchema },
      });
      const parsed = JSON.parse(response.text ?? "{}");
      return Response.json({
        products: normalizeProducts(parsed?.products),
        language_detected: typeof parsed?.language_detected === "string" ? parsed.language_detected : "",
      });
    }

    // Narrowing only — the checks above already guarantee exactly one of these.
    const file = audioFile ?? imageFile;
    if (!file) {
      return Response.json({ error: "Could not read the uploaded file." }, { status: 400 });
    }
    const mimeType = resolveMimeType(file);
    if (!mimeType) {
      return Response.json(
        { error: `Unsupported file format. Accepted formats: ${ACCEPTED_FORMATS}.` },
        { status: 400 },
      );
    }
    const mediaType = audioFile ? "audio" : "image";
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data } },
            { text: `Extract products from this ${mediaType} input. Preferred language context: ${languageContext}.` },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    const parsed = JSON.parse(response.text ?? "{}");
    return Response.json({
      products: normalizeProducts(parsed?.products),
      language_detected:
        typeof parsed?.language_detected === "string"
          ? parsed.language_detected
          : "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}