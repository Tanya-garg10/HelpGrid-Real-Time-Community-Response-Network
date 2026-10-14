# HelpGrid — Real-Time Community Response Network

HelpGrid is a responsive community-support prototype built with React and Vite. Neighbors can post non-emergency requests, browse a sample volunteer directory, see explainable RelayMatch suggestions, and move a request through its lifecycle.

## Run locally

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). To verify a production build, run:

```sh
npm run build
```

## Development CometChat token API

This repository does **not** implement HelpGrid account sign-in or a trusted production identity provider. The token endpoint below is a **development-only prototype**, not a production authentication system. It is bound to `127.0.0.1`, accepts one server-configured development UID protected by HTTP Basic authentication, and refuses to start when `NODE_ENV=production` or its explicit development-auth switch is disabled. Do not expose it to a network or deploy it publicly.

The Basic-auth UID and password are compared with values held in the backend environment. The request body's UID must match that authenticated UID. This prevents unauthenticated requests and UID substitution in local testing, but a shared development password is not a substitute for verifying HelpGrid users' real sessions. Before deployment, replace this development guard with trusted application-session verification and derive the CometChat UID from that verified server-side identity.

### Configure and run

1. Copy `.env.example` to `.env`.
2. Replace every placeholder with local values:
   - `HELPGRID_DEV_UID` and `HELPGRID_DEV_PASSWORD`: one local test identity and a unique random password of at least 16 characters.
   - `COMETCHAT_APP_ID`, `COMETCHAT_REGION` (`us`, `eu`, or `in`), and `COMETCHAT_REST_API_KEY`: values for your CometChat application. The REST API key is privileged and must remain in the backend `.env`; never use a `VITE_` variable for it.
   - The CometChat user with the configured UID must already exist in the CometChat app.
3. Start the API in one terminal:

   ```sh
   npm run server:dev
   ```

   The server listens only on `http://127.0.0.1:3001`.
4. To run the React prototype, start Vite separately with `npm run dev`. Vite proxies `/api` requests to the loopback backend.

The endpoint accepts exactly `{"uid":"your_local_dev_uid"}` at `POST /api/cometchat/token`, with the configured UID/password sent using HTTP Basic authentication. A successful response has the shape `{"uid":"verified-user-uid","authToken":"generated-token"}`. Missing/invalid JSON or a malformed UID returns 400; missing credentials or a UID that differs from the authenticated identity returns 401; CometChat/network/configuration failures return a generic 500 without upstream details or secrets.

The backend uses CometChat's documented create-auth-token REST API, `POST https://{appId}.api-{region}.cometchat.io/v3/users/{uid}/auth_tokens`, with the REST API key in the `apiKey` header. See the [official CometChat API reference](https://api-explorer.com/reference/create-authtoken). A token request has previously succeeded with the local CometChat configuration; this does not verify the UI Kit login, private-room membership, or actual message delivery.

### Incident chat

The request detail chat uses the official CometChat JavaScript SDK and React UI Kit. The app reads only the public App ID and region from `GET /api/cometchat/config`, asks for the configured local UID/password when a user connects, obtains an auth token through the backend, and logs in with that token. The password is held only in the form state for that request and is not stored by HelpGrid. The CometChat REST API key remains in the backend `.env`.

Opening a request creates or opens a **private CometChat group** with a stable GUID derived from that request's ID. Messages are actual CometChat messages; the UI does not insert sample messages. Only existing group members can read or write. The development backend issues tokens for only its single configured UID. To try another account, change the local backend UID/password to a real CometChat user, restart the backend, and add that user to the private room through CometChat's supported member-management tools. This is a manual development test flow, not production identity or group-membership management.

Requests themselves remain browser-local. A request created in one browser is not synced to another browser, so its incident room cannot be discovered there automatically. For shared incidents, production needs a trusted user identity service, server-backed request records, and authorized room membership management.

### Verify locally

Run the frontend matching/persistence tests and backend API tests:

```sh
npm test
```

The tests cover request persistence/merging, matching reasons, incident group IDs, token endpoint authentication, request validation, public config, and sanitized upstream failures. Backend tests mock CometChat's REST API; they do not claim live chat was verified.

For a live local check, after configuring `.env` and starting the server, send a request using the same local development UID/password. In PowerShell:

```powershell
$devUid = "your_local_dev_uid"
$devPassword = "the_local_password_from_your_ignored_env_file"
$basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${devUid}:$devPassword"))
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:3001/api/cometchat/token" `
  -Headers @{ Authorization = "Basic $basic" } `
  -ContentType "application/json" `
  -Body (@{ uid = $devUid } | ConvertTo-Json)
```

The returned auth token is a credential; do not paste it into chat, commit it, or publish it.

## Prototype features

- Community overview with request counts, search, status filters, and a responsive request list.
- Request form with required-field validation, urgency, skills, and general-area-only location guidance.
- Request details with status controls for `OPEN`, `CLAIMED`, `RESPONDING`, and `RESOLVED`.
- Explainable RelayMatch suggestions based on sample volunteer skills, availability, and neighborhood. These suggestions are illustrative and do not contact or notify real volunteers.
- Sample volunteer directory.
- User-created requests and request status changes saved in this browser's local storage. No server, account, or cross-device sync is provided.
- CometChat UI Kit integration for authenticated private incident rooms. Chat needs valid CometChat configuration, an existing CometChat user, and private-group membership.

## Limitations and safety

- All included volunteer profiles and initial requests are sample data. RelayMatch is a local prototype heuristic, not an AI service or live matching network.
- Browser storage is local to this browser and device. Clearing site data removes locally created requests.
- This dev-only CometChat flow has not been verified with two real users. Local API token generation may succeed, but that alone does not verify group membership or message delivery.
- The development token backend supports one configured user at a time and is not safe to expose publicly.
- HelpGrid is not an emergency service and does not dispatch responders. For emergencies, contact local emergency services.
- Share only a general neighborhood; do not post a home address or sensitive personal information.
- No GitHub remote, deployment, or production user-authentication service is configured by this starter.
