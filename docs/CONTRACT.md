# Implementation contract

App: Indonesian read-only marketing dashboard for LPK Duta Persada Yogyakarta. Full PRD is docs/PRD.md. Node >=22.12, React + Vite, Bootstrap 5, Express. Blue #06509B, yellow #F1D043. Root D:/marketing-dashboard. Do not modify any files outside your ownership. Use strict vertical TDD cycles, run failing test then implementation then green. Tests use node:test and node:assert/strict, named *.test.mjs. No commits needed.

## Shared normalized data
`shared/data.mjs` exports `normalizeWorkbook(workbook)`; raw workbook object keys are exact tab names, values are row arrays with headers at row 0. Returns:
```
{schools:[{id,name,region,ownership,owner,status,lastVisitDate:null|string,source:{tab,row}}],
 pics:[{id,schoolId,name,position,whatsapp,status,source:{tab,row}}],
 tiers:[{schoolId,year:Number,tier:'Tier 1'|'Tier 2'|'Tier 3'|null,invalid?:boolean,source:{tab,row}}],
 visits:[{id,date:'YYYY-MM-DD',schoolId,marketer,activities:[String],pic,result,nextAction,followUpDate:null|string,followUpStatus:String,invalidFollowUpDate?:boolean,source:{tab,row}}],
 years:[Number],issues:[{code,tab,row,column,message,severity:'error'|'warning'}],hasFatalIssues:Boolean}
```
Missing mandatory headers => fatal, preserve prior cache. Duplicate school IDs: exclude ambiguous copies and dependent refs, flag all source rows. Duplicate visit IDs: deterministic keep first valid visit, flag duplicates; count once. Bad tier values explicitly invalid, not unassessed. Bad date visit excluded. Invalid follow-up dates do not become unscheduled. Exact school IDs, never fuzzy name matching. Messages must not expose contact numbers or cell values/credentials. Raw source values are never echoed in issues. Tier years dynamic /^Tier (\\d{4})$/.

`shared/selectors.mjs` exports:
- `jakartaToday(now = new Date())` => YYYY-MM-DD via Intl timezone Asia/Jakarta
- `classifyFollowUp(visit, today=jakartaToday())` => one of overdue,today,upcoming,unscheduled,completed,cancelled,status-missing,invalid,none. Empty/unknown status with next action => status-missing; empty action/status => none. Completed/cancelled take precedence, otherwise invalid follow-up date => invalid.
- `filterSchools(data, filters={})` => array, filters: search,region,owner,status,tier,year,sort ('name-asc','name-desc','last-visit'), schoolIds optional array. tier='unassessed' means genuinely empty only; tier='invalid' separate; empty filter = all. search name or ID case insensitive. schoolIds [] => no schools.
- `filterVisits(data, filters={})` => array, filters: start,end,region,schoolId,marketer,activity,schoolIds optional array. Inclusive dates, date ISO.
- `dashboardSummary(data, filters={})` => {totalSchools,activeSchools,tier1,tier2,tier3,unassessed,invalidTier,visits,visitedSchools,followUpToday,followUpOverdue}; school filters select schools, visit filters additionally start/end/marketer/activity, follow-up counts all time for selected schools and marketer (not limited by visit date). Optional filters.today supports testing.
- `compareTiers(data, fromYear, toYear, filters={})` => array of {school,from:null|string,to:null|string,change:'improved'|'declined'|'unchanged'|'unassessed'|'invalid'}; blank either side cannot improved/declined.

## HTTP API
`server/app.mjs` exports async `createApp(options={})` => Express app. `server/index.mjs` starts loopback 127.0.0.1:3001 default. Production static dist served same port. Dev Vite 127.0.0.1:5173 proxy /api to :3001.
- GET /api/health => {ok:true} (public, contains no private data)
- GET /api/auth/session => {user:null|{id,name,email,role}, demoAvailable:Boolean} public (never includes data)
- POST /api/auth/login {email,password} => {user}; 401 generic invalid, rate-limit
- POST /api/auth/demo {} => {user} ONLY DATA_MODE=demo and NODE_ENV!=production or explicitly safe local setup. Demo login cannot read real data.
- POST /api/auth/logout => {ok:true}
- GET /api/data => response below, AUTH REQUIRED
- POST /api/sync {} => response below, AUTH REQUIRED, origin protection. Rate-limit/concurrent coalescing. Failed sync WITH cache returns stale data + status.error; WITHOUT cache 503 with explanatory safe message, never zero/fake data.
```
{data:NormalizedData,status:{mode:'demo'|'sheets',connection:'demo'|'connected'|'error'|'not_configured',lastSuccessAt:ISO|null,lastAttemptAt:ISO|null,error:string|null,spreadsheetUrl:string|null,nextSyncAt:ISO|null}}
```
No credentials or raw workbook in browser bundle/public folder. Fetch cache via GET; automatic server sync 300000ms. Persist last good cache (namespaced by mode AND spreadsheet ID), atomic write. Missing header failure retains previous dataset but updates issues for status page through status.issues optional field.

## Auth/config
Environment via dotenv (root .env, ignored). DATA_MODE=demo default locally, NODE_ENV=development, HOST=127.0.0.1, PORT=3001. Demo data conspicuously marked fictional and not connected in UI, demo auth only demo source. Sheets live requires GOOGLE_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_FILE pointing outside public, SESSION_SECRET long random, USERS_FILE (default server/config/users.json ignored). Approved users have id/name/email/role/passwordHash from scrypt. Provide scripts/create-user.mjs noninteractive username/email/password stdin or prompt, never real passwords in CLI args/output; helper exports for testing. File-backed sessions secure httpOnly sameSite strict/lax with secure in production. No automatic zero fallback to demo in live mode. Origin/host checks on mutating endpoints; no permissive CORS. No write calls to Sheets.

## Frontend
All src/, index.html and vite config owned by frontend agent unless notified; use shared selectors imported from ../../shared or respective relative path. API client `src/services/api/client.js` same-origin credentials. All 7 routes dashboard, schools, school detail, tiers, visits, follow-ups, data status, plus login. Hash router acceptable, preserve active filters in drilldowns. Need dashboard all 4 charts, KPI click drilldowns, per-tier metrics, overdue queue. Distinguish year tier vs date activity, responsible vs performing marketer. Sort/pagination, empty/loading/error states, dynamic years, actual new-year compare. Buttons must work, no dead export/download affordances. Contact wa.me link only on click; demo numbers blank/fictional no real persons. Local font optional use @fontsource/dm-sans if installed (parent will install). Do not fetch external assets at runtime. Avoid putting demo/raw dataset in frontend module/public: always use protected API. Mobile offcanvas accessible aria+Escape/focus, readable tables with details buttons, 44px controls. CSS in separate central vars stylesheet, no monster single-file implementation.

## Ownership
- Domain agent: shared/data.mjs, shared/selectors.mjs, tests/domain.test.mjs, tests/selectors.test.mjs, docs/DATA-RULES.md.
- Backend agent: server/**, scripts/create-user.mjs, tests/server.test.mjs, tests/sync.test.mjs, docs/GOOGLE-SHEETS.md, .env.example. Demo generator backend-only. Do NOT edit package.json or root config (parent handles); may request dependencies.
- Frontend agent: src/**, index.html, vite.config.js, public/assets/images/logo/*, tests/frontend.test.mjs (static/component helper tests as feasible). Do NOT edit package.json. Parent supplies dependencies.
- Parent: package.json/lock, test config, browser tests, README, launchers, final integration and review.
