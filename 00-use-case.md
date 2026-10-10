# Project Context
- **Application**: Employee Catalog Service
- **Platform**: OutSystems (ODC / O11)
- **Harness / Test Tool**: Vitest (or BDDFramework via API triggers)
- **Test Command**: `npm test`
- **Architecture**: Service Actions / REST Endpoints over Core Entities

---

# Use Case Catalog

## Use Case #1: Create Employee Record
**Description**:
An HR user wants to create an employee record with FirstName, LastName, Department, and Email. The system must generate a unique identifier and reject any duplicate email addresses.

**Status**: Green (live-verified)
**Current Phase**: Green
**Last Phase Completed**: Green
**Last Updated**: 2026-10-10 13:11
**Test Count**: 4 tests (all 4 UC#1 scenarios)
**Test File**: `tests/create-employee.test.ts`
**Last Live Run**: 2026-10-10 13:11 — all 4 scenarios PASS against EmployeeCatalogMCPFinal (revision 2) on Development. S1 201, S2 409, S3 400 (Errors/StatusCode), S4 400 (framework ValidationErrors shape).

> Note: Move to Green only after a live run passes against the EmployeeCatalogMCPFinal app. A mock run (OUTSYSTEMS_BASE_URL unset) is not sufficient to claim Green on its own, because it exercises stubbed fetch, not the tenant.

### Scenarios (GWT)

**Scenario 1 — Happy path: create a valid employee**
```gherkin
Given a valid payload with FirstName, LastName, Department, and an Email that is unique to this test run
When POST /employees is called
Then the response status is 201
And the response body contains the generated Id (Long Integer, > 0)
And the response body echoes back FirstName, LastName, Department, and Email
```

**Scenario 2 — Duplicate email rejected**
```gherkin
Given an employee has just been created with a unique email for this test run
When POST /employees is called again with the same email
Then the response status is 409
And the response body contains an error message referencing the duplicate email
```

**Scenario 3 — Missing required field (e.g. Email omitted)**
```gherkin
Given a payload that omits the Email field
When POST /employees is called
Then the response status is 400
And the response body contains { "Errors": [...], "StatusCode": 400 } with an Errors entry naming the missing field
```

**Scenario 4 — Empty request body**
```gherkin
Given a request with no body
When POST /employees is called
Then the response status is 400
And the response body contains { "errors": { "ValidationErrors": ["The request body is missing."] } }
Note: this body is produced by the ODC framework before the action flow runs, so it differs from the Errors/StatusCode shape used by Scenario 3.
```

---

## Use Case #2: Filter Active Employees by Department
**Description**:
Retrieve all active employees belonging to a specific department, ignoring inactive staff.

**Status**: Green (live-verified)
**Current Phase**: Green
**Last Phase Completed**: Green
**Last Updated**: 2026-10-10 13:30
**Test Count**: 4 tests (all 4 UC#2 scenarios)
**Test File**: `tests/list-employees.test.ts`
**Last Live Run**: 2026-10-10 13:30 — all 4 scenarios PASS against EmployeeCatalogMCPFinal (revision 3). List returns active + TotalCount; department filter exact-match; no-match returns 200 with empty body ({}); pagination caps the page at PageSize while TotalCount reflects the full count.

> Backed by BRD §6.2 — `GET /employees` (ListEmployees). Returns `{ Employees: [...], TotalCount }`, filtered to `IsActive = True`, optional `Department` exact-match filter, pagination via `Page` (default 1) and `PageSize` (default 25).
>
> Note: Move to Green only after a live run passes against the EmployeeCatalogMCPFinal app.

### Scenarios (GWT)

**Scenario 1 — List returns only active employees**
```gherkin
Given at least one active employee exists
When GET /employees is called with no filters
Then the response status is 200
And the response body contains an "Employees" list and an integer "TotalCount"
And every returned employee is active (soft-deleted records are excluded)
```

**Scenario 2 — Filter by department returns only that department's active staff**
```gherkin
Given active employees exist in a department unique to this test run
When GET /employees is called with Department set to that department
Then the response status is 200
And every returned employee has Department equal to the requested department
And TotalCount equals the number of active employees in that department
```

**Scenario 3 — Department filter with no matches returns an empty list**
```gherkin
Given no active employee belongs to a department name that does not exist
When GET /employees is called with Department set to that non-existent department
Then the response status is 200
And the Employees list is empty
And TotalCount is 0
```

**Scenario 4 — Pagination limits the page size**
```gherkin
Given more active employees exist in a department than the requested PageSize
When GET /employees is called with that Department, Page = 1, and PageSize = 1
Then the response status is 200
And the Employees list contains exactly 1 record
And TotalCount reflects the full count of matching active employees (greater than 1), not just the page size
```

---

## Use Case #3: Get Employee by Id
**Description**:
Retrieve a single active employee record by its Id. Return 404 when the Id does not exist or the record is inactive (soft-deleted).

**Status**: Green (live-verified)
**Current Phase**: Green
**Last Phase Completed**: Green
**Last Updated**: 2026-10-10 13:30
**Test Count**: 2 tests (both UC#3 scenarios)
**Test File**: `tests/get-employee.test.ts`
**Last Live Run**: 2026-10-10 13:30 — both scenarios PASS against EmployeeCatalogMCPFinal (revision 3). Existing Id → 200 with matching fields (no Errors/StatusCode); unknown Id → 404 with {"Errors":["Employee not found."],"StatusCode":404}.

> Backed by BRD §6.3 — `GET /employees/{Id}` (GetEmployee). On a hit returns the six employee fields with HTTP 200 (Errors/StatusCode omitted). On a miss returns HTTP 404 with the custom body `{ "Errors": ["Employee not found."], "StatusCode": 404 }` (assigned, not raised).
>
> Note: Move to Green only after a live run passes against the EmployeeCatalogMCPFinal app.

### Scenarios (GWT)

**Scenario 1 — Get an existing active employee by Id**
```gherkin
Given an employee has just been created and its Id captured
When GET /employees/{Id} is called with that Id
Then the response status is 200
And the response body contains that Id and the matching FirstName, LastName, Email, Department
And the body does not include the Errors or StatusCode fields
```

**Scenario 2 — Get a non-existent Id returns 404**
```gherkin
Given an Id that does not correspond to any employee (e.g. a very large unused Id)
When GET /employees/{Id} is called with that Id
Then the response status is 404
And the response body contains { "Errors": ["Employee not found."], "StatusCode": 404 }
```