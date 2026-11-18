export function effectPoints(effect, drink) {
  const value = effect.attr === 'brand' ? drink.brand : (Object.hasOwn(drink.attributes, effect.attr) ? drink.attributes[effect.attr] : drink.facts[effect.attr]);
  switch (effect.op) {
    case 'high': return effect.weight * value;
    case 'low': return effect.weight * (6 - value);
    case 'eq': return value === effect.value ? effect.weight : 0;
    case 'gte': return value >= effect.value ? effect.weight : 0;
    case 'lte': return value <= effect.value ? effect.weight : 0;
    default: throw new Error(`Неизвестная операция: ${effect.op}`);
  }
}

/** Normalize against theoretical bounds of active effects, including negative weights. */
export function rankDrinks(kb, database) {
  const active = kb.rules.filter(r => r.type === 'score' && database.facts[r.if.param]?.value === r.if.eq);
  let min = 0, max = 0;
  for (const rule of active) for (const e of rule.then) {
    const proportional = ['high', 'low'].includes(e.op);
    const bounds = proportional ? [e.weight, 5 * e.weight] : [0, e.weight];
    min += Math.min(...bounds); max += Math.max(...bounds);
  }
  return kb.drinks.map(drink => {
    const contributions = active.map(rule => ({ ruleId: rule.id, explain: rule.explain, points: rule.then.reduce((sum, e) => sum + effectPoints(e, drink), 0), effects: rule.then.map(e => ({ ...e, points: effectPoints(e, drink) })) }));
    const rawScore = contributions.reduce((sum, c) => sum + c.points, 0);
    const score = max === min ? 50 : Math.round(Math.max(0, Math.min(100, (rawScore - min) / (max - min) * 100)) * 10) / 10;
    return { drink, rawScore, score, contributions };
  }).sort((a, b) => b.rawScore - a.rawScore || b.drink.attributes.popularity - a.drink.attributes.popularity || a.drink.name.localeCompare(b.drink.name, 'ru') || a.drink.id.localeCompare(b.drink.id));
}
