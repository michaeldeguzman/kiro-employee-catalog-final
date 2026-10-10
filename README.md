# OutSystems Employee Catalog — REST API Tests

TypeScript + Vitest test suite for the **Employee Catalog** REST API, built on
OutSystems Developer Cloud (ODC) in the app `EmployeeCatalogMCPFinal`. The suite
validates the exposed `EmployeeAPI` endpoints against a live tenant, and falls
back to an in-process mock so it still passes in CI without a backend.

This repository contains the **tests and supporting docs** — the OutSystems app
itself (entities, server actions, REST API) lives in the ODC tenant and was
built via the OutSystems MCP / AI Mentor. See `RUN-LOG.md` for the full build
history and `brd-employee-catalog.md` for the business requirements.

## Endpoints under test

| Method | Route | Use case | What it does |
|---|---|---|---|
| `POST` | `/employees` | UC#1 Create | Create an employee; 201 on success, 409 duplicate email, 400 validation, 400 empty body |
| `GET` | `/employees` | UC#2 List/Filter | List active employees; optional `Department` filter; `Page`/`PageSize` pagination; returns `{ Employees, TotalCount }` |
| `GET` | `/employees/{Id}` | UC#3 Get by Id | Fetch one active employee; 200 on hit, 404 (`{ Errors, StatusCode }`) on miss |

The backend also contains soft-delete server actions (`Employee_Remove`,
`Employee_GetCanRemove`) but no `DELETE` endpoint is exposed yet — see the
"Not yet built" note below.

## Project layout

```
.
├── src/
│   └── client.ts                 # Reusable OutSystems REST client
├── tests/
│   ├── setup.ts                  # Loads .env (via dotenv) once per test file
│   ├── create-employee.test.ts   # UC#1 — POST /employees (4 scenarios)
│   ├── list-employees.test.ts    # UC#2 — GET /employees (4 scenarios)
│   ├── get-employee.test.ts      # UC#3 — GET /employees/{Id} (2 scenarios)
│   ├── employees.test.ts         # Placeholder (index to the per-use-case files)
│   └── client.test.ts            # Placeholder for future client unit tests
├── 00-use-case.md                # Use-case tracker (scenarios + status)
├── RUN-LOG.md                    # Timestamped build log
├── brd-employee-catalog.md       # Business requirements document
├── .env.example                  # Environment variable template
├── vitest.config.ts
├── tsconfig.json
└── package.json
```

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set OUTSYSTEMS_BASE_URL (and OUTSYSTEMS_API_KEY if your API needs one)
```

### `.env` values

| Variable | Required | Description |
|---|---|---|
| `OUTSYSTEMS_BASE_URL` | For live runs | Base URL of the exposed EmployeeAPI, e.g. `https://<ODC_ENV_HOST>/EmployeeCatalogMCPFinal/rest/EmployeeAPI` |
| `OUTSYSTEMS_API_KEY` | No | API key sent as `X-API-Key` header (the sample app's API is open, so this is unused) |

Leave `OUTSYSTEMS_BASE_URL` **empty** to run the whole suite offline against the
in-process mock.

## Running tests

| Command | Description |
|---|---|
| `npm test` | Run all tests once |
| `npm run test:watch` | Re-run on file changes |
| `npm run test:ui` | Open the Vitest browser UI |
| `npm run test:coverage` | Generate a coverage report |
| `npm run typecheck` | Type-check without running tests |

Current suite: **10 tests** (UC#1: 4, UC#2: 4, UC#3: 2) plus 2 skipped
placeholders.

### Live vs. mock mode

- `OUTSYSTEMS_BASE_URL` **set** → tests hit the live tenant. Each test seeds its
  own data with unique emails/departments so re-runs don't collide.
- `OUTSYSTEMS_BASE_URL` **empty** → `fetch` is mocked per test with responses
  that mirror the live payloads, so the suite passes in CI with no backend.

> ODC omits unassigned / default-valued fields in JSON. A zero-result list
> comes back as `{}` (not `{"Employees":[],"TotalCount":0}`), and success
> bodies omit the `Errors`/`StatusCode` error fields. The tests account for this.

## Adding new endpoint tests

Follow the per-use-case pattern (one file per endpoint group):

1. Create `tests/<feature>.test.ts`.
2. Import `OutSystemsClient` from `../src/client.js` (the `.js` extension is
   required by NodeNext resolution).
3. Define your response-type interfaces.
4. Use the dual-mode pattern: real client when `OUTSYSTEMS_BASE_URL` is set,
   `vi.stubGlobal("fetch", ...)` otherwise (clean up with `vi.unstubAllGlobals()`).

```ts
import { afterEach, describe, it, expect } from "vitest";
import { OutSystemsClient } from "../src/client.js";

const base = process.env.OUTSYSTEMS_BASE_URL;
const isLive = Boolean(base);

afterEach(() => vi.unstubAllGlobals());

describe("GET /departments", () => {
  it("returns a list", async () => {
    if (!isLive) {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify([{ Id: 1, Name: "Engineering" }]), {
          status: 200, headers: { "content-type": "application/json" },
        })
      ));
    }
    const client = new OutSystemsClient(base ?? "https://mock.local/rest/EmployeeAPI");
    const res = await client.get("/departments");
    expect(res.status).toBe(200);
  });
});
```

## OutSystemsClient API

```ts
const client = new OutSystemsClient(baseUrl?, apiKey?);

client.get<T>(path, options?)
client.post<T>(path, body?, options?)
client.put<T>(path, body?, options?)
client.patch<T>(path, body?, options?)
client.delete<T>(path, options?)
```

All methods return `Promise<ApiResponse<T>>`:

```ts
interface ApiResponse<T> {
  status: number;
  ok: boolean;        // true for 2xx
  data: T;
  headers: Record<string, string>;
}
```

Pass query params via `options.params`:

```ts
client.get("/employees", { params: { Department: "Engineering", Page: 1, PageSize: 25 } });
// → GET /employees?Department=Engineering&Page=1&PageSize=25
```

## Not yet built

Specified in the BRD but out of scope for the current build (no use-case
scenarios yet):

- `DELETE /employees/{Id}` — soft-delete endpoint (`Employee_Remove` exists in
  the backend but is not exposed via REST).
- `PUT`/`PATCH /employees/{Id}` — update endpoint (`Employee_Upsert` already
  handles updates internally).
- Screens (`Employee_List`, `Employee_Detail`) and role-based permissions.
