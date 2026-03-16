/**
 * API Client Utilities
 *
 * All HTTP requests to the backend API go through fetchAPI().
 */

// Empty string routes requests through Vite's proxy (see vite.config.js)
// avoiding CORS issues regardless of which port Vite picks.
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    if (response.status === 204) return null;
    return await response.json();
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}

// ── Characters ──────────────────────────────────────────────────────────────

export async function fetchCharacters() {
  return fetchAPI('/api/characters');
}

// ── Scenario CRUD ────────────────────────────────────────────────────────────

export async function createScenario(scenarioData) {
  return fetchAPI('/api/scenarios', { method: 'POST', body: JSON.stringify(scenarioData) });
}

export async function fetchScenarios(skip = 0, limit = 100) {
  return fetchAPI(`/api/scenarios?skip=${skip}&limit=${limit}`);
}

export async function fetchScenario(scenarioId) {
  return fetchAPI(`/api/scenarios/${scenarioId}`);
}

export async function updateScenario(scenarioId, updateData) {
  return fetchAPI(`/api/scenarios/${scenarioId}`, { method: 'PUT', body: JSON.stringify(updateData) });
}

export async function deleteScenario(scenarioId) {
  return fetchAPI(`/api/scenarios/${scenarioId}`, { method: 'DELETE' });
}

// ── Simulation ───────────────────────────────────────────────────────────────

export async function simulateScenario(scenarioId, action) {
  return fetchAPI(`/api/scenarios/${scenarioId}/simulate?action=${action}`, { method: 'POST' });
}

export async function fetchScenarioOutcome(scenarioId) {
  return fetchAPI(`/api/scenarios/${scenarioId}/outcome`);
}

// ── Statistics / Export ──────────────────────────────────────────────────────

export async function fetchStatistics() {
  return fetchAPI('/api/statistics');
}

export async function exportScenarios() {
  return fetchAPI('/api/export/json');
}

// ── RL — CSV scenarios ───────────────────────────────────────────────────────

/**
 * Fetch a random CSV-sourced scenario for RL simulation.
 */
export async function getRLScenarioRandom() {
  return fetchAPI('/api/rl/scenarios/random');
}

/**
 * Run the RL agent on a CSV scenario by response_id.
 * Returns agent's action, Q-values, harmed group, and stats.
 * NOTE: Q-table is NOT updated here — call submitFeedback after user responds.
 */
export async function simulateWithRL(responseId) {
  return fetchAPI('/api/rl/simulate', {
    method: 'POST',
    body: JSON.stringify({ response_id: responseId }),
  });
}

/**
 * Submit user feedback after viewing an RL simulation.
 * Updates the Q-table: +1 if user agrees, -1 if not.
 *
 * @param {string} responseId   - scenario response_id
 * @param {string} agentAction  - "stay" or "swerve" (what the agent predicted)
 * @param {boolean} userAgrees  - true if user confirms, false if they'd choose differently
 */
export async function submitFeedback(responseId, agentAction, userAgrees) {
  return fetchAPI('/api/rl/feedback', {
    method: 'POST',
    body: JSON.stringify({
      response_id:  responseId,
      agent_action: agentAction,
      user_agrees:  userAgrees,
    }),
  });
}

/**
 * Rerun a scenario using Nash/variance voting as the action.
 * Trains the Q-table with +1 reward and returns updated Q-values + reward.
 */
export async function datasetRun(responseId) {
  return fetchAPI('/api/rl/dataset-run', {
    method: 'POST',
    body: JSON.stringify({ response_id: responseId }),
  });
}

// ── Manual Challenge ─────────────────────────────────────────────────────────

/**
 * Start a manual challenge session.
 * Returns an object { scenarios: [...] } with nScenarios random CSV scenarios.
 *
 * @param {number} nScenarios  - number of scenarios to return (min 10)
 */
export async function startManualSession(nScenarios) {
  return fetchAPI('/api/manual/start', {
    method: 'POST',
    body: JSON.stringify({ n_scenarios: nScenarios }),
  });
}

/**
 * Submit completed manual challenge decisions.
 * Trains the RL agent and saves decisions to CSV.
 *
 * @param {Array<{response_id: string, action: string}>} decisions
 */
export async function submitManualDecisions(decisions) {
  return fetchAPI('/api/manual/submit', {
    method: 'POST',
    body: JSON.stringify({ decisions }),
  });
}
