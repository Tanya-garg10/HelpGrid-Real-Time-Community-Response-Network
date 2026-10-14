# HelpGrid — Real-Time Community Response Network

HelpGrid is a responsive community-support prototype built with React, Vite, Express, and the CometChat JavaScript UI Kit. It includes a community dashboard, local request lifecycle, explainable sample volunteer suggestions, and optional private CometChat group chat per request.

The community selector filters the sample requests and volunteer directory by neighborhood. This is prototype data only: communities, requests, and volunteers are not synced to a shared service.

## Run locally

Requirements: Node.js and npm.

Install dependencies and create a local environment file:

```powershell
npm install
Copy-Item .env.example .env
```

Fill in the CometChat and development-user values described below. Run the frontend and backend in separate terminals:

```powershell
npm run server:dev
```

```powershell
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). The backend listens only on `http://127.0.0.1:3001`. To verify a production build, run:

```powershell
npm run build
```

## Development CometChat token API

This repository does **not** implement HelpGrid account sign-in or a trusted production identity provider. The token endpoint below is a **development-only prototype**, not a production authentication system. It is bound to `127.0.0.1`, accepts at most two fixed server-configured development UIDs protected by HTTP Basic authentication, and refuses to start when `NODE_ENV=production` or its explicit development-auth switch is disabled. Do not expose it to a network or deploy it publicly.

The Basic-auth UID and password are checked against the configured development-user allowlist. The request body's UID must match the authenticated UID. This supports local testing only; it is not a substitute for verifying HelpGrid user sessions. Before deployment, use trusted application-session verification and derive the CometChat UID from that verified server-side identity.

### Configure and run

1. Copy `.env.example` to `.env` if you have not already.
2. Replace each placeholder with local values:
   - `HELPGRID_DEV_UID` and `HELPGRID_DEV_PASSWORD`: the first existing CometChat test user and a unique random local password of at least 16 characters.
   - Optional `HELPGRID_DEV_UID_2` and `HELPGRID_DEV_PASSWORD_2`: a second, distinct existing CometChat test user and a different unique local password of at least 16 characters. Configure both or neither. The endpoint supports at most these two fixed identities; it never issues tokens for arbitrary UIDs.
   - `COMETCHAT_APP_ID`, `COMETCHAT_REGION` (`us`, `eu`, or `in`), and `COMETCHAT_REST_API_KEY`: values for your CometChat application. The REST API key is privileged and must remain in the backend `.env`; never use a `VITE_` variable for it.
   - Both CometChat users must already exist in the same CometChat app. Local HelpGrid passwords are only for the development endpoint; they are not CometChat account passwords.
3. Start the API in one terminal:

   ```powershell
   npm run server:dev
   ```

   The server listens only on `http://127.0.0.1:3001` and logs the number of configured development users, never their UIDs or passwords. It reads `.env` only at startup; restart it after changing either user's configuration.
4. Start Vite separately with `npm run dev`. Vite proxies `/api` requests to the loopback backend.

The endpoint accepts exactly `{"uid":"your_local_dev_uid"}` at `POST /api/cometchat/token`, with the configured UID/password sent using HTTP Basic authentication. A successful response has the shape `{"uid":"verified-user-uid","authToken":"generated-token"}`. Missing/invalid JSON or a malformed UID returns 400; missing credentials or a UID that differs from the authenticated identity returns 401; CometChat/network/configuration failures return a generic 500 without upstream details or secrets.

If a second login gets 401, confirm both `HELPGRID_DEV_UID_2` and `HELPGRID_DEV_PASSWORD_2` are set to non-placeholder values in `.env`, and restart the backend. A 401 means the supplied pair was not accepted by this local allowlist; the CometChat REST endpoint was not called.

The backend uses CometChat's documented create-auth-token REST API, `POST https://{appId}.api-{region}.cometchat.io/v3/users/{uid}/auth_tokens`, with the REST API key in the `apiKey` header. See the [official CometChat API reference](https://api-explorer.com/reference/create-authtoken). A token request has previously succeeded with the local CometChat configuration; this does not verify the UI Kit login or actual message delivery.

### Incident chat

The request detail chat uses the official CometChat JavaScript SDK and React UI Kit. The app reads only the public App ID and region from `GET /api/cometchat/config`, asks for a configured local UID/password, obtains an auth token through the backend, and logs in with that token. The CometChat REST API key remains in the backend `.env`; local passwords are only held in form state while connecting and are not stored by HelpGrid.

