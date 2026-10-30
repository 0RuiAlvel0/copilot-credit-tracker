# Goal & Quick Overview

### **When you have a GitHub Copilot subscriptio (Pro, Pro+, Max - you rich!), you know how much you should spend, you just want to pace yourself throughout the month. This is what this extension helps you do.**

Tip: read the awards section below if you end up using this extension. Everyone's talking about this.

---------

The extension compares your GitHub Copilot monthly credit usage (this is editable on the settings, read below) with how much of the month has passed (this you cannot change, unless you are God). I needed this for a quick status bar check to see whether I am on track or running ahead of budget, without extra clicks and interactions and without the complexity of the information Copilot already provides. I am just a simple guy.

This extension has been described as "fantastic" by my mother. It shows only a simple status bar message like this when all is well and you are behind your usage pace:

![Copilot Credit Tracker Screenshot](https://ik.imagekit.io/supertechman/Screenshot%202026-07-15%20170018.png?updatedAt=1784106174855)

It will turn red if your usage pace is ahead of your monthly budget. If that is the case, you may have to go into your additional budget, sorry - but don't worry, you'll get that and much more back when your vibe coded SaaS finally makes it big. You deserve it.

![Copilot Credit Tracker Screenshot](https://ik.imagekit.io/supertechman/Screenshot%202026-10-29%20193127.png)

## Wait, there's more?!
Yes, there's a webview panel that breaks down usage by model and shows the total usage percentage for the current month. I know, fantastic. That feature looks like this:

![Copilot Credit Tracker Screenshot](https://ik.imagekit.io/supertechman/another.png)

Wait, there is even more. The other day I wanted to know how my usage compared to previous months so I built the historical usage view into the extension as well because nothing can stop me and I do what I want. You can see here that I cannot control myself and have gone over budget a few times in plenty of moments of weakness.

![Copilot Credit Tracker Screenshot](https://ik.imagekit.io/supertechman/moreontheextension.png)

It even has a blue button, one of the most requested features. You click it, it refreshes that table right there and then. Yes, I am that good.

# Contacts

- GitHub supository: [supertechman](https://github.com/0RuiAlvel0/copilot-credit-tracker)
- Website: [supertechman.com](https://site.supertechman.com/posts/show/copilot-credit-tracker-in)

## How It Works

1. On startup, the extension checks your GitHub authentication session in VS Code.
2. It requests your GitHub user profile.
3. It fetches your monthly AI credit usage from GitHub billing APIs.
4. It calculates your usage percentage against your configured monthly limit.
5. It updates the status bar and refreshes automatically every 30 minutes.

If you are not signed in, the extension prompts you to authenticate with GitHub.

## Requirements

- VS Code 1.144.0 or newer.
- GitHub Authentication extension enabled (built-in dependency: vscode.github-authentication).
- A GitHub account with Copilot access.

## Installation

### Option 1: From Marketplace

1. Open Extensions in VS Code.
2. Search for Copilot Credit Tracker.
3. Click Install.

### Option 2: From VSIX (local/manual install)

1. You can download the latest .vsix file from the releases page. If you do that, you can start on step 3. Otherwise, you can build the .vsix file yourself from the source code like a peasant:
2. Package the extension:
	 - npm install
	 - npm run compile
	 - npx @vscode/vsce package
3. In VS Code, open Extensions.
4. Select More Actions (three dots) and choose Install from VSIX.
5. Pick the generated .vsix file.
6. Enlightenment.

## Usage

1. Open VS Code.
2. Sign in to GitHub if prompted.
3. Look at the right side of the status bar for the Copilot usage indicator.
4. Click the status bar item to open the full monthly breakdown panel.
5. In the panel, review the "Previous 12 Months" table and use "Refresh History" to sync updated historical data.
6. Nirvana.

Status meanings:
- check icon: usage pace is healthy
- warning icon: usage pace is ahead of month progress
- API Error: request to GitHub failed
- Auth Required: GitHub sign-in is needed

## Configuration

This extension has one setting:

- copilotCreditTracker.monthlyLimit
	- Type: number
	- Default: 7000
	- Description: your monthly GitHub AI credit cap

Example values:
- 1500 for a lower-tier plan (Sorry, you poor).
- 7000 for a higher-tier plan (Copilot Copilot Pro+ <- me, medium wealth. I am grateful for each day).
- 100000000000000000000 (Altman, Dhh, these kind of people).

Update this in Settings if your monthly credit allowance differs from the default.

## Data and Permissions

The extension uses your GitHub auth token from VS Code to call:
- https://api.github.com/user
- https://api.github.com/users/{login}/settings/billing/ai_credit/usage

Data is used only to compute and display your usage inside VS Code.
No backend service is included in this extension.

## Troubleshooting

- Auth Required shown in status bar:
	- Sign in to GitHub via VS Code Accounts menu, then wait for the next refresh.
- API Error shown in status bar:
	- Verify internet access.
	- Confirm your GitHub account can access Copilot billing usage.
	- Reload VS Code and try again.
- No usage data in panel:
	- There may be no usage yet for the selected month.
	- Wait for the next refresh or reload window.
	- I think that at times, if there are too many items on the task bar, VS Code will make it disappear or hide it, I am not too sure about this yet but it happens to me sometims and I hate it. Who developed this thing?

## Annoying stuff

- Sometimes the status bar item disappears if there are too many items there. Still not too sure what is going on exactly, but it seems to be a VS Code thingy.
- I have to make the refresh rate configurable (now hard coded at 30min) because many times my agent is hard at work and what the extension reports is not up-to-date until the next refresh and 30 minutes is too long.

## Development

1. Install dependencies:
	 - npm install
2. Build once:
	 - npm run compile
3. Watch mode:
	 - npm run watch
4. Run extension tests:
	 - npm test
5. Launch extension in a VS Code Extension Development Host using F5.

## Thanks

- Thanks to me.
- Thanks to you.

## Awards

- If you read until the end here, and you know this section is here you will be mentioned in the hall of fame of this extension which is a very important recognition. All you have to do is send a message to ci.res.network@gmail.com with your GH username - I will add you to the list that doesn't exist yet because nobody has done it so far (since 1990).
