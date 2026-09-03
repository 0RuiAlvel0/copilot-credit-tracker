import * as vscode from 'vscode';
import {
    MonthlyUsageSnapshot,
    MonthRef,
    calculateUsagePercentage,
    createSnapshot,
    filterAndSortHistory,
    formatMonthLabel,
    getPreviousMonthRefs,
    sumGrossQuantity,
    upsertAndFilterHistory
} from './history';

let statusBarItem: vscode.StatusBarItem;
let extensionContext: vscode.ExtensionContext;
let detailsPanel: vscode.WebviewPanel | undefined;

const HISTORY_KEY = 'copilotCreditTracker.previous12MonthHistory.v1';
const PREVIOUS_MONTH_COUNT = 12;
const GITHUB_API_TIMEOUT_MS = 15000;

type BillingUsageItem = {
    model?: string;
    sku?: string;
    grossQuantity?: number;
};

type BillingUsageResponse = {
    usageItems?: BillingUsageItem[];
};

type RefreshResult = 'success' | 'partial' | 'not_logged_in' | 'api_error';

// Cache these values globally so the Webview panel can read them instantly.
let cachedUsageData: BillingUsageResponse | null = null;
let cachedMonthProgress: number = 0;
let cachedTotalUsed: number = 0;
let cachedLimit: number = 7000;
let cachedPreviousHistory: MonthlyUsageSnapshot[] = [];

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);

    const showPanelCommandId = 'copilot-credit-tracker.showPanel';
    cachedPreviousHistory = readHistoryFromState();

    context.subscriptions.push(vscode.commands.registerCommand(showPanelCommandId, async () => {
        await showDetailsPanel();
    }));

    statusBarItem.command = showPanelCommandId;
    void updateStatusBar();

    const intervalHandle = setInterval(() => {
        void updateStatusBar();
    }, 1000 * 60 * 30);

    context.subscriptions.push({
        dispose: () => clearInterval(intervalHandle)
    });
}

async function updateStatusBar(): Promise<void> {
    try {
        cachedMonthProgress = getMonthProgress();
        const status = await fetchCopilotData();

        if (status === 'not_logged_in') {
            statusBarItem.text = '$(github) GHCP: Auth Required';
            statusBarItem.color = '#ffcc00';
            statusBarItem.show();
            return;
        }

        if (status === 'api_error') {
            statusBarItem.text = '$(error) GHCP: API Error';
            statusBarItem.tooltip = 'Click to view details or check Debug Console.';
            statusBarItem.color = '#ff4d4d';
            statusBarItem.show();
            return;
        }

        const usagePercentage = calculateUsagePercentage(cachedTotalUsed, cachedLimit);
        const isOverspending = usagePercentage > cachedMonthProgress;
        const icon = isOverspending ? '$(warning)' : '$(check)';

        statusBarItem.text = `${icon} Month: ${cachedMonthProgress.toFixed(0)}% | GHCP: ${usagePercentage.toFixed(0)}%`;
        statusBarItem.tooltip = 'Click to view full Copilot usage breakdown';
        statusBarItem.color = isOverspending ? '#ff4d4d' : undefined;
        statusBarItem.show();

        if (detailsPanel) {
            await renderDetailsPanel(detailsPanel);
        }
    } catch (error) {
        console.error('Failed to update GHCP status', error);
    }
}

function getMonthProgress(): number {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return (now.getDate() / endOfMonth.getDate()) * 100;
}

async function fetchCopilotData(): Promise<'success' | 'not_logged_in' | 'api_error'> {
    const session = await vscode.authentication.getSession('github', ['user'], { createIfNone: false });

    if (!session) {
        vscode.window.showInformationMessage('Please sign in to GitHub to track Copilot credits.', 'Sign In').then(selection => {
            if (selection === 'Sign In') {
                void vscode.authentication.getSession('github', ['user'], { createIfNone: true });
            }
        });
        return 'not_logged_in';
    }

    const userLogin = await fetchAuthenticatedUserLogin(session.accessToken);
    if (!userLogin) {
        return 'api_error';
    }

    cachedLimit = determinePlanLimit();

    const now = new Date();
    const currentMonth: MonthRef = {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        monthKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    };

    const currentMonthData = await fetchMonthlyBillingData(
        userLogin,
        session.accessToken,
        currentMonth.year,
        currentMonth.month
    );

    if (!currentMonthData) {
        return 'api_error';
    }

    cachedUsageData = currentMonthData;
    cachedTotalUsed = sumGrossQuantity(currentMonthData.usageItems);

    await syncMissingPreviousMonths(userLogin, session.accessToken, cachedLimit);

    return 'success';
}

