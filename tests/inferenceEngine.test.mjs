import test from 'node:test';
import assert from 'node:assert/strict';
import { infer, forwardChain, nextQuestion } from '../js/inferenceEngine.js';
import { rankDrinks } from '../js/ranking.js';
import { makeKnowledgeBase } from './fixtures.mjs';
const kb = makeKnowledgeBase();
const initial = () => ({ facts: {}, log: [], step: 0 });
test('Начальное состояние пустое, порядок вопросов фиксирован', () => {
  assert.deepEqual(infer(kb), initial());
  assert.equal(nextQuestion(kb, [], initial()).id, 'Q01');
});
test('Вечеринка выводит сильную газацию и пропускает её вопрос', () => {
  const answers = [{ questionId: 'Q01', value: 'party' }];
  const db = infer(kb, answers);
  assert.deepEqual(db.facts.occasion, { value: 'party', source: 'user', questionId: 'Q01' });
  assert.deepEqual(db.facts.carbonationLevel, { value: 'high', source: 'derived', ruleId: 'R73' });
  assert.ok(db.log.some(e => e.ruleId === 'R23' && e.type === 'score'));
  let q;
  while ((q = nextQuestion(kb, answers, infer(kb, answers)))) {
    assert.notEqual(q.id, 'Q07');
    answers.push({ questionId: q.id, value: null });
  }
  assert.equal(answers.length, kb.questions.length - 1);
});
test('Цель без сахара выводит два факта с основанием и шагом', () => {
  const db = infer(kb, [{ questionId: 'Q01', value: null }, { questionId: 'Q02', value: 'diet' }]);
  assert.equal(db.facts.sugarAttitude.value, 'avoid');
  assert.equal(db.facts.caloriesConcern.value, 'high');
  assert.equal(db.log.find(e => e.ruleId === 'R71').step, 2);
  assert.equal(db.log.find(e => e.ruleId === 'R71').assignments.length, 2);
});
test('Нейтральные ответы не создают фактов и не меняют рейтинг', () => {
  const answers = kb.questions.map(q => ({ questionId: q.id, value: null }));
  const db = infer(kb, answers);
  assert.deepEqual(db.facts, {});
  assert.deepEqual(db.log, []);
  assert.equal(nextQuestion(kb, answers, db), null);
  assert.ok(rankDrinks(kb, db).every(d => d.score === 50));
});
test('Вывод достигает неподвижной точки при обратном порядке и цикле', () => {
  const model = { ...kb, rules: [
    { id: 'T1', type: 'derive', if: { param: 'sugarAttitude', eq: 'avoid' }, then: [{ param: 'occasion', value: 'party' }], explain: 'Цикл' },
    { id: 'T2', type: 'derive', if: { param: 'healthGoals', eq: 'diet' }, then: [{ param: 'sugarAttitude', value: 'avoid' }], explain: 'Второе звено' },
    { id: 'T3', type: 'derive', if: { param: 'occasion', eq: 'party' }, then: [{ param: 'healthGoals', value: 'diet' }], explain: 'Первое звено' }
  ] };
  const db = forwardChain(model, { ...initial(), facts: { occasion: { value: 'party', source: 'user', questionId: 'Q01' } } });
  assert.equal(db.facts.sugarAttitude.value, 'avoid');
  assert.deepEqual(db.log.map(e => e.ruleId), ['T3', 'T2']);
  assert.deepEqual(forwardChain(model, db), db);
});
test('Явный ответ не перезаписывается, при конфликте выводов выигрывает первое правило', () => {
  const explicit = { value: 'allow', source: 'user', questionId: 'Q04' };
  const input = { ...initial(), facts: { healthGoals: { value: 'diet', source: 'user' }, sugarAttitude: explicit } };
  assert.deepEqual(forwardChain(kb, input).facts.sugarAttitude, explicit);
  const model = { ...kb, rules: ['allow', 'avoid'].map((value, i) => ({ id: `T${i}`, type: 'derive', if: { param: 'occasion', eq: 'party' }, then: [{ param: 'sugarAttitude', value }], explain: 'Проверка конфликта' })) };
  assert.equal(forwardChain(model, { ...initial(), facts: { occasion: { value: 'party', source: 'user' } } }).facts.sugarAttitude.value, 'allow');
});
test('Вывод не мутирует входные данные и не дублирует журнал', () => {
  const input = { ...initial(), facts: { occasion: { value: 'party', source: 'user' } } };
  const before = structuredClone(input);
  const output = forwardChain(kb, input);
  assert.deepEqual(input, before);
  assert.deepEqual(forwardChain(kb, output), output);
  assert.equal(new Set(output.log.map(e => e.ruleId)).size, output.log.length);
});
test('Возврат и перезапуск удаляют связанные выводы', () => {
  const answers = [{ questionId: 'Q01', value: 'party' }, { questionId: 'Q02', value: 'diet' }];
  const before = structuredClone(answers);
  assert.ok(infer(kb, answers).facts.sugarAttitude);
  const undone = infer(kb, answers.slice(0, -1));
  assert.equal(undone.facts.sugarAttitude, undefined);
  assert.equal(undone.facts.carbonationLevel.value, 'high');
  assert.equal(nextQuestion(kb, answers.slice(0, -1), undone).id, 'Q02');
  assert.deepEqual(infer(kb, []), initial());
  assert.deepEqual(answers, before);
});
test('Недопустимые ответы и нарушение порядка отклоняются', () => {
  assert.throws(() => infer(kb, [{ questionId: 'Q02', value: 'diet' }]), /Ответ/);
  assert.throws(() => infer(kb, [{ questionId: 'Q01', value: 'invalid' }]), /Ответ/);
});
test('Каждый вариант достижим и даёт полный рейтинг с вкладами после ответа', () => {
  for (let i = 0; i < kb.questions.length; i++) {
    const q = kb.questions[i];
    const prefix = kb.questions.slice(0, i).map(item => ({ questionId: item.id, value: null }));
    for (const option of q.options) {
      const db = infer(kb, [...prefix, { questionId: q.id, value: option.value }]);
      const result = rankDrinks(kb, db);
      assert.equal(result.length, 20);
      assert.ok(result.slice(0, 5).every(r => Number.isFinite(r.score)));
      if (option.value !== null) assert.ok(db.log.length > 0);
      for (const row of result) assert.equal(row.rawScore, row.contributions.reduce((sum, c) => sum + c.points, 0));
    }
  }
});
test('Полный содержательный сценарий завершается и сохраняет цепочку', () => {
  const answers = [];
  let db = infer(kb), q;
  while ((q = nextQuestion(kb, answers, db))) {
    answers.push({ questionId: q.id, value: q.options[0].value });
    db = infer(kb, answers);
    assert.ok(answers.length <= kb.questions.length);
  }
  assert.ok(answers.length < kb.questions.length);
  assert.equal(Object.keys(db.facts).length, Object.keys(kb.parameters).length);
  assert.equal(rankDrinks(kb, db).length, 20);
  assert.ok(db.log.every(e => e.step > 0 && e.step <= answers.length));
});

