# Privacy policy: Atlas Deep Research

Last updated: 10 October 2026

Atlas Deep Research is a Chrome extension that connects the Atlas investing app, running on your own computer or at an address you add, to Claude's Deep Research on claude.ai. This page says what it reads, what it keeps and where anything is sent.

## What the extension does with your data

- **On the Atlas page (localhost, or an address you add).** It notices when you click one of Atlas's "Deep research in Claude" links and takes the research prompt from that link.
- **On claude.ai.** In the one tab it opens for that research, it turns on Research mode, types the prompt into the message box and, after you press send, reads the text of Claude's finished report to find the result block at the end. It does not touch your other claude.ai tabs or chats.
- **Where the result goes.** The result block is handed to a tab open on the Atlas address that started the job (for example `http://localhost:3000`, which is your own computer, or your own hosted Atlas), and that page sends it to its own Atlas. Nothing else is sent anywhere.

## What it stores

The Atlas addresses you add are kept in Chrome's local extension storage until you remove them. While a research is running it keeps a short record (the prompt, the ID of the Claude tab, and the progress) in Chrome's session storage. Chrome clears session storage when you close the browser, and the extension deletes the record when its Claude tab closes or after the job ends.

## What it does not do

- It does not collect, sell or share personal information.
- It has no analytics, advertising or tracking, and no server of its own.
- It does not load or run code from the internet.
- It does not read your Claude password, your other tabs, your browsing history or any site other than claude.ai and the Atlas addresses (localhost, plus any you add).
- It never places a trade. Trades happen only when you approve them inside Atlas.

## Permissions

| Permission | Why |
|---|---|
| `storage` | The short-lived record of a running research, described above |
| `https://claude.ai/*` | To open the research tab, turn on Research mode, fill in the prompt and read the finished report |
| `http://localhost/*`, `http://127.0.0.1/*` | To talk to the Atlas app running on your own computer |
| `scripting` | To switch the Atlas script on for an Atlas address you add |
| Optional access to `https://` sites | Asked one address at a time, only when you add your own Atlas address on the options page. Never granted without your click, and removed when you remove the address |

## Contact

[Add your contact email here before publishing.]
