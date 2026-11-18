import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// Проверяем каждый файл: UTF-8 без BOM и без следов потери русского текста.
const root = fileURLToPath(new URL('../', import.meta.url));
function walk(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(relative) : [relative];
  });
}
export function checkEncoding() {
  const files = [...['data', 'js', 'tests'].flatMap(walk), ...walk('img').filter(file => file.endsWith('.svg')), 'index.html', 'style.css', 'README.md'];
  for (const file of files) {
    const bytes = readFileSync(path.join(root, file));
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${file}: BOM`);
    assert.equal(content.includes(String.fromCharCode(63, 63)), false, `${file}: потерянный текст`);
    assert.equal(content.includes(String.fromCharCode(0xfffd)), false, `${file}: символ замены`);
    assert.match(content, /[а-яё]/iu, `${file}: отсутствует кириллица`);
  }
  return files.length;
}
test('Все исходные файлы сохраняют кириллицу в UTF-8 без BOM', () => assert.ok(checkEncoding() > 0));