async function syncMissingPreviousMonths(login: string, accessToken: string, limit: number): Promise<void> {
    const targetMonths = getPreviousMonthRefs(PREVIOUS_MONTH_COUNT);
    const allowedMonthKeys = new Set(targetMonths.map(monthRef => monthRef.monthKey));
    let history = filterAndSortHistory(readHistoryFromState(), allowedMonthKeys);

    const existingMonths = new Set(history.map(item => item.monthKey));
    let didChange = history.length !== cachedPreviousHistory.length;

    for (const monthRef of targetMonths) {
        if (existingMonths.has(monthRef.monthKey)) {
            continue;
        }

        const usageData = await fetchMonthlyBillingData(login, accessToken, monthRef.year, monthRef.month);
        if (!usageData) {
            continue;
        }

        const snapshot = createSnapshot(monthRef, sumGrossQuantity(usageData.usageItems), limit);
        history = upsertAndFilterHistory(history, snapshot, allowedMonthKeys);
        didChange = true;
    }

    cachedPreviousHistory = history;

    if (didChange) {
        await saveHistoryToState(history);
    }
}

async function refreshPreviousMonthsFromApi(): Promise<RefreshResult> {
    const session = await vscode.authentication.getSession('github', ['user'], { createIfNone: false });

    if (!session) {
        return 'not_logged_in';
    }

    const userLogin = await fetchAuthenticatedUserLogin(session.accessToken);
    if (!userLogin) {
        return 'api_error';
    }

    const historyTargets = getPreviousMonthRefs(PREVIOUS_MONTH_COUNT);
    const allowedMonthKeys = new Set(historyTargets.map(monthRef => monthRef.monthKey));
    let history = filterAndSortHistory(readHistoryFromState(), allowedMonthKeys);
    let hasAnySuccess = false;
    let hadAnyFailure = false;

    for (const monthRef of historyTargets) {
        const usageData = await fetchMonthlyBillingData(userLogin, session.accessToken, monthRef.year, monthRef.month);

        if (!usageData) {
            hadAnyFailure = true;
            continue;
        }

        const snapshot = createSnapshot(monthRef, sumGrossQuantity(usageData.usageItems), cachedLimit);
        history = upsertAndFilterHistory(history, snapshot, allowedMonthKeys);
        hasAnySuccess = true;
    }

    if (!hasAnySuccess) {
        return 'api_error';
    }

    cachedPreviousHistory = history;
    await saveHistoryToState(history);

    return hadAnyFailure ? 'partial' : 'success';
}

async function fetchAuthenticatedUserLogin(accessToken: string): Promise<string | null> {
    try {
        const userResponse = await fetchWithTimeout('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2026-03-10'
            }
        });

        if (!userResponse.ok) {
            return null;
        }

        const userData = await userResponse.json() as { login?: string };
        return userData.login || null;
    } catch {
        return null;
    }
}

