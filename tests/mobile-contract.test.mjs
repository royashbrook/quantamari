import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile layout keeps the playfield clear and touch controls available", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const guideCss = await readFile(
    new URL("../app/field-guide.module.css", import.meta.url),
    "utf8",
  );
  const mobileStart = css.indexOf("@media (max-width: 860px)");
  assert.notEqual(mobileStart, -1);
  const mobileCss = css.slice(mobileStart, css.indexOf("@media", mobileStart + 1));

  assert.match(mobileCss, /\.fact-card\s*\{\s*display:\s*none;/);
  assert.match(mobileCss, /\.controls\s*\{\s*display:\s*none;/);
  assert.match(mobileCss, /\.touch-tip[\s\S]*display:\s*block;/);
  assert.match(mobileCss, /\.scale-card[\s\S]*width:\s*min\(248px/);
  assert.match(mobileCss, /\.stats[\s\S]*bottom:\s*14px/);
  assert.match(css, /\.shell,\s*\.world\s*\{[\s\S]*min-height:\s*0/);
  assert.doesNotMatch(mobileCss, /min-height:\s*[4-9]\d{2}px/);
  assert.match(page, /aria-label="Open rolled-up field guide"/);
  assert.match(page, /aria-label="Open scale and science atlas"/);
  assert.match(page, /labReturnRef/);
  assert.match(page, /labEra === null &&/);
  assert.match(page, /factCard:\s*lastFact/);
  assert.match(page, /setLastFact\(factCard\)/);
  assert.match(page, /game\.x \+ game\.originX/);
  assert.match(page, /setMashProxyLod/);
  assert.match(page, /centralSceneryProxy/);
  assert.match(guideCss, /min-height:\s*44px/);
  for (const form of ["shoe", "couch", "guitar", "table", "tower"]) {
    assert.match(
      guideCss,
      new RegExp(`data-form=["']${form}["']`),
      `${form} needs its own guide silhouette`,
    );
  }
  assert.match(
    guideCss.slice(guideCss.indexOf("@media (max-width: 760px)")),
    /\.fact,[\s\S]*font-size:\s*13px/,
  );
});
