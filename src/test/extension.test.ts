import * as assert from 'assert';

import * as vscode from 'vscode';
import {
    buildMonthKey,
    calculateUsagePercentage,
    createSnapshot,
    filterAndSortHistory,
    getPreviousMonthRefs,
    sumGrossQuantity,
    upsertAndFilterHistory
} from '../history';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('buildMonthKey pads month', () => {
		assert.strictEqual(buildMonthKey(2026, 2), '2026-02');
		assert.strictEqual(buildMonthKey(2026, 12), '2026-12');
	});

	test('getPreviousMonthRefs handles year boundaries', () => {
		const refs = getPreviousMonthRefs(4, new Date(2026, 0, 15));
		assert.deepStrictEqual(refs.map(ref => ref.monthKey), ['2025-12', '2025-11', '2025-10', '2025-09']);
	});

	test('sumGrossQuantity and usage percentage are safe', () => {
		const total = sumGrossQuantity([{ grossQuantity: 12.5 }, { grossQuantity: 0 }, {}]);
		assert.strictEqual(total, 12.5);
		assert.strictEqual(calculateUsagePercentage(total, 100), 12.5);
		assert.strictEqual(calculateUsagePercentage(10, 0), 0);
	});

	test('upsertAndFilterHistory keeps only allowed months', () => {
		const allowed = new Set(['2026-06', '2026-05']);
		const existing = [
			createSnapshot({ year: 2026, month: 5, monthKey: '2026-05' }, 50, 100, '2026-05-30T00:00:00.000Z'),
			createSnapshot({ year: 2026, month: 4, monthKey: '2026-04' }, 40, 100, '2026-04-30T00:00:00.000Z')
		];

		const next = upsertAndFilterHistory(
			existing,
			createSnapshot({ year: 2026, month: 6, monthKey: '2026-06' }, 60, 100, '2026-06-30T00:00:00.000Z'),
			allowed
		);

		assert.deepStrictEqual(next.map(item => item.monthKey), ['2026-06', '2026-05']);
	});

	test('filterAndSortHistory deduplicates and sorts newest first', () => {
		const allowed = new Set(['2026-02', '2026-01']);
		const history = [
			createSnapshot({ year: 2026, month: 1, monthKey: '2026-01' }, 10, 100, '2026-01-31T00:00:00.000Z'),
			createSnapshot({ year: 2026, month: 2, monthKey: '2026-02' }, 20, 100, '2026-02-28T00:00:00.000Z'),
			createSnapshot({ year: 2026, month: 1, monthKey: '2026-01' }, 11, 100, '2026-01-31T12:00:00.000Z')
		];

		const filtered = filterAndSortHistory(history, allowed);
		assert.deepStrictEqual(filtered.map(item => item.monthKey), ['2026-02', '2026-01']);
	});
});
