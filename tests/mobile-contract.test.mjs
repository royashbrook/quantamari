import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile layout keeps the playfield clear and touch controls available", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const mobileStart = css.indexOf("@media (max-width: 860px)");
  assert.notEqual(mobileStart, -1);
  const mobileCss = css.slice(mobileStart, css.indexOf("@media", mobileStart + 1));

  assert.match(mobileCss, /\.fact-card\s*\{\s*display:\s*none;/);
  assert.match(mobileCss, /\.controls\s*\{\s*display:\s*none;/);
  assert.match(mobileCss, /\.touch-tip[\s\S]*display:\s*block;/);
  assert.match(mobileCss, /\.scale-card[\s\S]*width:\s*min\(248px/);
  assert.match(mobileCss, /\.stats[\s\S]*bottom:\s*14px/);
});
