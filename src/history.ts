export type MonthRef = {
    year: number;
    month: number;
    monthKey: string;
};

export type MonthlyUsageSnapshot = {
    monthKey: string;
    year: number;
    month: number;
    totalUsed: number;
    limit: number;
    usagePct: number;
    lastSyncedAt: string;
};

export function buildMonthKey(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
}

export function getPreviousMonthRefs(count: number, now: Date = new Date()): MonthRef[] {
    const refs: MonthRef[] = [];

    for (let offset = 1; offset <= count; offset++) {
        const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        refs.push({
            year,
            month,
            monthKey: buildMonthKey(year, month)
        });
    }

    return refs;
}

export function calculateUsagePercentage(totalUsed: number, limit: number): number {
    if (limit <= 0) {
        return 0;
    }

    return (totalUsed / limit) * 100;
}

export function sumGrossQuantity(usageItems: Array<{ grossQuantity?: number }> | undefined): number {
    if (!usageItems || usageItems.length === 0) {
        return 0;
    }

    return usageItems.reduce((sum, item) => sum + (item.grossQuantity || 0), 0);
}

export function createSnapshot(month: MonthRef, totalUsed: number, limit: number, lastSyncedAt: string = new Date().toISOString()): MonthlyUsageSnapshot {
    return {
        monthKey: month.monthKey,
        year: month.year,
        month: month.month,
        totalUsed,
        limit,
        usagePct: calculateUsagePercentage(totalUsed, limit),
        lastSyncedAt
    };
}

export function upsertAndFilterHistory(
    existing: MonthlyUsageSnapshot[],
    snapshot: MonthlyUsageSnapshot,
    allowedMonthKeys: Set<string>
): MonthlyUsageSnapshot[] {
    const merged = existing.filter(item => item.monthKey !== snapshot.monthKey && allowedMonthKeys.has(item.monthKey));
    merged.push(snapshot);

    return merged.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export function filterAndSortHistory(existing: MonthlyUsageSnapshot[], allowedMonthKeys: Set<string>): MonthlyUsageSnapshot[] {
    const deduped = new Map<string, MonthlyUsageSnapshot>();

    for (const item of existing) {
        if (allowedMonthKeys.has(item.monthKey) && !deduped.has(item.monthKey)) {
            deduped.set(item.monthKey, item);
        }
    }

    return Array.from(deduped.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export function formatMonthLabel(year: number, month: number): string {
    return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}