test('Полный перебор источников вывода: в каждой полной консультации задано не менее 20 вопросов', t => {
  assert.ok(kb.questions.length >= 20);
  const sourceParams = new Set(kb.rules.filter(r => r.type === 'derive').map(r => r.if.param));
  const sources = kb.questions.filter(q => sourceParams.has(q.param));
  assert.equal(sources.length, sourceParams.size);
  // Перебираем и нейтральные ответы. Остальные вопросы получают только нейтральный ответ.
  function* combinations(index = 0, selected = {}) {
    if (index === sources.length) { yield selected; return; }
    const q = sources[index];
    for (const option of q.options) yield* combinations(index + 1, { ...selected, [q.param]: option.value });
  }
  let sessions = 0, minimumAsked = Infinity, maximumAsked = 0;
  for (const selected of combinations()) {
    const answers = [];
    let db = infer(kb), q;
    while ((q = nextQuestion(kb, answers, db))) {
      answers.push({ questionId: q.id, value: sourceParams.has(q.param) ? selected[q.param] : null });
      db = infer(kb, answers);
      assert.ok(answers.length <= kb.questions.length, 'Консультация должна завершаться');
    }
    assert.ok(answers.length >= 20, `Задано ${answers.length} вопросов: ${JSON.stringify(selected)}`);
    assert.equal(new Set(answers.map(a => a.questionId)).size, answers.length);
    minimumAsked = Math.min(minimumAsked, answers.length);
    maximumAsked = Math.max(maximumAsked, answers.length);
    sessions++;
  }
  assert.equal(sessions, sources.reduce((product, q) => product * q.options.length, 1));
  assert.equal(minimumAsked, 21);
  assert.equal(maximumAsked, kb.questions.length);
  t.diagnostic(`Проверено сочетаний: ${sessions}; задано вопросов: от ${minimumAsked} до ${maximumAsked}.`);
});
