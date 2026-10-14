import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createRequestRecord,
  incidentGroupGuid,
  loadRequests,
  matchVolunteers,
  persistRequests,
  updateRequestStatus,
} from './requests.js'

const sampleRequests = [
  {
    id: 'HG-2048',
    title: 'Grocery help',
    category: 'Errands',
    description: 'Pick up groceries',
    area: 'North Park',
    urgency: 'Today',
    skills: ['Driving', 'Shopping'],
    status: 'OPEN',
  },
]

const volunteers = [
  { name: 'Nearby match', area: 'North Park', skills: ['Driving', 'Shopping'], available: 'Available today' },
  { name: 'Category match', area: 'Westside', skills: ['Driving'], available: 'Available tomorrow' },
  { name: 'No match', area: 'Southside', skills: ['Carpentry'], available: 'Available next week' },
]

test('loads defaults when no local requests exist', () => {
  const result = loadRequests({ getItem: () => null }, sampleRequests)
  assert.deepEqual(result, { requests: sampleRequests, error: '' })
})

test('restores saved request changes and keeps default requests', () => {
  const savedSample = { ...sampleRequests[0], status: 'RESOLVED' }
  const createdRequest = { ...sampleRequests[0], id: 'HG-12345', title: 'Created request' }
  const result = loadRequests({ getItem: () => JSON.stringify([savedSample, createdRequest]) }, sampleRequests)

  assert.equal(result.requests[0].status, 'RESOLVED')
  assert.equal(result.requests[1].id, createdRequest.id)
  assert.equal(result.requests.filter((request) => request.id === sampleRequests[0].id).length, 1)
})

test('reports malformed saved requests instead of crashing the dashboard', () => {
  const result = loadRequests({ getItem: () => '{broken json' }, sampleRequests)
  assert.deepEqual(result.requests, sampleRequests)
  assert.match(result.error, /could not be parsed/)

  const invalidShape = loadRequests({ getItem: () => JSON.stringify({ uid: 'unexpected' }) }, sampleRequests)
  assert.deepEqual(invalidShape.requests, sampleRequests)
  assert.match(invalidShape.error, /unsupported format/)
})

test('persists the full board and reports storage failures', () => {
  let savedValue
  const storage = { setItem: (_key, value) => { savedValue = value } }
  assert.equal(persistRequests(storage, sampleRequests), true)
  assert.deepEqual(JSON.parse(savedValue), sampleRequests)
  assert.equal(persistRequests({ setItem: () => { throw new Error('quota') } }, sampleRequests), false)
})

test('creates a request, advances its status, and restores both after reload', () => {
  const created = createRequestRecord({
    title: '  Grocery help ',
    category: 'Errands',
    description: ' Pick up groceries ',
    area: ' North Park ',
    urgency: 'Today',
    skills: ['Driving', 'Shopping'],
  }, 'HG-12345')
  assert.equal(created.status, 'OPEN')
  assert.equal(created.title, 'Grocery help')
  assert.equal(created.description, 'Pick up groceries')
  assert.equal(created.area, 'North Park')

  const changed = updateRequestStatus([created], created.id, 'RESPONDING')
  assert.equal(changed[0].status, 'RESPONDING')
  assert.throws(() => updateRequestStatus(changed, created.id, 'UNKNOWN'), /Unsupported request status/)

  let savedValue
  assert.equal(persistRequests({ setItem: (_key, value) => { savedValue = value } }, changed), true)
  const restored = loadRequests({ getItem: () => savedValue }, sampleRequests)
  assert.equal(restored.requests.find((request) => request.id === created.id).status, 'RESPONDING')
})

test('RelayMatch ranks declared skills, category, area, and availability with reasons', () => {
  const matches = matchVolunteers(sampleRequests[0], volunteers)
  assert.deepEqual(matches.map((volunteer) => volunteer.name), ['Nearby match', 'Category match'])
  assert.deepEqual(matches[0].sharedSkills, ['Driving', 'Shopping'])
  assert.equal(matches[0].nearby, true)
  assert.equal(matches[0].availableToday, true)
  assert.equal(matches[1].categoryFit, true)
  assert.equal(matches.some((volunteer) => volunteer.name === 'No match'), false)
})

test('maps each request to a stable private-group-safe CometChat GUID', () => {
  assert.equal(incidentGroupGuid('HG-AF174A52'), 'helpgrid_hg-af174a52')
  assert.equal(incidentGroupGuid('HG-AF174A52'), incidentGroupGuid('HG-AF174A52'))
  assert.ok(incidentGroupGuid('x'.repeat(150)).length <= 100)
})
