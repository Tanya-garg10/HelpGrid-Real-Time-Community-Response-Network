import { lazy, Suspense, useMemo, useState } from 'react'
import {
  createRequestRecord,
  loadRequests,
  matchVolunteers,
  persistRequests,
  updateRequestStatus,
} from './requests.js'
import './App.css'

const IncidentChat = lazy(() => import('./IncidentChat.jsx'))

const sampleRequests = [
  { id: 'HG-2048', title: 'Grocery drop-off for Mrs. Rivera', category: 'Errands', description: 'A neighbor recovering from surgery needs a few grocery essentials picked up and left at her doorstep. No contact necessary.', area: 'North Park', urgency: 'Today', skills: ['Driving', 'Shopping'], status: 'OPEN', createdAt: '12 min ago', initials: 'MR', color: 'peach' },
  { id: 'HG-2047', title: 'Help assembling a wheelchair ramp', category: 'Home help', description: 'Looking for two handy volunteers to help assemble a temporary ramp at the community center entrance.', area: 'Maple Heights', urgency: 'This week', skills: ['Carpentry', 'Lifting'], status: 'CLAIMED', createdAt: '38 min ago', initials: 'JC', color: 'blue' },
  { id: 'HG-2046', title: 'Translate a school enrollment form', category: 'Translation', description: 'A Spanish-speaking family would appreciate help understanding a school enrollment form before Friday.', area: 'Westside', urgency: 'This week', skills: ['Spanish', 'Translation'], status: 'RESPONDING', createdAt: '1 hr ago', initials: 'AS', color: 'lavender' },
  { id: 'HG-2045', title: 'Pick up donated winter coats', category: 'Errands', description: 'Collect a box of donated coats from the library and bring it to the neighborhood pantry.', area: 'Old Town', urgency: 'Flexible', skills: ['Driving'], status: 'OPEN', createdAt: '2 hrs ago', initials: 'PL', color: 'green' },
  { id: 'HG-2044', title: 'Check in on a new parent', category: 'Companionship', description: 'A new parent nearby would love a friendly check-in and a little company this afternoon.', area: 'North Park', urgency: 'Today', skills: ['Companionship'], status: 'RESOLVED', createdAt: 'Yesterday', initials: 'KW', color: 'yellow' },
]

const volunteers = [
  { name: 'Maya Patel', initials: 'MP', area: 'North Park', skills: ['Driving', 'Shopping', 'Errands'], available: 'Available today', color: 'peach' },
  { name: 'Jordan Lee', initials: 'JL', area: 'Maple Heights', skills: ['Carpentry', 'Lifting', 'Home help'], available: 'Available this week', color: 'blue' },
  { name: 'Ana Santos', initials: 'AS', area: 'Westside', skills: ['Spanish', 'Translation'], available: 'Available today', color: 'lavender' },
  { name: 'Sam Okafor', initials: 'SO', area: 'North Park', skills: ['Driving', 'Shopping'], available: 'Available tomorrow', color: 'green' },
]

const communities = [
  { name: 'Northside Community', subtitle: 'North Park · Old Town', areas: ['North Park', 'Old Town'] },
  { name: 'Westside Community', subtitle: 'Westside neighborhood', areas: ['Westside'] },
  { name: 'Maple Heights Community', subtitle: 'Maple Heights neighborhood', areas: ['Maple Heights'] },
  { name: 'All communities', subtitle: 'Browse every sample request', areas: null },
]

const statusOrder = ['OPEN', 'CLAIMED', 'RESPONDING', 'RESOLVED']
const filters = ['All requests', 'Open', 'In progress', 'Resolved']
const categories = ['Errands', 'Food & groceries', 'Home help', 'Transportation', 'Companionship', 'Translation', 'Other']
const skillOptions = ['Driving', 'Shopping', 'Carpentry', 'Lifting', 'Spanish', 'Translation', 'Companionship', 'First aid']
function readSavedRequests() {
  return loadRequests({
    getItem: (key) => window.localStorage.getItem(key),
  }, sampleRequests)
}

