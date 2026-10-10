/**
 * Use Case #1: Create Employee Record — tests
 *
 * Encodes the four Given/When/Then scenarios from 00-use-case.md against the
 * EmployeeCatalogMCPFinal `POST /employees` endpoint.
 *
 * Dual-mode (per the project's makeClient() convention):
 *   - When OUTSYSTEMS_BASE_URL is set, tests hit the LIVE tenant.
 *   - When it is unset (e.g. CI), fetch is mocked so the suite still passes.
 *
 * The live run performed during the build (see RUN-LOG.md) confirmed all four
 * scenarios against the real tenant; the mock responses below mirror the exact
 * live payloads so offline runs assert the same contract.
 */
import { afterEach, describe, expect, it } from "vitest";
import { OutSystemsClient } from "../src/client.js";

const LIVE_BASE_URL = process.env.OUTSYSTEMS_BASE_URL;
const isLive = Boolean(LIVE_BASE_URL);

/** Response body shape for POST /employees (success + custom error bodies). */
interface CreateEmployeeResponse {
  Id?: number;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  Department?: string;
  JobTitle?: string;
  Errors?: string[];
  StatusCode?: number;
}

/** ODC framework validation-error envelope (empty/malformed body). */
interface FrameworkValidationError {
  errors?: { ValidationErrors?: string[] };
  title?: string;
  status?: number;
  traceId?: string;
}

/**
 * Build a client. When live, returns a real client against the tenant.
 * When offline, installs a per-test fetch mock and returns a client bound to it.
 */
function makeClient(): OutSystemsClient {
  if (isLive) {
    return new OutSystemsClient(LIVE_BASE_URL);
  }
  return new OutSystemsClient("https://mock.local/EmployeeCatalogMCPFinal/rest/EmployeeAPI");
}

/** Unique email per invocation so live re-runs never collide with prior data. */
function uniqueEmail(prefix = "uc1"): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Helper to install a mocked fetch that returns a given status + JSON body. */
function mockFetchOnce(status: number, body: unknown, contentType = "application/json"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": contentType },
      })
    )
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /employees — Use Case #1: Create Employee Record", () => {
  // ── Scenario 1 ──────────────────────────────────────────────────────────
  it("test_given_valid_payload_when_post_employees_then_returns_201_with_generated_id_and_echoed_fields", async () => {
    const email = uniqueEmail("happy");
    const payload = {
      FirstName: "Ada",
      LastName: "Lovelace",
      Email: email,
      Department: "Engineering",
      JobTitle: "Analyst",
    };

    if (!isLive) {
      mockFetchOnce(201, {
        Id: 42,
        FirstName: payload.FirstName,
        LastName: payload.LastName,
        Email: payload.Email,
        Department: payload.Department,
        JobTitle: payload.JobTitle,
      });
    }

    const client = makeClient();
    const res = await client.post<CreateEmployeeResponse>("/employees", payload);

    expect(res.status).toBe(201);
    // Generated Id is a Long Integer > 0.
    expect(typeof res.data.Id).toBe("number");
    expect(res.data.Id as number).toBeGreaterThan(0);
    // Echoed fields.
    expect(res.data.FirstName).toBe(payload.FirstName);
    expect(res.data.LastName).toBe(payload.LastName);
    expect(res.data.Email).toBe(payload.Email);
    expect(res.data.Department).toBe(payload.Department);
    expect(res.data.JobTitle).toBe(payload.JobTitle);
  });

  // ── Scenario 2 ──────────────────────────────────────────────────────────
  it("test_given_existing_email_when_post_employees_again_then_returns_409_referencing_duplicate", async () => {
    const email = uniqueEmail("dup");
    const payload = {
      FirstName: "Grace",
      LastName: "Hopper",
      Email: email,
      Department: "Engineering",
      JobTitle: "Rear Admiral",
    };

    const client = makeClient();

    if (isLive) {
      // First create must succeed, so the second collides.
      const first = await client.post<CreateEmployeeResponse>("/employees", payload);
      expect(first.status).toBe(201);
    } else {
      mockFetchOnce(409, {
        Errors: [`An employee with email '${email}' already exists.`],
        StatusCode: 409,
      });
    }

    const res = await client.post<CreateEmployeeResponse>("/employees", payload);

    expect(res.status).toBe(409);
    expect(res.data.StatusCode).toBe(409);
    expect(Array.isArray(res.data.Errors)).toBe(true);
    expect(res.data.Errors?.length).toBeGreaterThan(0);
    // Error message references the duplicate email.
    expect(res.data.Errors?.[0]).toContain(email);
    expect(res.data.Errors?.[0]?.toLowerCase()).toContain("already exists");
  });

  // ── Scenario 3 ──────────────────────────────────────────────────────────
  it("test_given_payload_missing_email_when_post_employees_then_returns_400_with_errors_and_statuscode", async () => {
    // Email omitted entirely.
    const payload = {
      FirstName: "No",
      LastName: "Email",
      Department: "Engineering",
    };

    if (!isLive) {
      mockFetchOnce(400, { Errors: ["Email is required."], StatusCode: 400 });
    }

    const client = makeClient();
    const res = await client.post<CreateEmployeeResponse>("/employees", payload);

    expect(res.status).toBe(400);
    expect(res.data.StatusCode).toBe(400);
    expect(Array.isArray(res.data.Errors)).toBe(true);
    // An Errors entry names the missing field (Email).
    expect(res.data.Errors?.some((e) => e.toLowerCase().includes("email"))).toBe(true);
  });

  // ── Scenario 4 ──────────────────────────────────────────────────────────
  it("test_given_no_request_body_when_post_employees_then_returns_400_framework_validation_shape", async () => {
    if (!isLive) {
      // ODC emits application/problem+json for this framework-level error.
      mockFetchOnce(
        400,
        {
          errors: { ValidationErrors: ["The request body is missing."] },
          title: "One or more validation errors occurred.",
          status: 400,
        },
        "application/problem+json"
      );
    }

    const client = makeClient();
    // Send with no body at all.
    const res = await client.request<FrameworkValidationError>("POST", "/employees");

    expect(res.status).toBe(400);
    // Framework shape differs from Scenario 3's Errors/StatusCode body.
    expect(res.data.errors?.ValidationErrors).toBeDefined();
    expect(res.data.errors?.ValidationErrors).toContain("The request body is missing.");
  });
});
