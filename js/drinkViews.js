// Общие представления фотографий, атрибуции и рейтинга. Механизм вывода не зависит от них.
const e = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const n = value => value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = value => `${value > 0 ? '+' : ''}${n(value)}`;
const link = (url, text, title = '') => `<a href="${e(url)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${e(title)}"` : ''}>${text}</a>`;
export function photoImage(drink, className = '') {
  const p = drink.photo;
  return `<img class="${className}" src="./${e(p.src)}" alt="${e(p.alt)}" width="${p.width}" height="${p.height}" loading="lazy" decoding="async">`;
}
export function fallbackNote(drink) {
  return drink.photo.credit ? '' : '<span class="fallback-note">Фото недоступно — иллюстрация</span>';
}
export function drinkThumbnail(drink) {
  const image = photoImage(drink, 'drink-thumb');
  const credit = drink.photo.credit;
  return `<span class="thumbnail-stage" data-flavor="${e(drink.facts.flavor)}">${credit ? link(credit.source, image, `Фото: Open Food Facts, ${credit.license}. ${credit.productName}`) : image}</span>`;
}
export function photoCaption(drink) {
  const credit = drink.photo.credit;
  if (!credit) return '<figcaption class="photo-caption">Фото недоступно — иллюстрация</figcaption>';
  return `<figcaption class="photo-caption">Фото: ${link(credit.source, 'Open Food Facts')}, ${link(credit.licenseUrl, e(credit.license))}<br><span>${e(credit.author)} · уменьшенная копия</span><br><span>На фото: ${e(credit.productName)}.</span> <a href="#kb-photos" data-open-store="knowledge" data-open-section="kb-photos">Источники и соответствие модели</a></figcaption>`;
}
export function photoSourcesTable(kb) {
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Источники фотографий"><table class="photo-sources-table"><caption>Источники фотографий и авторских иллюстраций</caption><thead><tr><th scope="col">Напиток</th><th scope="col">Продукт на фото</th><th scope="col">Источник</th><th scope="col">Лицензия и автор</th></tr></thead><tbody>${kb.drinks.map(drink => {
    const credit = drink.photo.credit;
    return `<tr><th scope="row">${e(drink.name)}</th><td>${credit ? e(credit.productName) : 'Фото недоступно — иллюстрация'}</td><td>${credit ? link(credit.source, `Open Food Facts · ${e(credit.code)}`) : e(drink.photo.src)}</td><td>${credit ? `${link(credit.licenseUrl, e(credit.license))}<br>${e(credit.author)}<br><span class="small muted">${e(credit.changes)}</span>` : 'Оригинальная SVG-иллюстрация проекта'}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