async function fetchMonthlyBillingData(login: string, accessToken: string, year: number, month: number): Promise<BillingUsageResponse | null> {
    try {
        const billingResponse = await fetchWithTimeout(`https://api.github.com/users/${login}/settings/billing/ai_credit/usage?year=${year}&month=${month}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2026-03-10'
            }
        });

        if (!billingResponse.ok) {
            return null;
        }

        return await billingResponse.json() as BillingUsageResponse;
    } catch {
        return null;
    }
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS);

    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutHandle);
    }
}

function readHistoryFromState(): MonthlyUsageSnapshot[] {
    if (!extensionContext) {
        return [];
    }

    const targetMonths = getPreviousMonthRefs(PREVIOUS_MONTH_COUNT);
    const allowedMonthKeys = new Set(targetMonths.map(monthRef => monthRef.monthKey));
    const storedHistory = extensionContext.globalState.get<MonthlyUsageSnapshot[]>(HISTORY_KEY, []);
    return filterAndSortHistory(storedHistory, allowedMonthKeys);
}

async function saveHistoryToState(history: MonthlyUsageSnapshot[]): Promise<void> {
    if (!extensionContext) {
        return;
    }

    await extensionContext.globalState.update(HISTORY_KEY, history);
}

function determinePlanLimit(): number {
    const configLimit = vscode.workspace.getConfiguration('copilotCreditTracker').get<number>('monthlyLimit');
    if (configLimit && configLimit > 0) {
        return configLimit;
    }

    return 7000;
}

async function showDetailsPanel(): Promise<void> {
    if (detailsPanel) {
        detailsPanel.reveal(vscode.ViewColumn.One);
        await renderDetailsPanel(detailsPanel);
        return;
    }

    detailsPanel = vscode.window.createWebviewPanel(
        'copilotUsageDetails',
        'Copilot Credit Breakdown',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    detailsPanel.onDidDispose(() => {
        detailsPanel = undefined;
    });

    detailsPanel.webview.onDidReceiveMessage(async (message: { command?: string }) => {
        if (message.command !== 'refreshHistory') {
            return;
        }

        detailsPanel?.webview.postMessage({
            command: 'refreshState',
            state: 'running',
            message: 'Refreshing historical usage...'
        });

        try {
            const refreshResult = await refreshPreviousMonthsFromApi();

            if (refreshResult === 'not_logged_in') {
                vscode.window.showWarningMessage('Please sign in to GitHub before refreshing historical usage.');
                detailsPanel?.webview.postMessage({
                    command: 'refreshState',
                    state: 'done',
                    level: 'warning',
                    message: 'Sign in required. Close and reopen this panel after signing in.'
                });
            } else if (refreshResult === 'api_error') {
                vscode.window.showErrorMessage('Failed to refresh historical usage data from GitHub.');
                detailsPanel?.webview.postMessage({
                    command: 'refreshState',
                    state: 'done',
                    level: 'error',
                    message: 'Refresh failed. Close and reopen this panel to try again.'
                });
            } else if (refreshResult === 'partial') {
                vscode.window.showWarningMessage('History refresh completed with partial data. Close and reopen this panel to see the latest cached data.');
                detailsPanel?.webview.postMessage({
                    command: 'refreshState',
                    state: 'done',
                    level: 'warning',
                    message: 'Refresh finished with partial data. Close and reopen this panel to view updates.'
                });
            } else {
                vscode.window.showInformationMessage('History refresh completed. Close and reopen this panel to see the latest cached data.');
                detailsPanel?.webview.postMessage({
                    command: 'refreshState',
                    state: 'done',
                    level: 'info',
                    message: 'Refresh completed. Close and reopen this panel to view updates.'
                });
            }
        } catch (error) {
            console.error('Unexpected error while refreshing history', error);
            vscode.window.showErrorMessage('Unexpected error while refreshing history data.');
            detailsPanel?.webview.postMessage({
                command: 'refreshState',
                state: 'done',
                level: 'error',
                message: 'Unexpected error during refresh. Close and reopen this panel to retry.'
            });
        }
    });

    await renderDetailsPanel(detailsPanel);
}

async function renderDetailsPanel(panel: vscode.WebviewPanel): Promise<void> {
    cachedPreviousHistory = readHistoryFromState();

    let breakdownHtml = '';
    if (cachedUsageData?.usageItems && cachedUsageData.usageItems.length > 0) {
        breakdownHtml = cachedUsageData.usageItems
        // Add sort of results for release 0.0.5.
        .sort((firstItem, secondItem) =>
            (secondItem.grossQuantity ?? 0) - (firstItem.grossQuantity ?? 0))
        .map((item) => `
            <tr style="border-bottom: 1px solid var(--vscode-panel-border);">
                <td style="padding: 12px 8px;">${escapeHtml(item.model || item.sku || 'Unknown')}</td>
                <td style="padding: 12px 8px;">${(item.grossQuantity || 0).toFixed(2)}</td>
            </tr>
        `).join('');
    } else {
        breakdownHtml = '<tr><td colspan="2" style="padding: 12px 8px; text-align: center;">No model usage data available yet.</td></tr>';
    }

    const usagePercentage = calculateUsagePercentage(cachedTotalUsed, cachedLimit).toFixed(1);
    const isWarning = parseFloat(usagePercentage) > cachedMonthProgress;

    const historyRowsHtml = cachedPreviousHistory.length > 0
        ? cachedPreviousHistory.map((entry) => {
            const syncedDate = new Date(entry.lastSyncedAt);
            const syncedLabel = Number.isNaN(syncedDate.getTime())
                ? 'Unknown'
                : syncedDate.toLocaleDateString('en-US');

            return `
                <tr style="border-bottom: 1px solid var(--vscode-panel-border);">
                    <td style="padding: 12px 8px;">${formatMonthLabel(entry.year, entry.month)}</td>
                    <td style="padding: 12px 8px;">${entry.totalUsed.toFixed(2)}</td>
                    <td style="padding: 12px 8px;">${entry.limit}</td>
                    <td style="padding: 12px 8px;">${entry.usagePct.toFixed(1)}%</td>
                    <td style="padding: 12px 8px;">${syncedLabel}</td>
                </tr>
            `;
        }).join('')
        : '<tr><td colspan="5" style="padding: 12px 8px; text-align: center;">No historical data cached yet.</td></tr>';

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Copilot Usage Details</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 30px;
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                }
                h1, h2 { color: var(--vscode-editor-foreground); }
                .summary-card {
                    margin-bottom: 30px;
                    padding: 20px;
                    background: var(--vscode-editorWidget-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    display: flex;
                    justify-content: space-between;
                }
                .metric { text-align: center; width: 33%; }
                .metric h3 { margin: 0; font-size: 14px; color: var(--vscode-descriptionForeground); font-weight: 600; text-transform: uppercase; }
                .metric p { margin: 12px 0 0 0; font-size: 28px; font-weight: bold; color: var(--vscode-textLink-foreground); }
                .metric p span { font-size: 16px; color: var(--vscode-descriptionForeground); font-weight: normal; }
                .warning { color: var(--vscode-errorForeground) !important; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; text-align: left; }
                th { padding: 12px 8px; border-bottom: 2px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); font-weight: 600; }
                .section-header {
                    margin-top: 30px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .refresh-button {
                    border: 1px solid var(--vscode-button-border, transparent);
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border-radius: 6px;
                    padding: 6px 12px;
                    cursor: pointer;
                }
                .refresh-button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .refresh-status {
                    margin-left: 10px;
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .refresh-status.warning {
                    color: var(--vscode-warningForeground);
                }
                .refresh-status.error {
                    color: var(--vscode-errorForeground);
                }
            </style>
        </head>
        <body>
            <h1>GitHub Copilot Monthly Breakdown</h1>

            <div class="summary-card">
                <div class="metric">
                    <h3>Month Elapsed</h3>
                    <p>${cachedMonthProgress.toFixed(0)}%</p>
                </div>
                <div class="metric">
                    <h3>Total Credits Used</h3>
                    <p>${cachedTotalUsed.toFixed(2)} <span>/ ${cachedLimit}</span></p>
                </div>
                <div class="metric">
                    <h3>Usage Percentage</h3>
                    <p class="${isWarning ? 'warning' : ''}">${usagePercentage}%</p>
                </div>
            </div>

            <h2>Usage by AI Model</h2>
            <table>
                <thead>
                    <tr>
                        <th>Model Name</th>
                        <th>Credits Consumed</th>
                    </tr>
                </thead>
                <tbody>
                    ${breakdownHtml}
                </tbody>
            </table>

            <div class="section-header">
                <h2>Previous 12 Months</h2>
                <div>
                    <button id="refreshHistoryButton" class="refresh-button">Refresh History</button>
                    <span id="refreshStatus" class="refresh-status" aria-live="polite"></span>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>Credits Used</th>
                        <th>Limit</th>
                        <th>Usage %</th>
                        <th>Synced</th>
                    </tr>
                </thead>
                <tbody>
                    ${historyRowsHtml}
                </tbody>
            </table>

            <script>
                const vscodeApi = acquireVsCodeApi();
                const refreshButton = document.getElementById('refreshHistoryButton');
                const refreshStatus = document.getElementById('refreshStatus');
                const defaultButtonText = 'Refresh History';
                const refreshTimeoutMs = 25000;
                let refreshFallbackHandle;

                function clearRefreshFallback() {
                    if (refreshFallbackHandle) {
                        clearTimeout(refreshFallbackHandle);
                        refreshFallbackHandle = undefined;
                    }
                }

                function updateRefreshUi(isRefreshing, statusText, level) {
                    if (refreshButton) {
                        refreshButton.disabled = isRefreshing;
                        refreshButton.textContent = isRefreshing ? 'Refreshing...' : defaultButtonText;
                    }

                    if (refreshStatus) {
                        refreshStatus.textContent = statusText || '';
                        refreshStatus.className = 'refresh-status' + (level ? ' ' + level : '');
                    }
                }

                refreshButton?.addEventListener('click', () => {
                    updateRefreshUi(true, 'Refreshing historical usage...', 'info');
                    clearRefreshFallback();
                    refreshFallbackHandle = setTimeout(() => {
                        updateRefreshUi(false, 'Refresh is taking longer than expected. You can close and reopen this panel later.', 'warning');
                    }, refreshTimeoutMs);
                    vscodeApi.postMessage({ command: 'refreshHistory' });
                });

                window.addEventListener('message', (event) => {
                    const message = event.data;
                    if (message?.command !== 'refreshState') {
                        return;
                    }

                    if (message.state === 'running') {
                        updateRefreshUi(true, message.message || 'Refreshing historical usage...', 'info');
                        clearRefreshFallback();
                        refreshFallbackHandle = setTimeout(() => {
                            updateRefreshUi(false, 'Refresh is taking longer than expected. You can close and reopen this panel later.', 'warning');
                        }, refreshTimeoutMs);
                        return;
                    }

                    clearRefreshFallback();
                    updateRefreshUi(false, message.message || 'Refresh finished.', message.level || 'info');
                });
            </script>
        </body>
        </html>
    `;

    panel.webview.html = htmlContent;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function deactivate() {}