import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIXED_UNIT, canonicalProductName, compatibleUnits, normalizeUnit } from "../lib/catalog.ts";

describe("canonicalProductName", () => {
  it("folds the spelling variants the merchant actually says", () => {
    for (const spelling of ["Aata", "aata", "  AATA  ", "flour", "Wheat Flour"]) {
      assert.equal(canonicalProductName(spelling), "atta");
    }
    for (const spelling of ["Cheeni", "chini", "Shakkar", "sugar", "Sugar"]) {
      assert.equal(canonicalProductName(spelling), "sugar");
    }
  });

  it("ignores case, spacing and punctuation", () => {
    assert.equal(canonicalProductName("Parle-G"), canonicalProductName("parle g"));
    assert.equal(canonicalProductName("Tata Salt"), "tatasalt");
  });

  it("folds Latin accents", () => {
    assert.equal(canonicalProductName("Café"), "cafe");
  });

  it("keeps Indic names distinct instead of collapsing them to nothing", () => {
    // The ASCII-only version returned "" for every one of these, so unrelated
    // products merged into a single catalog row.
    const sugar = canonicalProductName("चीनी");
    const atta = canonicalProductName("आटा");
    const tamil = canonicalProductName("சர்க்கரை");
    assert.notEqual(sugar, "");
    assert.notEqual(atta, "");
    assert.notEqual(tamil, "");
    assert.notEqual(sugar, atta);
    assert.notEqual(sugar, tamil);
  });

  it("is stable when applied twice", () => {
    for (const name of ["Aata", "चीनी", "Parle-G", "Café"]) {
      assert.equal(canonicalProductName(canonicalProductName(name)), canonicalProductName(name));
    }
  });

  it("returns an empty key only when there is nothing to key on", () => {
    assert.equal(canonicalProductName("   "), "");
    assert.equal(canonicalProductName("!!!"), "");
  });
});

describe("normalizeUnit", () => {
  it("groups the ways one unit gets written", () => {
    assert.equal(normalizeUnit("packets"), normalizeUnit("packet"));
    assert.equal(normalizeUnit("Pack"), normalizeUnit("pkt"));
    assert.equal(normalizeUnit("Kilo"), normalizeUnit("kg"));
    assert.equal(normalizeUnit("kilograms"), normalizeUnit("kgs"));
    assert.equal(normalizeUnit("pieces"), normalizeUnit("pcs"));
    assert.equal(normalizeUnit("bottles"), normalizeUnit("bottle"));
    assert.equal(normalizeUnit("tubes"), normalizeUnit("tube"));
    assert.equal(normalizeUnit("kg."), normalizeUnit("kg"));
  });

  it("treats blank input as unknown", () => {
    assert.equal(normalizeUnit(null), null);
    assert.equal(normalizeUnit(""), null);
    assert.equal(normalizeUnit("   "), null);
  });

  it("leaves a unit it does not know alone", () => {
    assert.equal(normalizeUnit("  Tin  "), "tin");
  });
});

describe("compatibleUnits", () => {
  it("accepts the same unit written differently", () => {
    assert.ok(compatibleUnits("packet", "packets"));
    assert.ok(compatibleUnits("kg", "Kilo"));
    assert.ok(compatibleUnits("piece", "pcs"));
  });

  it("rejects genuinely different units", () => {
    assert.equal(compatibleUnits("kg", "packet"), false);
    assert.equal(compatibleUnits("bottle", "tube"), false);
    assert.equal(compatibleUnits("g", "kg"), false);
  });

  it("is permissive when either side is unknown", () => {
    assert.ok(compatibleUnits(null, "kg"));
    assert.ok(compatibleUnits("kg", null));
    assert.ok(compatibleUnits("", "kg"));
  });

  it("treats a merged 'mixed' unit as unknown, so restocking still works", () => {
    assert.ok(compatibleUnits(MIXED_UNIT, "kg"));
    assert.ok(compatibleUnits("packet", MIXED_UNIT));
  });
});