export function topReasons(row) {
  return row.contributions.filter(c => c.points > 0).sort((a, b) => b.points - a.points || a.ruleId.localeCompare(b.ruleId)).slice(0, 3);
}
function movement(id, index, previous) {
  if (!previous.has(id)) return '';
  const difference = previous.get(id) - index;
  const label = difference > 0 ? `Поднялся на ${difference}` : difference < 0 ? `Опустился на ${-difference}` : 'Позиция не изменилась';
  return `<span class="movement ${difference > 0 ? 'up' : difference < 0 ? 'down' : ''}" aria-label="${label}" title="${label}">${difference > 0 ? '↑' : difference < 0 ? '↓' : '→'}${difference ? Math.abs(difference) : ''}</span>`;
}
function explanation(row) {
  return `<details class="explanation"><summary>Почему такое место</summary><p>Исходная сумма: <strong>${n(row.rawScore)}</strong>. Нормированная оценка: <strong>${n(row.score)} из 100</strong>. При равной сумме учитываются популярность и название.</p>${row.contributions.length ? `<ul>${row.contributions.map(c => `<li><span class="rule-ref">${e(c.ruleId)}</span>: <strong>${signed(c.points)}</strong> балла. ${e(c.explain)}<ul>${c.effects.map(action => `<li><code>${e(action.attr)} · ${e(action.op)}</code> · вес ${signed(action.weight)}${Object.hasOwn(action, 'value') ? ` · порог ${e(action.value)}` : ''} → ${signed(action.points)}</li>`).join('')}</ul></li>`).join('')}</ul>` : '<p>Активных правил пока нет. Все напитки имеют равную оценку 50.</p>'}</details>`;
}
function leader(kb, row, { full, previousPositions, changed, allEqual }) {
  const { drink } = row;
  const reasons = topReasons(row);
  const reasonText = reasons.length ? `<ul class="leader-reasons">${reasons.map(c => {
    const rule = kb.rules.find(r => r.id === c.ruleId);
    const param = kb.parameters[rule.if.param];
    const answer = param.options.find(o => o.value === rule.if.eq).label;
    return `<li><a class="rule-ref" href="#rule-${e(c.ruleId)}" data-open-store="knowledge" data-open-section="kb-score" data-rule="${e(c.ruleId)}">${e(c.ruleId)}</a><span>${e(param.label)}: ${e(answer)}</span><strong>${signed(c.points)}</strong></li>`;
  }).join('')}</ul>` : `<p class="leader-empty">${allEqual ? 'Рейтинг начнёт меняться после ответов. Первое место определено популярностью и названием.' : 'Положительных вкладов пока нет. Полный расчёт доступен в рабочей базе.'}</p>`;
  return `<li class="rank-item leader-card${changed ? ' leader-changed' : ''}" data-drink="${e(drink.id)}" data-flavor="${e(drink.facts.flavor)}"><div class="leader-ribbon"><strong>1 · Лидер подбора</strong><span>${allEqual ? 'Пока все варианты равны' : 'Лучшее соответствие сейчас'}</span></div><div class="leader-body"><figure class="leader-photo"><div class="photo-stage">${photoImage(drink, 'hero-photo')}</div>${photoCaption(drink)}</figure><div class="leader-info"><span class="leader-brand">${e(drink.brand)}</span><h3 class="drink-name">${e(drink.name)}${movement(drink.id, 0, previousPositions)}</h3><div class="hero-score"><strong class="score">${n(row.score)}</strong><span>/ 100</span></div><span class="rank-bar" aria-hidden="true"><span style="width:${row.score}%"></span></span><p class="leader-description">${e(drink.description)}</p><div class="drink-badges"><span>${drink.facts.hasSugar ? 'С сахаром' : 'Без сахара'}</span><span>Кофеин: ${drink.facts.caffeine}/5</span><span>${e(kb.factDefinitions.origin.values.find(v => v.value === drink.facts.origin).label)}</span></div></div></div><div class="leader-reason-block"><h4>${reasons.length ? 'Что вывело напиток в лидеры' : 'С чего начинается выбор'}</h4>${reasonText}</div>${full ? explanation(row) : ''}</li>`;
}
export function rankingView(kb, ranking, { full = false, previousPositions = new Map(), changed = false } = {}) {
  const allEqual = ranking.every(row => row.rawScore === ranking[0].rawScore);
  return (full ? ranking : ranking.slice(0, 5)).map((row, index) => index === 0
    ? leader(kb, row, { full, previousPositions, changed, allEqual })
    : `<li class="rank-item compact-drink" data-drink="${e(row.drink.id)}" data-flavor="${e(row.drink.facts.flavor)}"><div class="compact-main"><span class="place">${index + 1}</span>${drinkThumbnail(row.drink)}<div class="compact-name"><span class="drink-name">${e(row.drink.name)}${movement(row.drink.id, index, previousPositions)}</span><span class="muted small">${e(row.drink.brand)}</span>${fallbackNote(row.drink)}</div><span class="score">${n(row.score)}</span></div><span class="rank-bar" aria-hidden="true"><span style="width:${row.score}%"></span></span>${full ? explanation(row) : ''}</li>`).join('');
}
