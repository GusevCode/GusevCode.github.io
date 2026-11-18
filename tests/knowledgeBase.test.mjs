import test from 'node:test';
import assert from 'node:assert/strict';
import { makeKnowledgeBase, readData } from './fixtures.mjs';
import { createKnowledgeBase } from '../js/knowledgeBase.js';
import { readFileSync } from 'node:fs';
const kb = makeKnowledgeBase();
test('Каждый вопрос имеет собственную SVG-иллюстрацию и русское альтернативное описание', () => {
  const images = new Set();
  for (const q of kb.questions) {
    assert.equal(q.image, `img/questions/${q.id}.svg`);
    assert.match(q.imageAlt, /[а-яё]/iu);
    const svg = readFileSync(new URL(`../${q.image}`, import.meta.url), 'utf8');
    assert.match(svg.trimStart(), /^(<svg\b|<\?xml\b)/u);
    assert.match(svg, /viewBox="0 0 320 200"/u);
    assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/u);
    assert.match(svg, /<title\b[^>]*>[^<]+<\/title>/u);
    assert.match(svg.trimEnd(), /<\/svg>$/u);
    assert.doesNotMatch(svg, /<\s*(script|text|image|foreignObject)\b|\bon\w+\s*=/iu);
    assert.equal(svg.includes(String.fromCharCode(63, 63)), false);
    assert.ok(Buffer.byteLength(svg, 'utf8') < 10000);
    assert.equal(images.has(svg), false, `${q.id}: иллюстрация должна быть самостоятельной`);
    images.add(svg);
  }
  assert.equal(images.size, kb.questions.length);
});
test('Выполнены количественные требования паспорта', () => {
  assert.ok(kb.questions.length >= 20);
  assert.ok(Object.keys(kb.parameters).length >= 10);
  assert.equal(kb.drinks.length, 20);
  assert.equal(Object.keys(kb.attributes).length, 12);
  assert.ok(kb.rules.length >= 40);
  assert.ok(kb.rules.filter(r => r.type === 'derive').length >= 6);
  assert.ok(kb.rules.some(r => r.type === 'score'));
});
test('Все двадцать напитков и двенадцать атрибутов соответствуют паспорту', () => {
  assert.deepEqual(kb.drinks.map(d => d.name), ['Coca-Cola Original Taste', 'Coca-Cola Zero Sugar', 'Coca-Cola Vanilla', 'Coca-Cola Cherry', 'Coca-Cola Lemon', 'Coca-Cola Orange', 'Coca-Cola Coffee', 'Coca-Cola Raspberry', 'Добрый Cola', 'Добрый Cola без сахара', 'Pepsi', 'Pepsi Zero Sugar', 'Pepsi Max', 'Черноголовка Cola', 'Черноголовка Cola без сахара', 'Street Cola', 'Любимый Cola', 'Байкал Cola', 'Royal Cola', 'Fritz-Kola']);
  assert.deepEqual(Object.keys(kb.attributes), ['sweetness', 'sugar', 'calories', 'classicTaste', 'unusualTaste', 'carbonation', 'foodPairing', 'partyFit', 'everydayUse', 'popularity', 'price', 'tasteIntensity']);
});
test('Свойства заполнены, шкалы корректны, версии без сахара согласованы', () => {
  for (const attr of Object.values(kb.attributes)) for (const key of ['name', 'description', 'scale']) assert.match(attr[key], /[а-яё]/iu);
  for (const d of kb.drinks) {
    assert.equal(Object.keys(d.attributes).length, 12);
    for (const v of Object.values(d.attributes)) assert.ok(Number.isInteger(v) && v >= 1 && v <= 5);
    assert.match(d.description, /[а-яё]/iu);
    for (const [key, definition] of Object.entries(kb.factDefinitions)) {
      const value = key === 'brand' ? d.brand : d.facts[key];
      if (definition.type === 'number') assert.ok(value >= definition.min && value <= definition.max);
      else assert.ok(definition.values.some(v => v.value === value));
    }
    if (!d.facts.hasSugar) { assert.equal(d.attributes.sugar, 1); assert.equal(d.attributes.calories, 1); }
  }
});
test('Каждый содержательный ответ покрыт правилом, нейтральный не покрыт', () => {
  for (const q of kb.questions) {
    assert.equal(q.options.filter(o => o.value === null).length, 1);
    for (const o of q.options) assert.equal(kb.rules.some(r => r.if.param === q.param && r.if.eq === o.value), o.value !== null, `${q.id}: ${o.value}`);
  }
});
test('Все ссылки правил ведут к существующим параметрам, значениям и атрибутам', () => {
  const valid = (param, value) => kb.parameters[param]?.options.some(o => o.value !== null && o.value === value);
  for (const r of kb.rules) {
    assert.match(r.explain, /[а-яё]/iu);
    assert.ok(valid(r.if.param, r.if.eq));
    assert.ok(['derive', 'score'].includes(r.type));
    for (const e of r.then) {
      if (r.type === 'derive') {
        assert.ok(kb.questions.some(q => q.param === e.param));
        assert.ok(valid(e.param, e.value));
      } else {
        assert.ok(Object.hasOwn(kb.attributes, e.attr) || Object.hasOwn(kb.factDefinitions, e.attr));
        assert.ok(['high', 'low', 'eq', 'gte', 'lte'].includes(e.op));
        assert.ok(Number.isFinite(e.weight) && e.weight !== 0);
        const definition = kb.factDefinitions[e.attr];
        if (e.op === 'eq' && definition?.values) assert.ok(definition.values.some(v => v.value === e.value));
        if (['gte', 'lte'].includes(e.op)) assert.ok(e.value >= 1 && e.value <= 5);
      }
    }
  }
});
test('Проверка базы отвергает повреждённые ссылки и непокрытые ответы', () => {
  const rules = readData('rules');
  rules.rules[0].then[0].attr = 'missing';
  assert.throws(() => createKnowledgeBase(readData('drinks'), readData('questions'), rules), /Неизвестный атрибут/);
  const questions = readData('questions');
  questions.questions[0].options.push({ value: 'uncovered', label: 'Непокрытый ответ' });
  assert.throws(() => createKnowledgeBase(readData('drinks'), questions, readData('rules')), /Нет правила/);
});
