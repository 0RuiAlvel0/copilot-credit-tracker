import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;

// Cache these values globally so the Webview panel can read them instantly
let cachedUsageData: any = null;
let cachedMonthProgress: number = 0;
let cachedTotalUsed: number = 0;
let cachedLimit: number = 7000;

export function activate(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);

    const showPanelCommandId = 'copilot-credit-tracker.showPanel';
    
    // Command to show the detailed Webview panel
    context.subscriptions.push(vscode.commands.registerCommand(showPanelCommandId, () => {
        showDetailsPanel();
    }));

    // Attach the panel command to the status bar click
    statusBarItem.command = showPanelCommandId;

    updateStatusBar();
    // Refresh the background data every 30 minutes to keep the status bar up-to-date
    setInterval(updateStatusBar, 1000 * 60 * 30); // 30 minutes
}

async function updateStatusBar() {
    try {
        cachedMonthProgress = getMonthProgress();
        const status = await fetchCopilotData();

        if (status === 'not_logged_in') {
            statusBarItem.text = `$(github) GHCP: Auth Required`;
            statusBarItem.color = '#ffcc00';
            statusBarItem.show();
            return;
        }

        if (status === 'api_error') {
            statusBarItem.text = `$(error) GHCP: API Error`;
            statusBarItem.tooltip = "Click to view details or check Debug Console.";
            statusBarItem.color = '#ff4d4d';
            statusBarItem.show();
            return;
        }

        // Success state: Calculate percentage and display
        const usagePercentage = (cachedTotalUsed / cachedLimit) * 100;
        const isOverspending = usagePercentage > cachedMonthProgress;
        const icon = isOverspending ? '$(warning)' : '$(check)';
        
        statusBarItem.text = `${icon} Month: ${cachedMonthProgress.toFixed(0)}% | GHCP: ${usagePercentage.toFixed(0)}%`;
        statusBarItem.tooltip = "Click to view full Copilot usage breakdown";
        statusBarItem.color = isOverspending ? '#ff4d4d' : undefined;
        statusBarItem.show();

    } catch (error) {
        console.error('Failed to update GHCP status', error);
    }
}

function getMonthProgress(): number {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const totalDays = endOfMonth.getDate();
    const currentDay = now.getDate();

    return (currentDay / totalDays) * 100;
}

async function fetchCopilotData(): Promise<'success' | 'not_logged_in' | 'api_error'> {
    const session = await vscode.authentication.getSession('github', ['user'], { createIfNone: false });
    
    if (!session) {
        vscode.window.showInformationMessage('Please sign in to GitHub to track Copilot credits.', 'Sign In').then(selection => {
            if (selection === 'Sign In') {
                vscode.authentication.getSession('github', ['user'], { createIfNone: true });
            }
        });
        return 'not_logged_in';
    }

    const userResponse = await fetch('https://api.github.com/user', {
        headers: {
            'Authorization': `Bearer ${session.accessToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2026-03-10'
        }
    });
    
    if (!userResponse.ok) return 'api_error';
    const userData: any = await userResponse.json();

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; 

    const billingResponse = await fetch(`https://api.github.com/users/${userData.login}/settings/billing/ai_credit/usage?year=${year}&month=${month}`, {
        headers: {
            'Authorization': `Bearer ${session.accessToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2026-03-10'
        }
    });

    if (!billingResponse.ok) return 'api_error';

    cachedUsageData = await billingResponse.json();
    
    // Sum up all AI models used
    cachedTotalUsed = 0;
    if (cachedUsageData.usageItems && Array.isArray(cachedUsageData.usageItems)) {
        for (const item of cachedUsageData.usageItems) {
            cachedTotalUsed += item.grossQuantity || 0;
        }
    }
    
    // Determine the user's limit using our fallback logic
    cachedLimit = determinePlanLimit();

    return 'success';
}

function determinePlanLimit(): number {
    // 1. Read from VS Code User Settings if defined (allows other users to configure their tier)
    const configLimit = vscode.workspace.getConfiguration('copilotCreditTracker').get<number>('monthlyLimit');
    if (configLimit && configLimit > 0) {
        return configLimit;
    }

    // 2. Fallback to 7000 (Pro+) as the default assumption
    return 7000;
}

function showDetailsPanel() {
    const panel = vscode.window.createWebviewPanel(
        'copilotUsageDetails',
        'Copilot Credit Breakdown',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    // Build the table rows for each model
    let breakdownHtml = '';
    if (cachedUsageData && cachedUsageData.usageItems && cachedUsageData.usageItems.length > 0) {
        breakdownHtml = cachedUsageData.usageItems.map((item: any) => `
            <tr style="border-bottom: 1px solid var(--vscode-panel-border);">
                <td style="padding: 12px 8px;">${item.model || item.sku || 'Unknown'}</td>
                <td style="padding: 12px 8px;">${(item.grossQuantity || 0).toFixed(2)}</td>
            </tr>
        `).join('');
    } else {
        breakdownHtml = '<tr><td colspan="2" style="padding: 12px 8px; text-align: center;">No model usage data available yet.</td></tr>';
    }

    const usagePercentage = ((cachedTotalUsed / cachedLimit) * 100).toFixed(1);
    const isWarning = parseFloat(usagePercentage) > cachedMonthProgress;

    // Inject the HTML UI using native VS Code theme variables so it automatically matches Dark/Light mode
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
        </body>
        </html>
    `;

    panel.webview.html = htmlContent;
}

export function deactivate() {}