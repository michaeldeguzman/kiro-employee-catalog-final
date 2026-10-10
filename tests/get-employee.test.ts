/**
 * Use Case #3: Get Employee by Id — tests
 *
 * Encodes the two Given/When/Then scenarios from 00-use-case.md against the
 * EmployeeCatalogMCPFinal `GET /employees/{Id}` (GetEmployee) endpoint.
 *
 * Dual-mode: live when OUTSYSTEMS_BASE_URL is set, mocked fetch otherwise.
 */
import { afterEach, describe, expect, it } from "vitest";
import { OutSystemsClient } from "../src/client.js";

const LIVE_BASE_URL = process.env.OUTSYSTEMS_BASE_URL;
const isLive = Boolean(LIVE_BASE_URL);

interface GetEmployeeResponse {
  Id?: number;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  Department?: string;
  JobTitle?: string;
  Errors?: string[];
  StatusCode?: number;
}

interface CreateEmployeeResponse {
  Id?: number;
}

function makeClient(): OutSystemsClient {
  return new OutSystemsClient(
    isLive ? LIVE_BASE_URL : "https://mock.local/EmployeeCatalogMCPFinal/rest/EmployeeAPI"
  );
}

function uniqueEmail(prefix = "get"): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /employees/{Id} — Use Case #3: Get Employee by Id", () => {
  // ── Scenario 1 ──────────────────────────────────────────────────────────
  it("test_given_existing_active_employee_when_get_by_id_then_200_with_matching_fields_and_no_error_fields", async () => {
    const email = uniqueEmail("getbyid");
    const payload = {
      FirstName: "Get",
      LastName: "ById",
      Email: email,
      Department: "Engineering",
      JobTitle: "Engineer",
    };

    const client = makeClient();
    let id = 123;

    if (isLive) {
      // Create first, capture the generated Id.
      const created = await client.post<CreateEmployeeResponse>("/employees", payload);
      expect(created.status).toBe(201);
      id = created.data.Id as number;
    } else {
      mockFetchOnce(200, {
        Id: id,
        FirstName: payload.FirstName,
        LastName: payload.LastName,
        Email: payload.Email,
        Department: payload.Department,
        JobTitle: payload.JobTitle,
      });
    }

    const res = await client.get<GetEmployeeResponse>(`/employees/${id}`);

    expect(res.status).toBe(200);
    expect(res.data.Id).toBe(id);
    expect(res.data.FirstName).toBe(payload.FirstName);
    expect(res.data.LastName).toBe(payload.LastName);
    expect(res.data.Email).toBe(payload.Email);
    expect(res.data.Department).toBe(payload.Department);
    // Success body omits the error envelope fields.
    expect(res.data.Errors).toBeUndefined();
    expect(res.data.StatusCode).toBeUndefined();
  });

  // ── Scenario 2 ──────────────────────────────────────────────────────────
  it("test_given_nonexistent_id_when_get_by_id_then_404_with_not_found_body", async () => {
    const missingId = 999_999_999;

    if (!isLive) {
      mockFetchOnce(404, { Errors: ["Employee not found."], StatusCode: 404 });
    }

    const client = makeClient();
    const res = await client.get<GetEmployeeResponse>(`/employees/${missingId}`);

    expect(res.status).toBe(404);
    expect(res.data.StatusCode).toBe(404);
    expect(res.data.Errors).toEqual(["Employee not found."]);
  });
});