Each request maps deterministically to a private CometChat group GUID (`helpgrid_` plus its normalized request ID). When a group does not exist, the signed-in user creates it and adds the entered existing neighbor as a participant. For an existing group, the UI checks its privacy and membership before showing chat. Only a group admin or moderator can add a missing participant; other users must ask a group admin to add them. CometChat enforces message access using private-group membership. No sample messages are inserted.

For a two-user local test, configure both fixed development UID/password pairs in `.env`, restart the backend, and open HelpGrid in two separate browser profiles. In profile A, sign in as user 1, keep the request ID, and enter user 2's UID; the creator adds user 2 to the private room. In profile B, open any request's chat, enter the same request ID, sign in as user 2, and enter user 1's UID. Both users must already exist in the same CometChat app. Requests remain browser-local, so the request ID must be entered in profile B. If an existing group does not include the other user, a group admin/moderator must add them.

This is still a development-only authentication prototype, not production identity or authorization for who may initiate a request chat. The API is loopback-only, refuses production mode, and accepts tokens only for the one or two configured identities. Never add arbitrary-UID token issuance or deploy this Basic-auth flow.

Requests themselves remain browser-local. A request created in one browser is not synced to another browser, so its incident room cannot be discovered there automatically. For shared incidents, production needs a trusted user identity service, server-backed request records, and authorized room membership management.

### Verify locally

Run the frontend matching/persistence tests and backend API tests:

```powershell
npm test
```

The tests cover request creation/status persistence across a simulated reload, request merging, matching reasons, per-request group GUIDs, token endpoint authentication for both configured development identities, public config, and sanitized upstream failures. Backend tests mock CometChat's REST API; they do not verify real chat delivery.

To run only the backend tests or lint:

```powershell
npm run test:server
npm run lint
```

### Manual two-user and persistence checks

1. Confirm both users exist in the same CometChat app. Set `HELPGRID_DEV_UID` / `HELPGRID_DEV_PASSWORD` for user 1 and `HELPGRID_DEV_UID_2` / `HELPGRID_DEV_PASSWORD_2` for user 2 in the ignored `.env`. Use two different random local passwords; rotate any password that has been exposed. Do not paste credentials or auth tokens into chat or commit them.
2. Start `npm run server:dev` and `npm run dev` in separate terminals if the existing servers are not already running. The backend must be started again after changing `.env`.
3. In normal browser profile A, open a request chat, keep its request ID, sign in as user 1, and enter user 2's CometChat UID. Connect and check that the group is marked private and the current user is a member.
4. In a separate browser profile B, open any request chat, enter the same Request ID, sign in as user 2 with the second local development password, and set the neighbor UID to user 1. If the group already exists, user 2 must have been added by the first user/admin.
5. Send a unique test message from A, confirm it appears in B without a page refresh, then reply from B and confirm it appears in A. Check the browser console and local backend terminal for errors. If either account is not a group member, ask an admin to add it rather than making the room public.
6. Separately create a request in profile A, move it to another status, and refresh A. It should retain its status in that browser. Profile B will not see the same request or status because request data is stored only in each browser's local storage.

## Prototype features

- Community overview with request counts, search, status filters, and a responsive request list.
- Community dropdown for Northside, Westside, Maple Heights, and all sample communities; selecting one filters requests and volunteer profiles by area.
- Request form with required-field validation, urgency, skills, and general-area-only location guidance.
- Request details with status controls for `OPEN`, `CLAIMED`, `RESPONDING`, and `RESOLVED`.
- Explainable RelayMatch suggestions based on sample volunteer skills, availability, and neighborhood. These suggestions are illustrative and do not contact or notify real volunteers.
- Sample volunteer directory.
- User-created requests and request status changes saved in this browser's local storage. No server, account, or cross-device sync is provided.
- CometChat UI Kit private group chat keyed by request ID. It requires valid CometChat configuration, existing users, and group membership. The dev token endpoint can authenticate up to two fixed server-configured identities.

## Limitations and safety

- All included volunteer profiles and initial requests are sample data. RelayMatch is a local prototype heuristic, not an AI service or live matching network.
- Browser storage is local to this browser and device. Clearing site data removes locally created requests.
- Two-user CometChat delivery still requires the manual test above; automated tests mock the token REST endpoint and do not verify live message delivery. The RelayMatch AI agent is not connected; matching is the local sample-data heuristic described above.
- The development token backend supports only the one or two configured local users and is not safe to expose publicly.
- HelpGrid is not an emergency service and does not dispatch responders. For emergencies, contact local emergency services.
- Share only a general neighborhood; do not post a home address or sensitive personal information.
- No public deployment, shared request database, or production user-authentication service is included.
