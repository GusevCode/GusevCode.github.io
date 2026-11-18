import test from 'node:test';
import assert from 'node:assert/strict';
import { effectPoints, rankDrinks } from '../js/ranking.js';
import { infer } from '../js/inferenceEngine.js';
import { makeKnowledgeBase } from './fixtures.mjs';
const kb = makeKnowledgeBase();
test('Все операции начисления и отрицательные веса работают', () => {
  const d = kb.drinks[0];
  for (const [attr, op, weight, value, expected] of [
    ['sweetness', 'high', 3, undefined, 12], ['sweetness', 'low', 3, undefined, 6],
    ['sugar', 'high', -2, undefined, -10], ['brand', 'eq', 8, 'Coca-Cola', 8],
    ['hasSugar', 'eq', 8, false, 0], ['sweetness', 'gte', 7, 4, 7],
    ['sweetness', 'gte', 7, 5, 0], ['sweetness', 'lte', -7, 4, -7], ['sweetness', 'lte', 7, 3, 0]
  ]) assert.equal(effectPoints({ attr, op, weight, value }, d), expected);
  assert.throws(() => effectPoints({ attr: 'sweetness', op: 'invalid', weight: 1 }, d), /Неизвестная операция/);
});
test('Нормализация следует теоретическим границам, включая штрафы', () => {
  const model = { ...kb, rules: kb.rules.filter(r => r.id === 'R16') };
  const result = rankDrinks(model, { facts: { sugarAttitude: { value: 'avoid', source: 'user' } } });
  assert.equal(result.find(r => r.drink.id === 'coca-zero').rawScore, 14);
  assert.equal(result.find(r => r.drink.id === 'coca-zero').score, 100);
  assert.equal(result.find(r => r.drink.id === 'coca-original').rawScore, -10);
  assert.equal(result.find(r => r.drink.id === 'coca-original').score, 0);
});
test('Без ответов оценки равны; ничьи разрешаются детерминированно', () => {
  const result = rankDrinks(kb, infer(kb));
  assert.ok(result.every(r => r.score === 50 && r.rawScore === 0 && r.contributions.length === 0));
  assert.deepEqual(rankDrinks({ ...kb, drinks: [...kb.drinks].reverse() }, infer(kb)), result);
  for (let i = 1; i < result.length; i++) {
    const a = result[i - 1].drink, b = result[i].drink;
    assert.ok(a.attributes.popularity > b.attributes.popularity || (a.attributes.popularity === b.attributes.popularity && a.name.localeCompare(b.name, 'ru') <= 0));
  }
});
test('Выбор без сахара поднимает соответствующие варианты; вклады объяснимы', () => {
  const db = infer(kb, [{ questionId: 'Q01', value: null }, { questionId: 'Q02', value: 'diet' }]);
  const before = structuredClone({ kb, db });
  const result = rankDrinks(kb, db);
  assert.ok(result.slice(0, 5).every(r => r.drink.facts.hasSugar === false));
  for (let i = 0; i < result.length; i++) {
    const r = result[i];
    assert.ok(r.score >= 0 && r.score <= 100);
    if (i) assert.ok(result[i - 1].rawScore >= r.rawScore);
    assert.ok(r.contributions.every(c => c.ruleId && /[а-яё]/iu.test(c.explain)));
    for (const c of r.contributions) assert.equal(c.points, c.effects.reduce((sum, e) => sum + e.points, 0));
  }
  assert.deepEqual({ kb, db }, before);
});
