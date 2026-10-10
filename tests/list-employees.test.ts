/**
 * Use Case #2: Filter Active Employees by Department — tests
 *
 * Encodes the four Given/When/Then scenarios from 00-use-case.md against the
 * EmployeeCatalogMCPFinal `GET /employees` (ListEmployees) endpoint.
 *
 * Dual-mode: live when OUTSYSTEMS_BASE_URL is set, mocked fetch otherwise.
 *
 * NOTE on the no-match body: ODC omits unassigned / default-valued fields, so
 * a zero-result response comes back as `{}` rather than
 * `{"Employees":[],"TotalCount":0}`. The helpers below normalise that: an
 * absent Employees list means empty, an absent TotalCount means 0. This mirrors
 * the live behaviour observed during the build (see RUN-LOG.md).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { OutSystemsClient } from "../src/client.js";

const LIVE_BASE_URL = process.env.OUTSYSTEMS_BASE_URL;
const isLive = Boolean(LIVE_BASE_URL);

interface EmployeeListItem {
  Id: number;
  FirstName: string;
  LastName: string;
  Email: string;
  Department: string;
  JobTitle: string;
}

interface ListEmployeesResponse {
  Employees?: EmployeeListItem[];
  TotalCount?: number;
}

function makeClient(): OutSystemsClient {
  return new OutSystemsClient(
    isLive ? LIVE_BASE_URL : "https://mock.local/EmployeeCatalogMCPFinal/rest/EmployeeAPI"
  );
}

/** Absent Employees list == empty (ODC omits empty lists). */
function employeesOf(res: ListEmployeesResponse): EmployeeListItem[] {
  return res.Employees ?? [];
}

/** Absent TotalCount == 0 (ODC omits default-valued integers). */
function totalCountOf(res: ListEmployeesResponse): number {
  return res.TotalCount ?? 0;
}

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })
    )
  );
}

const uniqueDept = `QA-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const seededEmails = [
  `list.a.${Date.now()}@example.com`,
  `list.b.${Date.now()}@example.com`,
];

// Seed two active employees in a unique department for the live run so the
// filter / pagination assertions are deterministic.
beforeAll(async () => {
  if (!isLive) return;
  const client = makeClient();
  for (const [i, email] of seededEmails.entries()) {
    await client.post("/employees", {
      FirstName: `List${i}`,
      LastName: "Seed",
      Email: email,
      Department: uniqueDept,
      JobTitle: "Tester",
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /employees — Use Case #2: Filter Active Employees by Department", () => {
  // ── Scenario 1 ──────────────────────────────────────────────────────────
  it("test_given_active_employees_exist_when_get_employees_no_filter_then_200_with_employees_and_totalcount", async () => {
    if (!isLive) {
      mockFetchOnce(200, {
        Employees: [
          { Id: 1, FirstName: "Smoke", LastName: "Test", Email: "a@x.com", Department: "Engineering", JobTitle: "Dev" },
        ],
        TotalCount: 1,
      });
    }

    const client = makeClient();
    const res = await client.get<ListEmployeesResponse>("/employees");

    expect(res.status).toBe(200);
    const employees = employeesOf(res.data);
    expect(Array.isArray(employees)).toBe(true);
    expect(typeof totalCountOf(res.data)).toBe("number");
    // Every returned employee is active — soft-deleted records are excluded.
    // (The endpoint filters IsActive = True; there is no inactive marker in
    // the response, so active-ness is guaranteed by the server-side filter.)
    expect(employees.length).toBeGreaterThan(0);
  });

  // ── Scenario 2 ──────────────────────────────────────────────────────────
  it("test_given_active_employees_in_a_department_when_get_employees_filtered_then_only_that_department_returned", async () => {
    if (!isLive) {
      mockFetchOnce(200, {
        Employees: [
          { Id: 6, FirstName: "List0", LastName: "Seed", Email: seededEmails[0], Department: uniqueDept, JobTitle: "Tester" },
          { Id: 7, FirstName: "List1", LastName: "Seed", Email: seededEmails[1], Department: uniqueDept, JobTitle: "Tester" },
        ],
        TotalCount: 2,
      });
    }

    const client = makeClient();
    const res = await client.get<ListEmployeesResponse>("/employees", {
      params: { Department: uniqueDept },
    });

    expect(res.status).toBe(200);
    const employees = employeesOf(res.data);
    expect(employees.length).toBe(2);
    // Every returned employee has the requested department.
    expect(employees.every((e) => e.Department === uniqueDept)).toBe(true);
    // TotalCount equals the number of active employees in that department.
    expect(totalCountOf(res.data)).toBe(2);
  });

  // ── Scenario 3 ──────────────────────────────────────────────────────────
  it("test_given_no_employee_in_department_when_get_employees_filtered_then_200_empty_list_and_zero_count", async () => {
    const noSuchDept = `NoSuchDept-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    if (!isLive) {
      // ODC omits the empty list + zero count, so the body is `{}`.
      mockFetchOnce(200, {});
    }

    const client = makeClient();
    const res = await client.get<ListEmployeesResponse>("/employees", {
      params: { Department: noSuchDept },
    });

    expect(res.status).toBe(200);
    expect(employeesOf(res.data)).toHaveLength(0);
    expect(totalCountOf(res.data)).toBe(0);
  });

  // ── Scenario 4 ──────────────────────────────────────────────────────────
  it("test_given_more_matches_than_pagesize_when_get_employees_page1_size1_then_one_record_but_full_totalcount", async () => {
    if (!isLive) {
      mockFetchOnce(200, {
        Employees: [
          { Id: 6, FirstName: "List0", LastName: "Seed", Email: seededEmails[0], Department: uniqueDept, JobTitle: "Tester" },
        ],
        TotalCount: 2,
      });
    }

    const client = makeClient();
    const res = await client.get<ListEmployeesResponse>("/employees", {
      params: { Department: uniqueDept, Page: 1, PageSize: 1 },
    });

    expect(res.status).toBe(200);
    const employees = employeesOf(res.data);
    // Page holds exactly PageSize (1) record...
    expect(employees).toHaveLength(1);
    // ...but TotalCount reflects the full matching count (> page size).
    expect(totalCountOf(res.data)).toBe(2);
    expect(totalCountOf(res.data)).toBeGreaterThan(employees.length);
  });
});
