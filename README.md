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

This repository does **not** implement HelpGrid account sign-in or a trusted production identity provider. The token endpoint below is a **development-only prototype**, not a production authentication system. It is bound to `127.0.0.1`, accepts at most two fixed server-configured development UIDs protected by HTTP Basic authentication, and refuses to start when `NODE_ENV=production` or its explicit development-auth switch is disabled. Do not expose it to a network or deploy it publicly.

The Basic-auth UID and password are compared with values held in the backend environment. The request body's UID must match that authenticated UID. This prevents unauthenticated requests and UID substitution in local testing, but a shared development password is not a substitute for verifying HelpGrid users' real sessions. Before deployment, replace this development guard with trusted application-session verification and derive the CometChat UID from that verified server-side identity.

### Configure and run

1. Copy `.env.example` to `.env`.
2. Replace every placeholder with local values:
   - `HELPGRID_DEV_UID` and `HELPGRID_DEV_PASSWORD`: the first existing CometChat test user and a unique random local password of at least 16 characters.
   - Optional `HELPGRID_DEV_UID_2` and `HELPGRID_DEV_PASSWORD_2`: a second, distinct existing CometChat test user and a different unique local password of at least 16 characters. Configure both or neither. The endpoint supports at most these two fixed identities; it never issues tokens for arbitrary UIDs.
   - `COMETCHAT_APP_ID`, `COMETCHAT_REGION` (`us`, `eu`, or `in`), and `COMETCHAT_REST_API_KEY`: values for your CometChat application. The REST API key is privileged and must remain in the backend `.env`; never use a `VITE_` variable for it.
   - Both CometChat users must already exist in the same CometChat app. The local HelpGrid passwords are only for the development endpoint; they are not CometChat account passwords.
3. Start the API in one terminal:

   ```sh
   npm run server:dev
   ```

   The server listens only on `http://127.0.0.1:3001` and logs the number of configured development users, never their UIDs or passwords. It reads `.env` only at startup; restart it after changing either user's configuration.
4. To run the React prototype, start Vite separately with `npm run dev`. Vite proxies `/api` requests to the loopback backend.

The endpoint accepts exactly `{"uid":"your_local_dev_uid"}` at `POST /api/cometchat/token`, with the configured UID/password sent using HTTP Basic authentication. A successful response has the shape `{"uid":"verified-user-uid","authToken":"generated-token"}`. Missing/invalid JSON or a malformed UID returns 400; missing credentials or a UID that differs from the authenticated identity returns 401; CometChat/network/configuration failures return a generic 500 without upstream details or secrets.

If a second login gets 401, confirm both `HELPGRID_DEV_UID_2` and `HELPGRID_DEV_PASSWORD_2` are set to non-placeholder values in `.env`, and restart the backend. A 401 means the supplied pair was not accepted by this local allowlist; the CometChat REST endpoint was not called.

The backend uses CometChat's documented create-auth-token REST API, `POST https://{appId}.api-{region}.cometchat.io/v3/users/{uid}/auth_tokens`, with the REST API key in the `apiKey` header. See the [official CometChat API reference](https://api-explorer.com/reference/create-authtoken). A token request has previously succeeded with the local CometChat configuration; this does not verify the UI Kit login or actual message delivery.

### Incident chat

The request detail chat uses the official CometChat JavaScript SDK and React UI Kit. The app reads only the public App ID and region from `GET /api/cometchat/config`, asks for a configured local UID/password, obtains an auth token through the backend, and logs in with that token. The CometChat REST API key remains in the backend `.env`; local passwords are only held in form state while connecting and are not stored by HelpGrid.

Each request maps deterministically to a private CometChat group GUID (`helpgrid_` plus its normalized request ID). On first connect, the signed-in user creates the private group and adds the entered existing neighbor as a participant. Later connections require the current user to already be a CometChat group member. Adding a missing participant requires the current user to be a group admin or moderator; the UI verifies group type and membership through the SDK before rendering the official group message header/list/composer. CometChat enforces message access using private-group membership. No sample messages are inserted.

For a two-user local test, configure both fixed development UID/password pairs in `.env`, start the backend, and open the app in two separate browser profiles. In profile A, sign in with user 1, use the target request ID, and enter user 2's CometChat UID as the neighbor; this creates the private room and adds user 2. In profile B, open any request's chat, replace the Request ID field with the same target request ID, sign in with user 2's development credentials, and enter user 1's UID as the neighbor. Both identities must already exist in the same CometChat app. The second profile's request board may differ because requests are browser-local; the explicit Request ID field lets it address the same private group without claiming that request data is shared. A member who is not an admin cannot add new participants; ask a group admin to do that first.

This is still a development-only authentication prototype, not production identity or authorization for who may initiate a request chat. The API is loopback-only, refuses production mode, and accepts tokens only for the one or two configured identities. Never add arbitrary-UID token issuance or deploy this Basic-auth flow.

Requests themselves remain browser-local. A request created in one browser is not synced to another browser, so its incident room cannot be discovered there automatically. For shared incidents, production needs a trusted user identity service, server-backed request records, and authorized room membership management.

### Verify locally

Run the frontend matching/persistence tests and backend API tests:

```sh
npm test
```

The tests cover request creation/status persistence across a simulated reload, request merging, matching reasons, per-request group GUIDs, token endpoint authentication for both configured development identities, public config, and sanitized upstream failures. Backend tests mock CometChat's REST API; they do not claim live chat was verified.

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

### Manual two-user and persistence checks

1. Confirm both users exist in the same CometChat app. Set `HELPGRID_DEV_UID` / `HELPGRID_DEV_PASSWORD` for user 1 and `HELPGRID_DEV_UID_2` / `HELPGRID_DEV_PASSWORD_2` for user 2 in the ignored `.env`. Use two different random local passwords; rotate any password that has been exposed. Do not paste credentials or auth tokens into chat or commit them.
2. Start `npm run server:dev` and `npm run dev` in separate terminals if the existing servers are not already running. The backend must be started again after changing `.env`.
3. In normal browser profile A, open a request chat, keep its request ID, sign in as user 1, and enter user 2's CometChat UID. Connect and check that the group is marked private and the current user is a member.
4. In a separate browser profile B, open any request chat, enter the same Request ID, sign in as user 2 with the second local development password, and set the neighbor UID to user 1. If the group already exists, user 2 must have been added by the first user/admin.
5. Send a unique test message from A, confirm it appears in B without a page refresh, then reply from B and confirm it appears in A. Check the browser console and local backend terminal for errors. If either account is not a group member, ask an admin to add it rather than making the room public.
6. Separately create a request in profile A, move it to another status, and refresh A. It should retain its status in that browser. Profile B will not see the same request or status because request data is stored only in each browser's local storage.

## Prototype features

- Community overview with request counts, search, status filters, and a responsive request list.
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
- No GitHub remote, deployment, or production user-authentication service is configured by this starter.
