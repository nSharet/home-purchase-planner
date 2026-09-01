import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SOURCE_URL = 'https://www.moti.org.il/interest/main/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'mortgage/data/rates/current.json');

function decode(value) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&ndash;|&#8211;/g, '-')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function cells(rowHtml) {
  return [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => decode(match[1]));
}

function parseRange(value) {
  const values = [...String(value).matchAll(/[+-]?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (!values.length) return null;
  return { min: values[0], max: values[1] ?? values[0] };
}

function parseDate(value) {
  const match = String(value).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}T00:00:00+03:00`;
}

function parseYears(label) {
  const values = [...String(label).matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (!values.length) return { minYears: 1, maxYears: 30 };
  if (values.length === 1) return { minYears: values[0], maxYears: values[0] };
  return { minYears: values[0], maxYears: values[1] };
}

function bandRanges(row) {
  return {
    upTo45: parseRange(row[1]),
    from45To60: parseRange(row[2]),
    from60To75: parseRange(row[3])
  };
}

function compactBands(bands) {
  return Object.fromEntries(Object.entries(bands).filter(([, range]) => range));
}

export function parseMotiHtml(html, previous) {
  const tables = [...html.matchAll(/<table[^>]*class="[^"]*interest[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)]
    .map((match) => match[1]);
  if (tables.length < 3) throw new Error(`Expected interest tables, found ${tables.length}`);

  const next = structuredClone(previous);
  const products = new Map(next.products.map((product) => [product.id, product]));
  const updateTerms = new Map();
  let newestSourceDate = null;

  for (const table of tables) {
    const title = decode(table.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i)?.[1] ?? '');
    const date = parseDate(title);
    if (date && (!newestSourceDate || date > newestSourceDate)) newestSourceDate = date;
    const tbody = table.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
    if (!tbody) continue;
    const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => cells(match[1]));

    if (title.includes('לא צמודות למדד')) {
      for (const row of rows) {
        let id = null;
        if (row[0] === 'פריים') id = 'prime';
        else if (row[0].includes('משתנה כל 5')) id = 'variable-5-unlinked';
        else if (row[0].includes('קל"צ')) id = 'fixed-unlinked';
        if (!id || row.length < 4) continue;
        const years = id === 'fixed-unlinked' ? parseYears(row[0]) : { minYears: 1, maxYears: 30 };
        if (!updateTerms.has(id)) updateTerms.set(id, []);
        updateTerms.get(id).push({ ...years, bands: compactBands(bandRanges(row)) });
      }
    }

    if (title.includes('צמודות למדד') && !title.includes('לא צמודות')) {
      for (const row of rows) {
        let id = null;
        if (row[0].includes('משתנה כל 5')) id = 'variable-5-linked';
        else if (row[0].includes('קצ"מ')) id = 'fixed-linked';
        if (!id || row.length < 4) continue;
        const years = id === 'fixed-linked' ? parseYears(row[0]) : { minYears: 1, maxYears: 30 };
        if (!updateTerms.has(id)) updateTerms.set(id, []);
        updateTerms.get(id).push({ ...years, bands: compactBands(bandRanges(row)) });
      }
    }

    if (title.includes('ריביות נוספות')) {
      const bridge = rows.find((row) => row[0]?.includes('הלוואת גישור'));
      if (bridge) {
        updateTerms.set('bridge-linked', [{ minYears: 0, maxYears: 3, bands: { all: parseRange(bridge[1]) } }]);
        updateTerms.set('bridge-unlinked', [{ minYears: 0, maxYears: 3, bands: { all: parseRange(bridge[2]) } }]);
      }
    }
  }

  for (const [id, terms] of updateTerms) {
    const product = products.get(id);
    if (!product || !terms.length) continue;
    product.terms = terms.sort((a, b) => a.minYears - b.minYears);
  }

  const primeMatch = decode(html).match(/ריבית הפריים\s*\|?\s*(\d+(?:\.\d+)?)%/);
  const bankMatch = decode(html).match(/ריבית בנק ישראל\s*\|?\s*(\d+(?:\.\d+)?)%/);
  if (primeMatch) next.baseRates.prime = Number(primeMatch[1]);
  if (bankMatch) next.baseRates.bankOfIsrael = Number(bankMatch[1]);

  for (const product of next.products) {
    for (const term of product.terms) {
      for (const range of Object.values(term.bands)) {
        if (!range || range.min < 0 || range.max < range.min || range.max > 25) {
          throw new Error(`Invalid range in ${product.id}`);
        }
      }
    }
  }

  const required = ['prime', 'fixed-unlinked', 'fixed-linked', 'variable-5-unlinked', 'bridge-unlinked'];
  for (const id of required) {
    if (!updateTerms.has(id)) throw new Error(`Source table did not contain ${id}`);
  }

  next.meta.sourceUrl = SOURCE_URL;
  next.meta.sourceUpdatedAt = newestSourceDate ?? next.meta.sourceUpdatedAt;
  next.meta.fetchedAt = new Date().toISOString();
  next.meta.parserVersion = 1;
  return next;
}

export async function refreshRates() {
  const previous = JSON.parse(await readFile(OUTPUT, 'utf8'));
  const response = await fetch(SOURCE_URL, { headers: { 'user-agent': 'home-purchase-planner-rate-import/1.0' } });
  if (!response.ok) throw new Error(`Moti returned HTTP ${response.status}`);
  const html = await response.text();
  const next = parseMotiHtml(html, previous);
  await writeFile(OUTPUT, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await refreshRates();
  process.stdout.write(`Rates refreshed: ${result.meta.sourceUpdatedAt}\n`);
}
