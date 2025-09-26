E2E Smoke Tests - Marnthara
===========================

Contents:
- dev-server.js          : simple static server using serve-handler
- e2e/run_smoke.js      : orchestrator. starts server then runs tests
- e2e/smoke.test.js     : Puppeteer smoke tests for core flows
- package.json           : dev dependencies and scripts

How to run locally:
1. Install dependencies:
   npm install

2. Run tests:
   npm run test:e2e

What the tests do (smoke):
- Start a local static server at http://localhost:8080 serving project files
- Open page, verify initial rooms container
- Click QuickNav Add Room and assert room count increases
- Check focus on new room name input
- Toggle room options menu and assert visibility
- Optionally click add-set and assert set count increases
- Click Export PDF and check export modal appears

Notes and limitations:
- Tests assume files are in the repository root (index.html, main.js, ui.js, etc.)
- Tests run headless. Use headless:false for visual debugging.
- Network/Module caching may require hard refresh or server restart.
