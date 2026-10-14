import { useState } from 'react'
import { CometChat } from '@cometchat/chat-sdk-javascript'
import {
  CometChatMessageComposer,
  CometChatMessageHeader,
  CometChatMessageList,
  CometChatProvider,
  CometChatUIKit,
  UIKitSettingsBuilder,
} from '@cometchat/chat-uikit-react'
import '@cometchat/chat-uikit-react/styles'
import { incidentGroupGuid } from './requests.js'

let initialization
let initializedConfig

function basicAuthorization(uid, password) {
  const bytes = new TextEncoder().encode(`${uid}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

async function initializeCometChat(config) {
  if (CometChatUIKit.isInitialized()) {
    const settings = CometChatUIKit.getSettings()
    if (settings?.appId && settings.appId !== config.appId) {
      throw new Error('CometChat is already initialized for a different app. Reload the page to switch apps.')
    }
    return
  }

  if (!initialization) {
    initializedConfig = config
    const settings = new UIKitSettingsBuilder()
      .setAppId(config.appId)
      .setRegion(config.region)
      .build()
    initialization = CometChatUIKit.init(settings).catch((error) => {
      initialization = null
      initializedConfig = null
      throw error
    })
  } else if (
    initializedConfig?.appId !== config.appId
    || initializedConfig?.region !== config.region
  ) {
    throw new Error('CometChat initialization is already in progress for a different app.')
  }

  await initialization
}

async function authenticate(uid, password) {
  const configResponse = await fetch('/api/cometchat/config', { cache: 'no-store' })
  if (!configResponse.ok) throw new Error('The local HelpGrid API is unavailable. Start it with npm run server:dev.')
  const config = await configResponse.json()
  if (
    typeof config.appId !== 'string'
    || !config.appId
    || !['us', 'eu', 'in'].includes(config.region)
  ) {
    throw new Error('The local API did not return valid public CometChat app settings.')
  }

  await initializeCometChat(config)
  const tokenResponse = await fetch('/api/cometchat/token', {
    method: 'POST',
    headers: {
      Authorization: basicAuthorization(uid, password),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uid }),
    cache: 'no-store',
  })
  if (!tokenResponse.ok) {
    if (tokenResponse.status === 401) {
      throw new Error('These development credentials were not accepted by the local token API.')
    }
    throw new Error('The local token API could not authenticate with CometChat.')
  }

  const tokenData = await tokenResponse.json()
  if (tokenData.uid !== uid || typeof tokenData.authToken !== 'string' || !tokenData.authToken) {
    throw new Error('The local token API returned an invalid CometChat auth token.')
  }

  const currentUser = await CometChat.getLoggedinUser()
  if (currentUser && currentUser.getUid() !== uid) {
    await CometChatUIKit.logout()
  }
  if (!currentUser || currentUser.getUid() !== uid) {
    await CometChatUIKit.loginWithAuthToken(tokenData.authToken)
  }
}

async function getOrCreateIncidentGroup(request) {
  const guid = incidentGroupGuid(request.id)
  let group
  try {
    group = await CometChat.getGroup(guid)
  } catch {
    try {
      group = await CometChat.createGroup(new CometChat.Group(
        guid,
        request.title.slice(0, 100),
        CometChat.GROUP_TYPE.PRIVATE,
      ))
    } catch {
      try {
        group = await CometChat.getGroup(guid)
      } catch {
        throw new Error('Could not open this private incident room. Check your CometChat user and group settings.')
      }
    }
  }

  if (!group.getHasJoined()) {
    throw new Error('You are not a member of this private incident room. Ask a CometChat group administrator to add your user.')
  }
  return group
}

function describeError(error) {
  if (error instanceof Error && error.message) return error.message
  return 'CometChat could not connect. Check the app configuration and try again.'
}

export default function IncidentChat({ request }) {
  const [uid, setUid] = useState('')
  const [password, setPassword] = useState('')
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function connect(event) {
    event.preventDefault()
    setError('')
    if (!uid.trim() || !password) {
      setError('Enter your CometChat UID and the local development password.')
      return
    }

    setLoading(true)
    try {
      const userUid = uid.trim()
      await authenticate(userUid, password)
      const incidentGroup = await getOrCreateIncidentGroup(request)
      setGroup(incidentGroup)
      setUid(userUid)
      setPassword('')
    } catch (connectionError) {
      setError(describeError(connectionError))
    } finally {
      setLoading(false)
    }
  }

  async function disconnect() {
    setError('')
    try {
      await CometChatUIKit.logout()
      setGroup(null)
      setUid('')
    } catch {
      setError('Could not sign out from CometChat. Reload this page and try again.')
    }
  }

  if (group) {
    return (
      <div className="incident-chat">
        <div className="incident-chat-account">
          <span>Connected as {uid}</span>
          <button type="button" className="text-button" onClick={disconnect}>Sign out</button>
        </div>
        <p className="incident-chat-note">Private CometChat room for this request. Only current group members can read or send messages.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <CometChatProvider>
          <div className="incident-chat-view">
            <CometChatMessageHeader
              group={group}
              hideBackButton
              hideVoiceCallButton
              hideVideoCallButton
              showSearchOption={false}
            />
            <CometChatMessageList group={group} />
            <CometChatMessageComposer group={group} />
          </div>
        </CometChatProvider>
      </div>
    )
  }

  return (
    <div className="chat-setup">
      <span className="chat-setup-icon">▤</span>
      <h3>Connect to this incident’s chat</h3>
      <p>Uses the official CometChat UI Kit and a server-issued auth token. Your password is sent only to the local development API and is not saved by HelpGrid.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <form className="chat-auth-form" onSubmit={connect}>
        <label>
          CometChat UID
          <input
            autoComplete="username"
            maxLength="100"
            value={uid}
            onChange={(event) => setUid(event.target.value)}
            placeholder="Your configured development UID"
          />
        </label>
        <label>
          Local development password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password configured in the backend .env"
          />
        </label>
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? 'Connecting…' : 'Connect to chat'}
        </button>
      </form>
      <p className="chat-safety">This local backend admits only its configured development UID. Private room members must already exist in CometChat and be added by a room administrator. Do not deploy this development login flow.</p>
    </div>
  )
}
