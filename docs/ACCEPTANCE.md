# Acceptance tracking

Scope: a working locally runnable implementation of PRD v1. Google Sheets access was not supplied, so demo data must be explicitly labeled and actual source reconciliation must remain unverified until configuration.

| PRD acceptance | Automated/manual evidence required |
|---|---|
| Login gates all internal data | API tests unauthenticated data/sync fail; browser does not render private app before login |
| School/tier counts match same filter | Domain fixture assertions + browser compare with protected API; real spreadsheet reconciliation pending |
| Blank tier separate | Domain selectors and visible legend/filter; invalid tier also separate |
| School ID joins | Domain invalid/orphan IDs excluded + detail browser check |
| School owner vs visit marketer | Distinct selectors, clear UI labels and filter tests |
| Unique visits | Duplicate-ID normalization tests |
| Jakarta due/overdue | Tests near UTC/Jakarta date boundary |
| Invalid rows visible | Issues code, tab, source row, no raw contact values |
| Successful sync updates data | Injectable source changes tested; real account pending |
| Dynamic tier years | New Tier 2028 fixture column recognized |
| Failed sync retains last good | Persistent cache tests, missing-header failure tests |
| Mobile main/detail | Chromium mobile viewport, menu/detail actions, no document horizontal overflow |
| Bootstrap and brand theme | Bootstrap installed/imported, centralized CSS variables exact PRD colors |
| Replaceable logo | Assets folder, login/sidebar/mobile placeholder, contain sizing |
| Mobile menu opens/closes | Browser E2E |
| Separate responsibilities | Directory tree, protected server-only Google client, no dataset in browser source |
| Performance baseline | 1,000 schools/10,000 visits domain timing; cached endpoint/build timing local only |

Not accepted as production/live without: actual spreadsheet ID, private service-account credential file shared Viewer on that spreadsheet, approved real users, HTTPS deployment, actual source reconciliation and operational trial.
