import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createApp } from './app.js'

const uid = 'helpgrid-dev-user'
const password = 'local-only-password-123456'
const restApiKey = 'placeholder-test-api-key'
const servers = []
const upstreamCalls = []

function authorizationHeader(userUid = uid, userPassword = password) {
  const credentials = Buffer.from(`${userUid}:${userPassword}`).toString('base64')
  return `Basic ${credentials}`
}

async function startTestServer(fetchImpl, devUsers) {
  const server = createApp({
    appId: 'test-app-id',
    region: 'eu',
    restApiKey,
    devUid: uid,
    devPassword: password,
    ...(devUsers ? { devUsers } : {}),
    fetchImpl,
  }).listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  return `http://127.0.0.1:${server.address().port}/api/cometchat/token`
}

function successfulCometChatFetch(url, options) {
  upstreamCalls.push({ url, options })
  return Promise.resolve(new Response(JSON.stringify({
    data: { uid, authToken: 'generated-test-token' },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

function userSpecificCometChatFetch(url, options) {
  upstreamCalls.push({ url, options })
  const matchedUid = /\/users\/([^/]+)\/auth_tokens$/.exec(url)?.[1]
  return Promise.resolve(new Response(JSON.stringify({
    data: { uid: matchedUid, authToken: `generated-${matchedUid}-token` },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

after(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })))
})

test('requires development identity authentication before calling CometChat', async () => {
  upstreamCalls.length = 0
  const endpoint = await startTestServer(successfulCometChatFetch)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  })

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'Authentication required.' })
  assert.equal(upstreamCalls.length, 0)
})

test('exposes only public CometChat app configuration', async () => {
  const endpoint = await startTestServer(successfulCometChatFetch)
  const response = await fetch(endpoint.replace('/api/cometchat/token', '/api/cometchat/config'))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { appId: 'test-app-id', region: 'eu' })
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('rejects malformed input and UIDs that do not match the authenticated user', async () => {
  const endpoint = await startTestServer(successfulCometChatFetch)
  const headers = { Authorization: authorizationHeader(), 'Content-Type': 'application/json' }

  const invalidBody = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({}) })
  assert.equal(invalidBody.status, 400)

  const extraFields = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ uid, admin: true }),
  })
  assert.equal(extraFields.status, 400)

  const mismatchedUid = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ uid: 'someone-else' }),
  })
  assert.equal(mismatchedUid.status, 401)
  assert.equal(upstreamCalls.length, 0)
})

test('creates a server-side CometChat token using the configured region and API key', async () => {
  upstreamCalls.length = 0
  const endpoint = await startTestServer(successfulCometChatFetch)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorizationHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uid }),
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { uid, authToken: 'generated-test-token' })
  assert.equal(upstreamCalls.length, 1)
  assert.equal(
    upstreamCalls[0].url,
    `https://test-app-id.api-eu.cometchat.io/v3/users/${uid}/auth_tokens`,
  )
  assert.equal(upstreamCalls[0].options.headers.apiKey, restApiKey)
  assert.equal(upstreamCalls[0].options.headers.appId, 'test-app-id')
  assert.equal(upstreamCalls[0].options.method, 'POST')
})

test('authenticates only the explicitly configured second development identity', async () => {
  const secondUid = 'helpgrid-second-user'
  const secondPassword = 'another-local-password-123456'
  const endpoint = await startTestServer(userSpecificCometChatFetch, [
    { uid, password },
    { uid: secondUid, password: secondPassword },
  ])
  const secondAuth = authorizationHeader(secondUid, secondPassword)

  const secondToken = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: secondAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: secondUid }),
  })
  assert.equal(secondToken.status, 200)
  assert.deepEqual(await secondToken.json(), {
    uid: secondUid,
    authToken: `generated-${secondUid}-token`,
  })
  assert.ok(upstreamCalls.at(-1).url.endsWith(`/users/${secondUid}/auth_tokens`))

  const uidSubstitution = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: secondAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  })
  assert.equal(uidSubstitution.status, 401)
})

test('rejects invalid multi-user development configuration', () => {
  assert.throws(() => createApp({
    appId: 'test-app-id',
    region: 'eu',
    restApiKey,
    devUsers: [
      { uid, password },
      { uid, password: 'another-local-password-123456' },
    ],
    fetchImpl: successfulCometChatFetch,
  }), /distinct valid UIDs/)
})

test('returns a sanitized 500 if the CometChat API rejects the request', async () => {
  const endpoint = await startTestServer(async () => new Response(
    JSON.stringify({ error: `rejected ${restApiKey}` }),
    { status: 403 },
  ))
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorizationHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uid }),
  })

  assert.equal(response.status, 500)
  const body = await response.text()
  assert.equal(body, JSON.stringify({ error: 'Unable to authenticate with CometChat.' }))
  assert.equal(body.includes(restApiKey), false)
})
