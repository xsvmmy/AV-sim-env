import React, { useState } from 'react';
import CharacterSelector from './CharacterSelector';
import { createScenario } from '../utils/api';
import './ScenarioConfig.css';

/**
 * Scenario Configuration Component
 *
 * Main interface for configuring ethical dilemma scenarios.
 * Allows users to:
 * - Select passengers (1-5 characters)
 * - Select pedestrians (1-5 characters)
 * - Choose traffic light state
 * - Save and visualize the scenario
 */
function ScenarioConfig({ characters, onScenarioCreated }) {
  const [passengers, setPassengers] = useState([]);
  const [pedestrians, setPedestrians] = useState([]);
  const [trafficLight, setTrafficLight] = useState('Red');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

  const validateConfiguration = () => {
    const errors = [];

    if (passengers.length === 0) {
      errors.push('Please select at least 1 passenger');
    }
    if (pedestrians.length === 0) {
      errors.push('Please select at least 1 pedestrian');
    }

    return errors;
  };

  const handleSubmit = async () => {
    // Validate configuration
    const errors = validateConfiguration();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    setLoading(true);
    setError(null);

    try {
      const scenarioData = {
        passengers,
        pedestrians,
        traffic_light: trafficLight
      };

      const createdScenario = await createScenario(scenarioData);
      onScenarioCreated(createdScenario);
    } catch (err) {
      setError(err.message || 'Failed to create scenario');
      console.error('Error creating scenario:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPassengers([]);
    setPedestrians([]);
    setTrafficLight('Red');
    setValidationErrors([]);
    setError(null);
  };

  const isValid = passengers.length > 0 && pedestrians.length > 0;

  return (
    <div className="scenario-config container">
      <div className="config-header">
        <h2>Configure Ethical Dilemma</h2>
        <p className="config-description">
          Set up a trolley-problem scenario where an autonomous vehicle must choose
          between staying in lane (hitting pedestrians) or swerving (harming passengers).
        </p>
      </div>

      {(validationErrors.length > 0 || error) && (
        <div className="error-message">
          {error && <div>{error}</div>}
          {validationErrors.map((err, idx) => (
            <div key={idx}>• {err}</div>
          ))}
        </div>
      )}

      <div className="config-section section">
        <CharacterSelector
          characters={characters}
          selectedCharacters={passengers}
          onSelectionChange={setPassengers}
          maxSelection={5}
          label="🚗 Passengers in Vehicle"
          isPedestrianSelector={false}
        />
      </div>

      <div className="config-section section">
        <CharacterSelector
          characters={characters}
          selectedCharacters={pedestrians}
          onSelectionChange={setPedestrians}
          maxSelection={5}
          label="🚶 Pedestrians in Crosswalk"
          isPedestrianSelector={true}
        />
      </div>

      <div className="config-section section">
        <h3 className="section-title">🚦 Pedestrian Signal</h3>
        <p className="section-description">
          The traffic light signals whether pedestrians have the right to cross
        </p>
        <div className="traffic-light-selector">
          <button
            className={`traffic-light-btn red ${trafficLight === 'Red' ? 'active' : ''}`}
            onClick={() => setTrafficLight('Red')}
          >
            <span className="light-indicator red-light">🚫</span>
            Don't Walk (Red)
          </button>
          <button
            className={`traffic-light-btn green ${trafficLight === 'Green' ? 'active' : ''}`}
            onClick={() => setTrafficLight('Green')}
          >
            <span className="light-indicator green-light">🚶</span>
            Walk (Green)
          </button>
        </div>
      </div>

      <div className="config-actions">
        <button
          className="btn-reset"
          onClick={handleReset}
          disabled={loading}
        >
          Reset
        </button>
        <button
          className="btn-submit"
          onClick={handleSubmit}
          disabled={!isValid || loading}
        >
          {loading ? 'Creating...' : 'Save & Visualize Scenario'}
        </button>
      </div>

      <div className="config-summary section">
        <h3 className="section-title">Scenario Summary</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-label">Passengers</div>
            <div className="summary-value">{passengers.length}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Pedestrians</div>
            <div className="summary-value">{pedestrians.length}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Traffic Light</div>
            <div className="summary-value">{trafficLight}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Status</div>
            <div className="summary-value">
              {isValid ? '✓ Ready' : '⚠ Incomplete'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScenarioConfig;
