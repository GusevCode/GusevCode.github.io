// Загрузка учебной базы без браузера и сети.
import { readFileSync } from 'node:fs';
import { createKnowledgeBase } from '../js/knowledgeBase.js';
export const readData = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
export const makeKnowledgeBase = () => createKnowledgeBase(readData('drinks'), readData('questions'), readData('rules'));
