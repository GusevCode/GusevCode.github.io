import test from 'node:test';
import assert from 'node:assert/strict';
import { makeKnowledgeBase, readData } from './fixtures.mjs';
import { infer } from '../js/inferenceEngine.js';
import { rankDrinks } from '../js/ranking.js';
import { knowledgeView, databaseView, workingSnapshot } from '../js/inspectionViews.js';
const kb = makeKnowledgeBase();
const source = Object.fromEntries(['drinks', 'questions', 'rules'].map(name => [`${name}.json`, readData(name)]));
test('Представление знаний содержит все подразделы, коды ответов и обе связи с правилами', () => {
  const html = knowledgeView(kb, source);
  for (const id of ['objects', 'attributes', 'questions', 'derive', 'score', 'photos', 'json']) assert.ok(html.includes(`id="kb-${id}"`));
  assert.equal((html.match(/data-search-row="questions"/gu) || []).length, 27);
  assert.equal((html.match(/data-search-row="rules"/gu) || []).length, 85);
  for (const q of kb.questions) {
    assert.ok(html.includes(q.image));
    assert.ok(html.includes(`<code>${q.param}</code>`));
    for (const o of q.options) assert.ok(html.includes(`<code>${o.value}</code>`));
  }
  assert.match(html, /Может быть пропущен по правилу/u);
  assert.match(html, /data-rule="R71"/u);
  for (const name of Object.keys(source)) assert.ok(html.includes(name));
});
test('РБД показывает нейтральные, незаданные и выведенные параметры, историю и все оценки', () => {
  const answers = [{ questionId: 'Q01', value: null }, { questionId: 'Q02', value: 'diet' }];
  const db = infer(kb, answers);
  const html = databaseView(kb, db, answers, rankDrinks(kb, db));
  for (const id of ['parameters', 'history', 'log', 'scores', 'json']) assert.ok(html.includes(`id="db-${id}"`));
  assert.match(html, /Ответ: не важно/u);
  assert.match(html, /Не задан/u);
  assert.match(html, /Пропущен \(выведен правилом R71\)/u);
  for (const d of kb.drinks) assert.ok(html.includes(d.name));
  assert.match(html, /Вклады \(/u);
  assert.match(html, /data-download-database/u);
});
test('JSON-снимок точно хранит ответы, факты и журнал, независимо от изменений копии', () => {
  const answers = [{ questionId: 'Q01', value: 'party' }];
  const db = infer(kb, answers);
  const snapshot = workingSnapshot(db, answers);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), { ...db, answers });
  snapshot.facts.occasion.value = 'changed';
  snapshot.answers.pop();
  snapshot.log.length = 0;
  assert.equal(db.facts.occasion.value, 'party');
  assert.equal(answers.length, 1);
  assert.ok(db.log.length > 0);
});
test('JSON и пользовательские данные экранируются в представлениях', () => {
  const altered = structuredClone(kb);
  altered.questions[0].text = '<script>опасный текст</script>';
  const html = knowledgeView(altered, { 'questions.json': { text: '</pre><script>опасный текст</script>' } });
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('&lt;script&gt;'));
});
