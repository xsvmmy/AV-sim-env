/**
 * API Client Utilities
 *
 * Provides functions for making HTTP requests to the backend API.
 * Handles error handling and response parsing.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    // Handle 204 No Content responses
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}

/**
 * Fetch all available character types
 */
export async function fetchCharacters() {
  return fetchAPI('/api/characters');
}

/**
 * Create a new scenario
 */
export async function createScenario(scenarioData) {
  return fetchAPI('/api/scenarios', {
    method: 'POST',
    body: JSON.stringify(scenarioData),
  });
}

/**
 * Fetch all scenarios
 */
export async function fetchScenarios(skip = 0, limit = 100) {
  return fetchAPI(`/api/scenarios?skip=${skip}&limit=${limit}`);
}

/**
 * Fetch a specific scenario by ID
 */
export async function fetchScenario(scenarioId) {
  return fetchAPI(`/api/scenarios/${scenarioId}`);
}

/**
 * Update a scenario
 */
export async function updateScenario(scenarioId, updateData) {
  return fetchAPI(`/api/scenarios/${scenarioId}`, {
    method: 'PUT',
    body: JSON.stringify(updateData),
  });
}

/**
 * Delete a scenario
 */
export async function deleteScenario(scenarioId) {
  return fetchAPI(`/api/scenarios/${scenarioId}`, {
    method: 'DELETE',
  });
}

/**
 * Run simulation for a scenario
 */
export async function simulateScenario(scenarioId, action) {
  return fetchAPI(`/api/scenarios/${scenarioId}/simulate?action=${action}`, {
    method: 'POST',
  });
}

/**
 * Get outcome of a simulated scenario
 */
export async function fetchScenarioOutcome(scenarioId) {
  return fetchAPI(`/api/scenarios/${scenarioId}/outcome`);
}

/**
 * Fetch statistics
 */
export async function fetchStatistics() {
  return fetchAPI('/api/statistics');
}

/**
 * Export scenarios as JSON
 */
export async function exportScenarios() {
  return fetchAPI('/api/export/json');
}

/**
 * Fetch a random CSV-sourced RL scenario
 */
export async function getRLScenarioRandom() {
  return fetchAPI('/api/rl/scenarios/random');
}

/**
 * Run the RL agent pipeline for a CSV scenario by response_id
 */
export async function simulateWithRL(responseId) {
  return fetchAPI('/api/rl/simulate', {
    method: 'POST',
    body: JSON.stringify({ response_id: responseId }),
  });
}

/**
 * Train a custom agent from user-labeled scenarios
 */
export async function trainCustomAgent(name, trainingData) {
  return fetchAPI('/api/custom-model/train', {
    method: 'POST',
    body: JSON.stringify({ name, training_data: trainingData }),
  });
}

/**
 * List all saved custom agents
 */
export async function getCustomAgents() {
  return fetchAPI('/api/custom-model/agents');
}

/**
 * Run a scenario through a named custom agent
 */
export async function predictWithCustomAgent(agentName, passengers, pedestrians, trafficLight) {
  return fetchAPI(`/api/custom-model/${encodeURIComponent(agentName)}/predict`, {
    method: 'POST',
    body: JSON.stringify({ passengers, pedestrians, traffic_light: trafficLight }),
  });
}
