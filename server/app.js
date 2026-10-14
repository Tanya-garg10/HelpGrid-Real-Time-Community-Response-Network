import express from 'express'
import { timingSafeEqual } from 'node:crypto'

const UID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function authenticatedUid(authorization, devUsers) {
  if (typeof authorization !== 'string') return null
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization)
  if (!match) return null

  const encodedCredentials = match[1]
  const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf8')
  if (Buffer.from(decodedCredentials, 'utf8').toString('base64') !== encodedCredentials) return null

  const separator = decodedCredentials.indexOf(':')
  if (separator < 1) return null

  const uid = decodedCredentials.slice(0, separator)
  const password = decodedCredentials.slice(separator + 1)
  const identity = devUsers.find((candidate) => constantTimeEqual(uid, candidate.uid))
  if (!identity || !constantTimeEqual(password, identity.password)) return null
  return identity.uid
}

export function createApp({
  appId,
  region,
  restApiKey,
  devUid,
  devPassword,
  devUsers = [{ uid: devUid, password: devPassword }],
  fetchImpl = globalThis.fetch,
}) {
  if (!appId || !restApiKey || !Array.isArray(devUsers) || !devUsers.length || typeof fetchImpl !== 'function') {
    throw new Error('CometChat and development-auth configuration is incomplete.')
  }
  if (!['us', 'eu', 'in'].includes(region)) {
    throw new Error('COMETCHAT_REGION must be us, eu, or in.')
  }
  if (
    devUsers.length > 2
    || devUsers.some((identity) => (
      !identity
      || typeof identity.uid !== 'string'
      || !UID_PATTERN.test(identity.uid)
      || typeof identity.password !== 'string'
      || identity.password.length < 16
    ))
    || new Set(devUsers.map((identity) => identity.uid)).size !== devUsers.length
  ) {
    throw new Error('Development auth requires one or two distinct valid UIDs and passwords of at least 16 characters.')
  }

  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '2kb', strict: true }))

  app.get('/api/cometchat/config', (_request, response) => {
    response.set('Cache-Control', 'no-store')
    return response.status(200).json({ appId, region })
  })

  app.post('/api/cometchat/token', async (request, response) => {
    const verifiedUid = authenticatedUid(request.get('authorization'), devUsers)
    if (!verifiedUid) {
      return response.status(401).json({ error: 'Authentication required.' })
    }

    const body = request.body
    if (
      !body
      || typeof body !== 'object'
      || Array.isArray(body)
      || Object.keys(body).length !== 1
      || typeof body.uid !== 'string'
      || !UID_PATTERN.test(body.uid)
    ) {
      return response.status(400).json({ error: 'Request body must contain only a valid uid.' })
    }

    if (!constantTimeEqual(body.uid, verifiedUid)) {
      return response.status(401).json({ error: 'Authenticated user does not match the requested UID.' })
    }

    const url = `https://${appId}.api-${region}.cometchat.io/v3/users/${encodeURIComponent(verifiedUid)}/auth_tokens`
    let upstreamResponse
    try {
      upstreamResponse = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          appId,
          apiKey: restApiKey,
        },
        body: JSON.stringify({}),
      })
    } catch {
      console.error('CometChat auth-token request failed before receiving a response.')
      return response.status(500).json({ error: 'Unable to authenticate with CometChat.' })
    }

    if (!upstreamResponse.ok) {
      console.error(`CometChat auth-token request failed with HTTP ${upstreamResponse.status}.`)
      return response.status(500).json({ error: 'Unable to authenticate with CometChat.' })
    }

    let tokenResponse
    try {
      tokenResponse = await upstreamResponse.json()
    } catch {
      console.error('CometChat auth-token response was not valid JSON.')
      return response.status(500).json({ error: 'Unable to authenticate with CometChat.' })
    }

    const authToken = tokenResponse?.data?.authToken
    const returnedUid = tokenResponse?.data?.uid
    if (typeof authToken !== 'string' || !authToken || returnedUid !== verifiedUid) {
      console.error('CometChat auth-token response did not match the authenticated user.')
      return response.status(500).json({ error: 'Unable to authenticate with CometChat.' })
    }

    return response.status(200).json({ uid: verifiedUid, authToken })
  })

  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error)
    if (error instanceof SyntaxError || error?.type === 'entity.too.large') {
      return response.status(400).json({ error: 'Request must be valid JSON under 2 KB.' })
    }
    console.error('Unhandled API request error.')
    return response.status(500).json({ error: 'Internal server error.' })
  })

  return app
}
