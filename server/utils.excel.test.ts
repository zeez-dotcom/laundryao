import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  generateCatalogTemplate,
  parsePrice,
  SERVICE_HEADERS,
} from './utils/excel';
import type { ParsedRow } from './storage';

test('generateCatalogTemplate returns template with headers and example row', async () => {
  const buf = await generateCatalogTemplate();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  const headers = ws.getRow(1).values.slice(1);
  const exampleRow = ws.getRow(2).values.slice(1);
  assert.deepEqual(headers, [
    'Item (English)',
    'Item (Arabic)',
    'Normal Iron Price',
    'Normal Wash Price',
    'Normal Wash & Iron Price',
    'Urgent Iron Price',
    'Urgent Wash Price',
    'Urgent Wash & Iron Price',
    'Picture Link',
  ]);
  assert.deepEqual(exampleRow, ['T-Shirt', 'تي شيرت', 5, 10, 15, 8, 12, 18, 'https://example.com/image.jpg']);
});

test('parsePrice handles comma decimals', () => {
  assert.equal(parsePrice('3,50'), 3.5);
});

test('parsePrice strips currency symbols', () => {
  assert.equal(parsePrice('$3.50'), 3.5);
  assert.equal(parsePrice('€3,50'), 3.5);
});

test('bulk upload parser accepts legacy header names without "Price"', () => {
  const exampleRow = ['T-Shirt', 'تي شيرت', 5, 10, 15, 8, 12, 18, 'https://example.com/image.jpg'];
  const headersWithPrice = [
    'Item (English)',
    'Item (Arabic)',
    SERVICE_HEADERS.normalIron[0],
    SERVICE_HEADERS.normalWash[0],
    SERVICE_HEADERS.normalWashIron[0],
    SERVICE_HEADERS.urgentIron[0],
    SERVICE_HEADERS.urgentWash[0],
    SERVICE_HEADERS.urgentWashIron[0],
    'Picture Link',
  ];
  const headersWithoutPrice = [
    'Item (English)',
    'Item (Arabic)',
    SERVICE_HEADERS.normalIron[1],
    SERVICE_HEADERS.normalWash[1],
    SERVICE_HEADERS.normalWashIron[1],
    SERVICE_HEADERS.urgentIron[1],
    SERVICE_HEADERS.urgentWash[1],
    SERVICE_HEADERS.urgentWashIron[1],
    'Picture Link',
  ];

  const parseSheet = (headers: string[]): { rows: ParsedRow[]; errors: string[] } => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Sheet');
    ws.addRow(headers);
    ws.addRow(exampleRow);
    const headerRow = ws.getRow(1).values.slice(1) as string[];
    const data: any[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: any = {};
      headerRow.forEach((h, i) => {
        obj[h] = row.getCell(i + 1).value;
      });
      data.push(obj);
    });
    const errors: string[] = [];
    const rows: ParsedRow[] = data
      .map((r: any, index: number) => {
        const getFieldValue = (fields: string[]) => {
          for (const f of fields) {
            if (r[f] !== undefined) return r[f];
          }
          return undefined;
        };

        const parseField = (fields: string[]) => {
          const raw = getFieldValue(fields);
          const parsed = parsePrice(raw);
          if (raw !== undefined && raw !== null && raw !== '' && parsed === undefined) {
            errors.push(`Row ${index + 2}: Invalid ${fields[0]}`);
          }
          return parsed;
        };

        return {
          itemEn: String(r['Item (English)'] ?? '').trim(),
          itemAr: r['Item (Arabic)'] ? String(r['Item (Arabic)']).trim() : undefined,
          normalIron: parseField(SERVICE_HEADERS.normalIron),
          normalWash: parseField(SERVICE_HEADERS.normalWash),
          normalWashIron: parseField(SERVICE_HEADERS.normalWashIron),
          urgentIron: parseField(SERVICE_HEADERS.urgentIron),
          urgentWash: parseField(SERVICE_HEADERS.urgentWash),
          urgentWashIron: parseField(SERVICE_HEADERS.urgentWashIron),
          imageUrl: r['Picture Link'] ? String(r['Picture Link']).trim() : undefined,
        };
      })
      .filter((r: ParsedRow) => r.itemEn);
    return { rows, errors };
  };

  const expected: ParsedRow = {
    itemEn: 'T-Shirt',
    itemAr: 'تي شيرت',
    normalIron: 5,
    normalWash: 10,
    normalWashIron: 15,
    urgentIron: 8,
    urgentWash: 12,
    urgentWashIron: 18,
    imageUrl: 'https://example.com/image.jpg',
  };

  const withPrice = parseSheet(headersWithPrice);
  const withoutPrice = parseSheet(headersWithoutPrice);

  assert.deepEqual(withPrice.rows, [expected]);
  assert.deepEqual(withPrice.errors, []);
  assert.deepEqual(withoutPrice.rows, [expected]);
  assert.deepEqual(withoutPrice.errors, []);
});
