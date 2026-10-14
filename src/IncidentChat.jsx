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
      throw new Error('This UID/password pair is not configured in the local development API. Check the configured development users in .env, then restart npm run server:dev.')
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

async function getCometChatUser(peerUid, currentUid) {
  if (!peerUid || !/^[A-Za-z0-9._-]{1,100}$/.test(peerUid)) {
    throw new Error('Enter a valid CometChat UID for the neighbor you want to message.')
  }
  if (peerUid === currentUid) {
    throw new Error('Choose a different CometChat UID; you cannot start a chat with yourself.')
  }

  try {
    return await CometChat.getUser(peerUid)
  } catch {
    throw new Error('That CometChat user could not be found. Confirm the UID belongs to an existing user in this app.')
  }
}

async function getIncidentGroup(requestId, peerUid) {
  const guid = incidentGroupGuid(requestId)
  let group

  try {
    group = await CometChat.getGroup(guid)
  } catch {
    const incidentGroup = new CometChat.Group(
      guid,
      `HelpGrid ${requestId}`,
      CometChat.GROUP_TYPE.PRIVATE,
    )
    const peerMember = new CometChat.GroupMember(
      peerUid,
      CometChat.GROUP_MEMBER_SCOPE.PARTICIPANT,
    )
    try {
      await CometChat.createGroupWithMembers(incidentGroup, [peerMember], [])
    } catch {
      try {
        await CometChat.getGroup(guid)
      } catch {
        throw new Error(`Could not create or access the private chat for request ${requestId}. If it already exists, ask a member to add your CometChat user.`)
      }
    }
    try {
      group = await CometChat.getGroup(guid)
    } catch {
      throw new Error('The private chat was created but could not be loaded. Reopen this request and try again.')
    }
  }

  if (group.getType() !== CometChat.GROUP_TYPE.PRIVATE) {
    throw new Error('This request’s CometChat room is not private, so HelpGrid will not open it.')
  }
  if (!group.getHasJoined()) {
    throw new Error('Your CometChat account is not a member of this request’s private chat.')
  }

  const membersRequest = new CometChat.GroupMembersRequestBuilder(guid)
    .setLimit(100)
    .build()
  const members = await membersRequest.fetchNext()
  if (!members.some((member) => member.getUid() === peerUid)) {
    const scope = group.getScope()
    if (
      scope !== CometChat.GROUP_MEMBER_SCOPE.ADMIN
      && scope !== CometChat.GROUP_MEMBER_SCOPE.MODERATOR
    ) {
      throw new Error('The selected neighbor is not a member of this private chat. Ask a group admin to add them.')
    }

    await CometChat.addMembersToGroup(guid, [
      new CometChat.GroupMember(peerUid, CometChat.GROUP_MEMBER_SCOPE.PARTICIPANT),
    ], [])
    const updatedMembers = await new CometChat.GroupMembersRequestBuilder(guid)
      .setLimit(100)
      .build()
      .fetchNext()
    if (!updatedMembers.some((member) => member.getUid() === peerUid)) {
      throw new Error('CometChat did not confirm the neighbor’s membership in this request chat.')
    }
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
  const [peerUid, setPeerUid] = useState('')
  const [roomRequestId, setRoomRequestId] = useState(request.id)
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
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(roomRequestId.trim())) {
      setError('Enter a request ID containing only letters, numbers, hyphens, or underscores.')
      return
    }

    setLoading(true)
    try {
      const userUid = uid.trim()
      await authenticate(userUid, password)
      const peerUser = await getCometChatUser(peerUid.trim(), userUid)
      const incidentGroup = await getIncidentGroup(roomRequestId.trim(), peerUser.getUid())
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
    const peerDisplayName = peerUid || 'request participant'
    return (
      <div className="incident-chat">
        <div className="incident-chat-account">
          <span>{uid} · private room member</span>
          <button type="button" className="text-button" onClick={disconnect}>Sign out</button>
        </div>
        <p className="incident-chat-note">Private CometChat group for request {roomRequestId}. Access is limited by CometChat group membership. Neighbor: {peerDisplayName}.</p>
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
      <p>Uses the official CometChat UI Kit and a server-issued auth token. Each request gets a private CometChat group, and the selected existing neighbor is added as a member. Your password is sent only to the local development API and is not saved by HelpGrid.</p>
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
        <label>
          Request ID
          <input
            autoComplete="off"
            maxLength="100"
            value={roomRequestId}
            onChange={(event) => setRoomRequestId(event.target.value)}
          />
        </label>
        <label>
          Neighbor’s CometChat UID
          <input
            autoComplete="off"
            maxLength="100"
            value={peerUid}
            onChange={(event) => setPeerUid(event.target.value)}
            placeholder="UID of an existing CometChat user"
          />
        </label>
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? 'Connecting…' : 'Connect to request chat'}
        </button>
      </form>
      <p className="chat-safety">Both CometChat accounts must already exist in this app. The local backend can authenticate only the one or two development identities configured on the server. Do not deploy this development login flow.</p>
    </div>
  )
}