function App() {
  const [initial] = useState(readSavedRequests)
  const [requests, setRequests] = useState(initial.requests)
  const [storageError, setStorageError] = useState(initial.error)
  const [activePage, setActivePage] = useState('Overview')
  const [activeCommunityName, setActiveCommunityName] = useState('Northside Community')
  const [activeFilter, setActiveFilter] = useState('All requests')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ title: '', category: 'Errands', description: '', area: '', urgency: 'Today', skills: [] })
  const activeCommunity = communities.find((community) => community.name === activeCommunityName) || communities[0]
  const communityRequests = useMemo(() => (
    activeCommunity.areas
      ? requests.filter((request) => activeCommunity.areas.includes(request.area))
      : requests
  ), [activeCommunity, requests])
  const communityVolunteers = useMemo(() => (
    activeCommunity.areas
      ? volunteers.filter((volunteer) => activeCommunity.areas.includes(volunteer.area))
      : volunteers
  ), [activeCommunity])

  function saveRequests(nextRequests) {
    const persisted = persistRequests({
      setItem: (key, value) => window.localStorage.setItem(key, value),
    }, nextRequests)
    if (!persisted) {
      setStorageError('Your browser storage is unavailable. Changes may not persist after you close this page.')
    } else {
      setStorageError('')
    }
    return persisted
  }

  const visibleRequests = useMemo(() => {
    return communityRequests.filter((request) => {
      const matchesSearch = `${request.title} ${request.category} ${request.area}`.toLowerCase().includes(query.toLowerCase())
      const matchesFilter = activeFilter === 'All requests'
        || (activeFilter === 'Open' && request.status === 'OPEN')
        || (activeFilter === 'In progress' && ['CLAIMED', 'RESPONDING'].includes(request.status))
        || (activeFilter === 'Resolved' && request.status === 'RESOLVED')
      return matchesSearch && matchesFilter
    })
  }, [communityRequests, activeFilter, query])

  const matchedVolunteers = selected ? matchVolunteers(selected, volunteers) : []

  function updateStatus(id, status) {
    const nextRequests = updateRequestStatus(requests, id, status)
    setRequests(nextRequests)
    const persisted = saveRequests(nextRequests)
    setSelected((current) => current?.id === id ? { ...current, status } : current)
    setNotice(persisted
      ? `Request status updated to ${status.toLowerCase()}.`
      : 'Status changed for this session, but browser storage is unavailable so it may not survive refresh.')
    window.setTimeout(() => setNotice(''), 2800)
  }

  function toggleSkill(skill) {
    setForm((current) => ({
      ...current,
      skills: current.skills.includes(skill) ? current.skills.filter((item) => item !== skill) : [...current.skills, skill],
    }))
  }

  function createRequest(event) {
    event.preventDefault()
    if (!form.title.trim() || !form.description.trim() || !form.area.trim()) {
      setFormError('Please complete the title, description, and general area.')
      return
    }
    if (!form.skills.length) {
      setFormError('Choose at least one volunteer skill so RelayMatch can find a helpful match.')
      return
    }
    const newRequest = createRequestRecord(
      form,
      `HG-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    )
    const nextRequests = [newRequest, ...requests]
    setRequests(nextRequests)
    const persisted = saveRequests(nextRequests)
    setForm({ title: '', category: 'Errands', description: '', area: '', urgency: 'Today', skills: [] })
    setFormError('')
    setShowCreate(false)
    setActivePage('Overview')
    setActiveFilter('All requests')
    setNotice(persisted
      ? 'Your request is posted and saved in this browser.'
      : 'Your request is posted for this session, but browser storage is unavailable so it may not survive refresh.')
    window.setTimeout(() => setNotice(''), 3500)
  }

  const openCount = communityRequests.filter((request) => request.status === 'OPEN').length
  const activeCount = communityRequests.filter((request) => ['CLAIMED', 'RESPONDING'].includes(request.status)).length
  const resolvedCount = communityRequests.filter((request) => request.status === 'RESOLVED').length

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setActivePage('Overview') }}>
          <span className="brand-mark"><span /></span>
          <span>helpgrid<span className="brand-period">.</span><small>NEIGHBORS, TOGETHER</small></span>
        </a>
        <div className="workspace-label">YOUR COMMUNITY</div>
        <CommunityMenu
          communities={communities}
          activeCommunity={activeCommunity}
          onSelect={setActiveCommunityName}
        />
        <nav className="side-nav" aria-label="Main navigation">
          <div className="nav-caption">WORKSPACE</div>
          {[
            ['Overview', '▦'],
            ['Requests', '◷'],
            ['Volunteers', '♧'],
          ].map(([label, icon]) => (
            <button key={label} className={`nav-item ${activePage === label ? 'selected' : ''}`} onClick={() => setActivePage(label)} type="button">
              <span className="nav-icon">{icon}</span>{label}
              {label === 'Requests' && <span className="nav-count">{openCount}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card"><span className="privacy-icon">✳</span><strong>Neighbors helping neighbors</strong><p>Small acts of care make a big difference. Thanks for being here.</p></div>
          <button className="profile-button" type="button"><span className="avatar avatar-teal">T</span><span><strong>Tanya</strong><small>Community member</small></span><span className="chevron">···</span></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">{activeCommunity.name} <span>/</span> <strong>{activePage}</strong></div>
          <div className="top-actions">
            <CommunityMenu
              className="mobile-community-menu"
              communities={communities}
              activeCommunity={activeCommunity}
              onSelect={setActiveCommunityName}
            />
            <span className="live-indicator"><i /> Prototype preview</span>
            <button className="icon-button notification-button" type="button" aria-label="Notifications" onClick={() => setNotice('You’re all caught up on community updates.')}>♧<b /></button>
            <span className="top-avatar">T</span>
          </div>
        </header>

        <div className="page-content">
          {storageError && <div className="storage-warning" role="status">{storageError}</div>}
          {notice && <div className="toast" role="status">{notice}</div>}

          {activePage === 'Volunteers' ? (
            <section className="volunteers-page">
              <div className="page-heading"><div><div className="eyebrow">THE PEOPLE WHO SHOW UP</div><h1>Our volunteers<span className="heading-period">.</span></h1><p className="page-subtitle">Good neighbors sharing time and skills across {activeCommunity.name}.</p></div><span className="sample-tag">SAMPLE DIRECTORY</span></div>
              <div className="volunteer-grid">{communityVolunteers.map((volunteer) => <article className="volunteer-card" key={volunteer.name}><div className="volunteer-card-top"><span className={`avatar avatar-${volunteer.color}`}>{volunteer.initials}</span><span className="availability-dot" /></div><h3>{volunteer.name}</h3><p className="volunteer-area">⌖ {volunteer.area}</p><div className="skill-list">{volunteer.skills.map((skill) => <span className="skill-chip" key={skill}>{skill}</span>)}</div><div className="volunteer-available">{volunteer.available}</div></article>)}</div>
              {!communityVolunteers.length && <div className="empty-state"><h3>No sample volunteers in this community</h3><p>Choose another community to browse the sample directory.</p></div>}
              <p className="sample-note">Volunteer profiles shown are sample data for this prototype.</p>
            </section>
          ) : (
            <>
              <section className="welcome-banner">
                <div className="welcome-copy"><div className="eyebrow"><span className="sparkle">✳</span> YOUR COMMUNITY · {activeCommunity.name.toUpperCase()}</div><h1>{activePage === 'Requests' ? 'Community requests' : 'Neighbors, showing up for each other'}<span className="heading-period">.</span></h1><p>{activePage === 'Requests' ? `A little help goes a long way. Here’s what your neighbors need in ${activeCommunity.name}.` : `Small acts of care make a big difference in ${activeCommunity.name}.`}</p><button className="primary-button" onClick={() => { setFormError(''); setShowCreate(true) }} type="button"><span>＋</span> Post a request</button></div>
                <div className="welcome-art" aria-hidden="true"><div className="art-sun" /><div className="art-hill art-hill-back" /><div className="art-hill art-hill-front" /><div className="art-house"><div className="house-roof" /><div className="house-body"><i /><i /><b /></div></div><div className="art-person person-one"><i /><b /></div><div className="art-person person-two"><i /><b /></div><span className="art-heart">♥</span><span className="art-spark">✳</span></div>
              </section>

              <section className="stats-row" aria-label="Community statistics">
                <article className="stat-card"><span className="stat-icon icon-open">✳</span><div><span className="stat-label">OPEN REQUESTS</span><strong>{openCount}<small> requests</small></strong><span className="stat-foot"><i className="tiny-dot dot-orange" /> Ready for a helping hand</span></div></article>
                <article className="stat-card"><span className="stat-icon icon-progress">↗</span><div><span className="stat-label">IN PROGRESS</span><strong>{activeCount}<small> requests</small></strong><span className="stat-foot"><i className="tiny-dot dot-blue" /> Neighbors on the way</span></div></article>
                <article className="stat-card"><span className="stat-icon icon-resolved">✓</span><div><span className="stat-label">RESOLVED THIS WEEK</span><strong>{resolvedCount}<small> requests</small></strong><span className="stat-foot"><i className="tiny-dot dot-green" /> Good things happen here</span></div></article>
              </section>

              <section className="requests-section">
                <div className="section-heading"><div><div className="eyebrow">THE NEIGHBORHOOD BOARD</div><h2>{activePage === 'Requests' ? 'All requests' : 'Requests near you'} <span className="request-total">{communityRequests.length}</span></h2></div><div className="section-tools"><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search requests..." aria-label="Search requests" /></label><button className="filter-button" type="button" onClick={() => { setActiveFilter(activeFilter === 'All requests' ? 'Open' : 'All requests') }}>☷ <span>Filter</span></button></div></div>
                <div className="filter-tabs" role="tablist" aria-label="Filter requests">{filters.map((filter) => <button type="button" role="tab" aria-selected={activeFilter === filter} className={activeFilter === filter ? 'active' : ''} onClick={() => setActiveFilter(filter)} key={filter}>{filter}{filter === 'Open' && <span>{openCount}</span>}</button>)}</div>
                <div className="request-list">
                  {visibleRequests.length ? visibleRequests.map((request) => <RequestCard key={request.id} request={request} onOpen={() => setSelected(request)} />) : <div className="empty-state"><span>⌕</span><h3>No requests found</h3><p>Try a different search or filter, or post a new request for your community.</p><button className="text-button" type="button" onClick={() => { setQuery(''); setActiveFilter('All requests') }}>Clear filters</button></div>}
                </div>
                <p className="sample-note"><span className="sample-dot" /> Sample community data is shown for illustration. Real requests are stored only in this browser.</p>
              </section>
            </>
          )}

          <footer className="page-footer"><span>Made with care, for the people around us <b>♥</b></span><span>HelpGrid is not an emergency service. <a href="#safety" onClick={(event) => { event.preventDefault(); setNotice('For emergencies, contact your local emergency services. HelpGrid is not an emergency service.') }}>Get help</a></span></footer>
        </div>
      </main>

      {showCreate && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false) }}><section className="dialog create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="dialog-header"><div><div className="eyebrow">A GOOD NEIGHBOR MOMENT</div><h2 id="create-title">Post a request<span className="heading-period">.</span></h2></div><button className="close-button" type="button" onClick={() => setShowCreate(false)} aria-label="Close">×</button></div><p className="dialog-intro">Share what you need. Your neighbors may be able to lend a hand.</p>{formError && <div className="form-error" role="alert">{formError}</div>}<form onSubmit={createRequest} className="request-form"><label>What do you need help with?<input maxLength="90" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Pick up a prescription" /></label><div className="form-row"><label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>When do you need help?<select value={form.urgency} onChange={(event) => setForm({ ...form, urgency: event.target.value })}><option>Today</option><option>This week</option><option>Flexible</option></select></label></div><label>Tell your neighbors a little more<textarea rows="3" maxLength="400" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Add helpful details. Please don't include sensitive personal information." /></label><label>General area<input maxLength="60" value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} placeholder="e.g. North Park — no exact address" /></label><fieldset><legend>Skills that could help</legend><div className="checkbox-grid">{skillOptions.map((skill) => <label className="check-option" key={skill}><input type="checkbox" checked={form.skills.includes(skill)} onChange={() => toggleSkill(skill)} />{skill}</label>)}</div></fieldset><div className="privacy-hint">⌖ Share only a general neighborhood here. Never post your home address or private details.</div><div className="form-actions"><button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" type="submit">Post request <span>→</span></button></div></form></section></div>}

      {selected && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}>
          <section className="dialog detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title">
            <div className="dialog-header">
              <span className={`request-symbol avatar-${selected.color}`}>{selected.initials}</span>
              <button className="close-button" type="button" onClick={() => setSelected(null)} aria-label="Close">×</button>
            </div>
            <span className="request-id">{selected.id} <span>·</span> {selected.createdAt}</span>
            <h2 id="detail-title" className="detail-title">{selected.title}</h2>
            <div className="detail-meta"><span>⌖ {selected.area}</span><span>◷ {selected.urgency}</span><span>{selected.category}</span></div>
            <p className="detail-description">{selected.description}</p>
            <div className="detail-divider" />
            <div className="detail-section-head"><h3>RelayMatch suggestions</h3><span className="match-demo">DEMO MATCHING</span></div>
            <p className="match-caption">Sample suggestions based on request category, listed skills, availability, and area—not live volunteer connections.</p>
            <div className="match-list">
              {matchedVolunteers.length ? matchedVolunteers.map((volunteer) => (
                <div className="match-row" key={volunteer.name}>
                  <span className={`avatar avatar-${volunteer.color}`}>{volunteer.initials}</span>
                  <div className="match-person">
                    <strong>{volunteer.name}</strong>
                    <span>{[
                      volunteer.categoryFit && 'category fit',
                      volunteer.sharedSkills.length && `${volunteer.sharedSkills.join(', ')} skill match`,
                      volunteer.nearby && 'nearby',
                      volunteer.available.toLowerCase(),
                    ].filter(Boolean).join(' · ')}</span>
                  </div>
                  <span className="match-score">{volunteer.score >= 3 ? 'Great fit' : 'Good fit'}</span>
                </div>
              )) : <div className="empty-match">No sample volunteers match this request yet. Neighbors may still see your request.</div>}
            </div>
            <div className="detail-divider" />
            <div className="detail-section-head">
              <h3>Request status</h3>
              <span className={`status-badge status-${selected.status.toLowerCase()}`}>{selected.status}</span>
            </div>
            <div className="status-controls">
              {statusOrder.map((status, index) => (
                <button type="button" className={selected.status === status ? 'current' : ''} onClick={() => updateStatus(selected.id, status)} key={status}>
                  <span>{index + 1}</span>{status}
                </button>
              ))}
            </div>
            <button type="button" className="chat-button" onClick={() => setShowChat(true)}>▤ Open request chat <span>CometChat UI Kit</span></button>
          </section>
        </div>
      )}

      {showChat && selected && <div className="modal-backdrop chat-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowChat(false) }}>      <section className="dialog chat-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-title"><div className="dialog-header"><div><div className="eyebrow">REQUEST {selected.id}</div><h2 id="chat-title">Neighbor chat</h2></div><button className="close-button" type="button" onClick={() => setShowChat(false)} aria-label="Close">×</button></div><Suspense fallback={<p className="dialog-intro">Loading the official CometChat UI Kit…</p>}><IncidentChat request={selected} /></Suspense></section></div>}
    </div>
  )
}

function CommunityMenu({ communities, activeCommunity, onSelect, className = '' }) {
  return (
    <details className={`community-menu ${className}`}>
      <summary className="community-select" aria-label={`Selected community: ${activeCommunity.name}`}>
        <span className="community-dot" />
        <span className="community-select-copy">
          <strong>{activeCommunity.name}</strong>
          <small>{activeCommunity.subtitle}</small>
        </span>
        <span className="chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="community-options" aria-label="Choose a community">
        {communities.map((community) => (
          <button
            key={community.name}
            type="button"
            className={`community-option ${community.name === activeCommunity.name ? 'selected' : ''}`}
            aria-current={community.name === activeCommunity.name ? 'true' : undefined}
            onClick={(event) => {
              onSelect(community.name)
              event.currentTarget.closest('details')?.removeAttribute('open')
            }}
          >
            <span className="community-option-icon">⌖</span>
            <span><strong>{community.name}</strong><small>{community.subtitle}</small></span>
            {community.name === activeCommunity.name && <span className="community-check">✓</span>}
          </button>
        ))}
      </div>
    </details>
  )
}

function RequestCard({ request, onOpen }) {
  const statusLabel = request.status === 'OPEN' ? 'Open' : request.status === 'CLAIMED' ? 'Claimed' : request.status === 'RESPONDING' ? 'Responding' : 'Resolved'
  return <button type="button" className="request-card" onClick={onOpen}><span className={`request-symbol avatar-${request.color}`}>{request.initials}</span><span className="request-main"><span className="request-title-row"><strong>{request.title}</strong><span className={`status-badge status-${request.status.toLowerCase()}`}><i />{statusLabel}</span></span><span className="request-description">{request.description}</span><span className="request-card-meta"><span>⌖ {request.area}</span><span>◷ {request.urgency}</span><span className="category-pill">{request.category}</span></span></span><span className="request-card-end"><span className="match-avatars"><i className="mini-avatar mini-one">M</i><i className="mini-avatar mini-two">J</i><i className="mini-avatar mini-three">A</i></span><span className="match-count">Sample volunteer profiles</span><span className="card-arrow">›</span></span></button>
}

export default App
