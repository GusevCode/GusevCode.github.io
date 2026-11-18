import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeKnowledgeBase } from './fixtures.mjs';
import { infer } from '../js/inferenceEngine.js';
import { rankDrinks } from '../js/ranking.js';
import { topReasons, rankingView } from '../js/drinkViews.js';
const kb = makeKnowledgeBase();

test('Все напитки имеют локальное JPEG-изображение с размерами, описанием и указанием источника', () => {
  let photos = 0;
  for (const drink of kb.drinks) {
    const p = drink.photo;
    assert.ok(p && typeof p.src === 'string');
    assert.match(p.alt, /[а-яё]/iu);
    assert.ok(Number.isInteger(p.width) && p.width > 0);
    assert.ok(Number.isInteger(p.height) && p.height > 0);
    assert.equal(p.src, `img/drinks/${drink.id}.jpg`);
    assert.ok(p.credit.author);
    assert.match(p.credit.source, /^https:\/\/world\.openfoodfacts\.org\/product\/\d+$/u);
    assert.equal(p.credit.license, 'CC BY-SA 3.0');
    assert.equal(p.credit.licenseUrl, 'https://creativecommons.org/licenses/by-sa/3.0/');
    const credits = readFileSync(new URL('../credits.html', import.meta.url), 'utf8');
    assert.ok(credits.includes(p.credit.source) && credits.includes(p.credit.image));
    const bytes = readFileSync(new URL(`../${p.src}`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
    assert.ok(Math.max(p.width, p.height) <= 800);
    photos++;
  }
  assert.equal(photos, 20);
});
test('Три причины выбираются по наибольшему положительному вкладу без изменения исходного списка', () => {
  const row = { contributions: [
    { ruleId: 'R01', points: -3 }, { ruleId: 'R02', points: 0 }, { ruleId: 'R03', points: 5 },
    { ruleId: 'R04', points: 12 }, { ruleId: 'R05', points: 9 }, { ruleId: 'R06', points: 7 }
  ] };
  const before = structuredClone(row);
  assert.deepEqual(topReasons(row).map(c => c.ruleId), ['R04', 'R05', 'R06']);
  assert.deepEqual(row, before);
});
test('Живой и полный рейтинги выделяют одного лидера, содержат все объекты и не содержат внешних ссылок на фото', () => {
  const empty = rankDrinks(kb, infer(kb));
  const live = rankingView(kb, empty);
  assert.match(live, /Пока все варианты равны/u);
  assert.equal((live.match(/data-drink=/gu) || []).length, 5);
  assert.equal((live.match(/class="rank-item leader-card/gu) || []).length, 1);
  assert.equal(/https?:\/\//i.test(live), false);
  const ranked = rankDrinks(kb, infer(kb, [{ questionId: 'Q01', value: 'party' }, { questionId: 'Q02', value: 'diet' }]));
  const full = rankingView(kb, ranked, { full: true, changed: true });
  assert.equal((full.match(/data-drink=/gu) || []).length, 20);
  assert.equal((full.match(/class="rank-item compact-drink/gu) || []).length, 19);
  assert.match(full, /leader-changed/u);
  assert.equal(/https?:\/\//i.test(full), false);
  assert.ok(full.indexOf(`data-drink="${ranked[0].drink.id}"`) < full.indexOf(`data-drink="${ranked[1].drink.id}"`));
  for (const reason of topReasons(ranked[0])) assert.ok(full.includes(`data-rule="${reason.ruleId}"`));
  for (const row of ranked) assert.ok(full.includes(row.drink.photo.src));
  assert.equal((full.match(/loading="lazy" decoding="async"/gu) || []).length, 20);
});
