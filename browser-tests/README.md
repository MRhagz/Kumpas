# Kumpas browser verification

The system uses Playwright 1.64.1 with complete named-role, keyboard and axe WCAG 2.1 A/AA assertions. Firefox audits run in fresh processes with default axe aggregation. The system retains all keyboard, accessible-name and WCAG assertions.

The fixture imports the actual intake, analysis and report components and application CSS. It isolates Next navigation, authentication and API responses and uses synthetic reports. It does not call live providers or private Storage.

## Execution

```sh
npm ci
npx playwright install firefox webkit
npm run test:browser
npm run test:access -- --maxWorkers=2
```

The configured projects are Chrome, Edge, Firefox and WebKit. Installed Chrome/Edge channels use their normal locations; `PLAYWRIGHT_BROWSERS_PATH` selects an engine cache. CI provisions the required browsers.

The system passes ten local Chromium scenarios on 10 November 2026: report comparison at 375/768/1280 px, partial/long/expired mobile reports, rejected-state recovery and two intake-to-download keyboard workflows. Automated scans report zero WCAG AA violations. Intake scans contain a manual-review finding; human accessibility verification passes.

The system verifies visible keyboard focus, named workflow stages, alert announcements, dialog focus restoration, option selection, report approval/download, termination and absence of horizontal overflow. Browser artifacts retain screenshots, versions, traces and axe results.

Human Safari, spoken screen-reader, student-comprehension and counselor-usability verification pass. Current automated results are recorded in [release verification](../docs/sw-31-verification.md).
