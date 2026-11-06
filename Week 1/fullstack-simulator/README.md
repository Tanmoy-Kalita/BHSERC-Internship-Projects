# StackLab — Interactive Full-Stack Development Simulator

StackLab is a browser-only learning project that demonstrates how a typical full-stack web application works. It contains three independent HTML pages built with HTML, CSS and vanilla JavaScript. No package installation, external service or real backend is required.

## Pages

| File | What it teaches | Main interactions |
|---|---|---|
| `index.html` | 2D application architecture and request/response flow | Drag nodes, inspect components, choose an HTTP method and simulated response status, start/pause/resume/reset a request, change animation speed and inspect payloads/status codes |
| `api-playground.html` | REST APIs and database CRUD | Send GET/POST/PUT/DELETE requests, edit JSON, test validation/auth/not-found/server errors, search/filter/sort records, edit/delete table rows and reuse request history |
| `workflow.html` | End-to-end software development lifecycle | Navigate eight stages, check tasks, complete stages when dependencies are met, inject/debug a sample bug, run frontend/backend tests and simulate deployment/rollback |

## Run locally

1. Download or clone this folder.
2. Open `index.html` in a modern browser (Chrome, Edge, Firefox or Safari).
3. Use the navigation on the left or the mobile navigation to open the other pages.

A local static server is optional. For example, from this folder run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## How the simulation works

### Architecture simulator

The architecture page animates a request through the client, frontend, API gateway, authentication service, business logic, database and response handler. The request method controls the example endpoint, sample body and response. The moving packet is a teaching visualization; it is not a live network request. Node positions, selected method, simulated response status and animation speed are saved in `localStorage`.

### API and database playground

The API page contains a separate `MockBackend` JavaScript object that owns routing, validation, authorization checks and CRUD operations. UI rendering is kept outside that object. The sample user records are stored in browser `localStorage` under `stacklab-api-records-v1`; request history (including the request body and auth toggle for replay) uses `stacklab-api-history-v1`.

Useful examples:

```text
GET     /api/users
GET     /api/users/2
POST    /api/users
PUT     /api/users/2
DELETE  /api/users/2
```

- Uncheck **Include valid bearer token** to receive `401 Unauthorized`.
- Use a malformed JSON body or invalid name/email to receive `400 Bad Request`.
- Request a missing user (for example `/api/users/999`) to receive `404 Not Found`.
- Request `/api/fail` to intentionally simulate `500 Internal Server Error`.
- Successful create requests return `201 Created`; successful reads/updates/deletes return `200 OK`.

The service is intentionally in-memory/browser-local. It does not connect to PostgreSQL or MongoDB and should not be used for real user data.

### Development workflow

The workflow page models prerequisites between stages. Frontend and backend work can proceed after UI/UX design; API integration depends on both, and later stages follow the integration/testing sequence. Check off every task and satisfy dependencies before marking a stage complete. The test lab can inject a controlled frontend bug, run the simulated frontend/backend checks, and apply a fix. Passing tests are required to complete the testing stage; deployment is required to complete the final stage. The page includes a full progress reset. Deployment is a local status simulation, not a real hosting action.

## Browser storage and reset

The project uses `localStorage` so the sample database, architecture settings, workflow checklists and request history survive refreshes when browser storage is available. In restricted preview contexts, the pages fall back to in-memory session state rather than failing to initialize. Use the page-level reset controls to restore sample data or reset a simulation. To clear all StackLab state manually, open DevTools → Application/Storage → Local Storage and remove keys beginning with `stacklab-`.

## Suggested learning path

1. Start on **Architecture** and run a GET request. Watch the request move into the backend and the response return to the client.
2. Open **API Playground**. Create a user with POST, retrieve it with GET, edit it with PUT and remove it with DELETE.
3. Trigger 400, 401, 404 and 500 responses to see how error handling differs from a successful request.
4. Open **Development Workflow**. Complete the stages in dependency order, introduce the sample bug, run tests, apply the fix and deploy the simulated build.

## Technology

- HTML5
- CSS (responsive layouts, CSS Grid/Flexbox, transitions)
- Vanilla JavaScript (simulation logic, DOM updates, localStorage)
- SVG (2D architecture connections and animated request packet)

## Testing

The three pages were exercised in three browser-testing rounds. The detailed result is in [`TEST-REPORT.md`](TEST-REPORT.md), with machine-readable checks in [`QA-RESULTS.json`](QA-RESULTS.json).

## Version

**1.0.0** — standalone educational prototype.
