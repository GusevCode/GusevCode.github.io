import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeKnowledgeBase } from './fixtures.mjs';
import { infer } from '../js/inferenceEngine.js';
import { rankDrinks } from '../js/ranking.js';
import { topReasons, rankingView, photoCaption, photoSourcesTable } from '../js/drinkViews.js';
const kb = makeKnowledgeBase();

test('Все напитки имеют локальное изображение, размеры, описание и корректную атрибуцию JPEG', () => {
  let photos = 0;
  const fallback = [];
  for (const drink of kb.drinks) {
    const p = drink.photo;
    assert.ok(p && typeof p.src === 'string');
    assert.match(p.alt, /[а-яё]/iu);
    assert.ok(Number.isInteger(p.width) && p.width > 0);
    assert.ok(Number.isInteger(p.height) && p.height > 0);
    const bytes = readFileSync(new URL(`../${p.src}`, import.meta.url));
    if (p.src.endsWith('.jpg')) {
      photos++;
      assert.equal(p.src, `img/drinks/${drink.id}.jpg`);
      assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
      assert.ok(Math.max(p.width, p.height) <= 800);
      const c = p.credit;
      assert.ok(c && c.productName && c.code && c.changes);
      assert.equal(new URL(c.source).hostname, 'world.openfoodfacts.org');
      assert.ok(c.source.endsWith(`/${c.code}`));
      assert.equal(c.license, 'CC BY-SA 3.0');
      assert.equal(c.licenseUrl, 'https://creativecommons.org/licenses/by-sa/3.0/');
      assert.equal(c.author, 'Open Food Facts contributors');
    } else {
      fallback.push(drink.id);
      assert.equal(p.src, `img/drinks/${drink.id}.svg`);
      assert.equal(p.credit, null);
      const svg = bytes.toString('utf8');
      assert.match(svg, /^<svg\b/u);
      assert.match(svg, /viewBox="0 0 240 360"/u);
      assert.match(svg, /<\/svg>\s*$/u);
      assert.doesNotMatch(svg, /<(script|image|text|foreignObject)\b|\bon\w+\s*=/iu);
      assert.equal(svg.includes(String.fromCharCode(63, 63)), false);
    }
  }
  assert.equal(photos, 20);
  assert.deepEqual(fallback, []);
});
test('Подпись лидера и полная таблица источников сохраняют атрибуцию и отмечают иллюстрации', () => {
  const table = photoSourcesTable(kb);
  for (const drink of kb.drinks) {
    assert.ok(table.includes(drink.name));
    const caption = photoCaption(drink);
    if (drink.photo.credit) {
      const c = drink.photo.credit;
      for (const value of [c.source, c.licenseUrl, c.author, c.license]) {
        assert.ok(table.includes(value));
        assert.ok(caption.includes(value));
      }
    } else assert.match(caption, /Фото недоступно — иллюстрация/u);
  }
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
test('Живой и полный рейтинги выделяют одного лидера и содержат все положенные объекты', () => {
  const empty = rankDrinks(kb, infer(kb));
  const live = rankingView(kb, empty);
  assert.match(live, /Пока все варианты равны/u);
  assert.equal((live.match(/data-drink=/gu) || []).length, 5);
  assert.equal((live.match(/class="rank-item leader-card/gu) || []).length, 1);
  const ranked = rankDrinks(kb, infer(kb, [{ questionId: 'Q01', value: 'party' }, { questionId: 'Q02', value: 'diet' }]));
  const full = rankingView(kb, ranked, { full: true, changed: true });
  assert.equal((full.match(/data-drink=/gu) || []).length, 20);
  assert.equal((full.match(/class="rank-item compact-drink/gu) || []).length, 19);
  assert.match(full, /leader-changed/u);
  assert.ok(full.indexOf(`data-drink="${ranked[0].drink.id}"`) < full.indexOf(`data-drink="${ranked[1].drink.id}"`));
  for (const reason of topReasons(ranked[0])) assert.ok(full.includes(`data-rule="${reason.ruleId}"`));
  for (const row of ranked) assert.ok(full.includes(row.drink.photo.src));
  assert.equal((full.match(/loading="lazy" decoding="async"/gu) || []).length, 20);
});
