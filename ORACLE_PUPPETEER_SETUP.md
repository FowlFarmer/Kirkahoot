# Oracle Cloud Puppeteer Automation Setup

## Project Overview

This document describes a clean architecture for a remote browser automation service using Puppeteer and Oracle Cloud Always Free resources.

The goal is to build a secure frontend/backend system where:

- the frontend is a normal web app (e.g. Vercel)
- the backend runs Puppeteer on a separate host
- the backend handles browser automation, page rendering, and data extraction
- the frontend never runs Puppeteer directly or controls the browser itself

This is a replacement for the old `kahoot-hack` repo concept: use the repo as scratch, but the actual architecture should be a dedicated backend automation service.

---

## Architecture

### Components

1. **Frontend**
   - Static UI or normal web app
   - Sends requests to backend API
   - Displays results (screenshots, DOM snapshots, JSON state)

2. **Backend**
   - Node.js service running Puppeteer
   - Hosted on Oracle Cloud (Always Free VM)
   - Controls headless Chromium
   - Performs automation and renders output

3. **Browser automation**
   - Puppeteer launches or connects to Chromium
   - Loads target page
   - Performs interactions (clicks, form input, DOM extraction)
   - Returns rendered output to frontend

### Why this setup?

- Browser automation cannot be safely done inside a normal user-facing webpage
- A browser page is sandboxed by same-origin policy
- Puppeteer runs outside the page and can control Chromium directly
- The frontend only requests work from the backend and displays results

---

## Oracle Cloud Free Tier Choice

### Why Oracle Cloud?

Oracle offers a better fit for this workload compared to pure serverless platforms because it provides:

- two always-free VMs
- a real persistent machine
- control over the runtime environment
- no forced request timeout for long-running jobs

### Best fit for Puppeteer

A persistent VM is ideal for a Puppeteer backend because:

- you can keep Chromium warm
- you can reuse a browser instance across jobs
- you avoid cold-start cost of launching Chromium for each request
- you can install the right browser binary and system packages

### Free tier limitations

- 2 free VM instances
- limited CPU and memory
- appropriate for one lightweight automation service
- not suitable for a large fleet of concurrent sessions

---

## Backend Design

### Backend design

For this repo, the backend is a long-running Puppeteer service that manages per-user sessions:

- one persistent Chromium browser process
- a separate incognito browser context for each connected user
- a dedicated page per session
- session cleanup when the socket disconnects

### Current repo implementation

The repo is implemented as a snapshot-streaming backend instead of a job queue:

- frontend opens `ws://localhost:3001/ws`
- frontend sends an `init` message with a 7-digit Kahoot PIN and a nickname
- backend validates the PIN and nickname
- backend loads `https://kahoot.it/?pin=<PIN>&refer_method=link`
- backend captures sanitized HTML snapshots from Puppeteer
- backend streams snapshots back to the connected WebSocket session
- frontend renders the stream in a read-only `srcDoc` iframe after initialization

### Features added in this repo

- frontend PIN validation for exactly 7 digits
- nickname field and per-user session storage
- static DOM snapshot streaming with change detection
- sanitized snapshot capture (scripts removed, base URL normalized)
- camera preview on the frontend
- read-only iframe rendering of the streamed snapshot
- backend endpoint `GET /snapshot?session=<id>` for optional polling
- backend health endpoint `GET /health`

If the environment is too constrained, launch a fresh browser per request, but expect slower response.

---

## What to return to the frontend

For a static visual render, the backend can return:

- screenshot images (`jpeg`/`webp`)
- DOM/HTML snapshots
- extracted page state (JSON)
- a static rendered preview

### Recommended approach

- Prefer screenshots for a reliable visual result
- Use HTML snapshots only if you want a lightweight static render
- Don’t expect streamed DOM to behave like a live page

### Visual result options

- `page.screenshot({ type: 'jpeg', quality: 70 })`
- `page.evaluate(() => document.documentElement.outerHTML)`
- `page.evaluate(() => ({ title: document.title, url: location.href, elements: ... }))`

---

## Security and resource controls

### Secure API access

- Serve the backend over HTTPS
- Authenticate users or clients
- Authorize job creation requests
- Do not expose backend admin credentials to the frontend

### Resource limits

- enforce timeouts per job
- limit concurrent jobs
- close pages when done
- if a job hangs, kill the browser page or browser process

### Avoid unsafe setups

- do not let the browser load arbitrary untrusted scripts without filtering
- do not run arbitrary user code in the same process
- use a separate container or VM for automation

---

## Oracle Cloud VM Setup Steps

### 1. Create an Oracle Cloud account

- register for Oracle Cloud free tier
- verify your account
- navigate to the Oracle Cloud console

### 2. Provision an Always Free VM

- go to Compute > Instances
- create a new instance using an Always Free eligible shape
- choose a lightweight Linux image, e.g. Oracle Linux, Ubuntu
- open SSH access

### 3. SSH into the VM

```bash
ssh opc@<your-vm-ip>
```

### 4. Install Node.js and dependencies

Example for Ubuntu:

```bash
sudo apt update && sudo apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxcomposite1 libxrandr2 libxdamage1 libxkbcommon0 libgbm1 libpango-1.0-0 libglib2.0-0
```

### 5. Install Chromium and Puppeteer

```bash
npm init -y
npm install puppeteer express
```

If you use `puppeteer-core`, install Chromium separately.

### 6. Create your backend service

Example structure:

- `index.js`
- `package.json`
- `jobs/` or `lib/`

Example minimal backend code:

```js
const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

let browser;
async function initBrowser() {
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

app.post('/api/jobs', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });
  const screenshot = await page.screenshot({ type: 'jpeg', quality: 70 });
  await page.close();

  res.type('image/jpeg');
  res.send(screenshot);
});

app.listen(3000, () => {
  console.log('server listening on 3000');
  initBrowser();
});
```

### 7. Run the service

```bash
node index.js
```

### 8. Expose the service securely

- configure a firewall/security list in Oracle Cloud
- open only required ports
- use a reverse proxy or certificate manager if needed
- consider using a small HTTPS proxy or managed certificate

---

## Frontend integration

### How the frontend should communicate

- call your backend API over HTTPS
- do not expose any backend control token in public code
- if you need real-time updates, use WebSocket or polling

### Example flow

1. User requests a preview or automation action
2. Frontend calls `POST /api/jobs`
3. Backend starts Puppeteer and returns a job ID or result
4. Frontend polls `GET /api/jobs/:id/status` or listens on WebSocket
5. Backend returns final output

### What to display

- static screenshot image
- rendered DOM snapshot in a safe UI container
- extracted JSON state

---

## What not to do

- Do not try to run Puppeteer inside a normal webpage.
- Do not try to use the frontend to directly control a remote browser through DevTools without a secure backend.
- Do not use an iframe to automatically control a cross-origin site from regular page JS.

---

## Summary

This project should be built as a backend automation service on Oracle Cloud using a dedicated VM and Puppeteer.

- Use the backend for page rendering and automation
- Keep the frontend focused on UI and API calls
- Secure the API and limit job resources
- Prefer screenshots for static visual output
- Oracle Cloud Always Free is a good choice for a persistent small backend

This file is the writeup for a clean Puppeteer architecture and Oracle Cloud deployment, separate from the old Kahoot hack repository logic.
