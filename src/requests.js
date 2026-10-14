const categorySkillGroups = {
  'Errands': ['driving', 'shopping'],
  'Food & groceries': ['shopping', 'driving'],
  'Home help': ['carpentry', 'lifting'],
  'Transportation': ['driving'],
  'Companionship': ['companionship'],
  'Translation': ['spanish', 'translation'],
}

function isRequest(value) {
  return value
    && typeof value === 'object'
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.category === 'string'
    && typeof value.description === 'string'
    && typeof value.area === 'string'
    && typeof value.urgency === 'string'
    && Array.isArray(value.skills)
    && value.skills.every((skill) => typeof skill === 'string')
    && ['OPEN', 'CLAIMED', 'RESPONDING', 'RESOLVED'].includes(value.status)
}

export function loadRequests(storage, sampleRequests) {
  try {
    const saved = storage.getItem('helpgrid.requests')
    if (saved === null) return { requests: sampleRequests, error: '' }

    let parsed
    try {
      parsed = JSON.parse(saved)
    } catch {
      return {
        requests: sampleRequests,
        error: 'Saved requests could not be parsed. Your sample board is shown; saving a change will replace the invalid saved data.',
      }
    }
    if (!Array.isArray(parsed) || !parsed.every(isRequest)) {
      return {
        requests: sampleRequests,
        error: 'Saved requests have an unsupported format. Your sample board is shown; saving a change will replace the invalid saved data.',
      }
    }

    const merged = new Map(sampleRequests.map((request) => [request.id, request]))
    for (const request of parsed) merged.set(request.id, request)
    const savedIds = new Set(parsed.map((request) => request.id))
    return {
      requests: [
        ...parsed.map((request) => merged.get(request.id)),
        ...sampleRequests.filter((request) => !savedIds.has(request.id)),
      ],
      error: '',
    }
  } catch {
    return {
      requests: sampleRequests,
      error: 'Your browser storage is unavailable. Changes may not persist after you close this page.',
    }
  }
}

export function persistRequests(storage, requests) {
  try {
    storage.setItem('helpgrid.requests', JSON.stringify(requests))
    return true
  } catch {
    return false
  }
}

export function matchVolunteers(request, volunteers) {
  return volunteers
    .map((volunteer) => {
      const sharedSkills = volunteer.skills.filter((skill) => request.skills.some(
        (required) => skill.toLowerCase() === required.toLowerCase(),
      ))
      const categoryFit = (categorySkillGroups[request.category] || []).some((skill) => volunteer.skills.some(
        (volunteerSkill) => volunteerSkill.toLowerCase() === skill,
      ))
      const nearby = volunteer.area.toLowerCase() === request.area.toLowerCase()
      const availableToday = volunteer.available.toLowerCase().includes('today')
      const score = sharedSkills.length * 2 + Number(categoryFit) * 2 + Number(nearby) + Number(availableToday)
      return {
        ...volunteer,
        sharedSkills,
        categoryFit,
        nearby,
        availableToday,
        score,
      }
    })
    .filter((volunteer) => volunteer.sharedSkills.length || volunteer.categoryFit)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
}

export function incidentGroupGuid(requestId) {
  const normalizedId = requestId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
  return `helpgrid_${normalizedId}`.slice(0, 100)
}
