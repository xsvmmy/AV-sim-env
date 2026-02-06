import React, { useState, useEffect } from 'react';
import { simulateScenario } from '../utils/api';
import './Visualization.css';

/**
 * Visualization Component
 *
 * Displays an interactive top-down view of the intersection scenario.
 * Shows the autonomous vehicle, passengers, pedestrians, and traffic light.
 * Allows user to choose between "Stay in Lane" or "Swerve" outcomes.
 *
 * Future RL Integration:
 * - Display agent's decision confidence
 * - Show policy heatmap for state visualization
 * - Animate agent decision-making process
 */
function Visualization({ scenario, onBack }) {
  const [simulationState, setSimulationState] = useState('ready'); // ready, simulating, completed
  const [outcome, setOutcome] = useState(null);
  const [animationPhase, setAnimationPhase] = useState('initial'); // initial, action, result
  const [error, setError] = useState(null);

  const getCharacterEmoji = (name) => {
    const emojiMap = {
      'Man': '👨',
      'Woman': '👩',
      'Pregnant': '🤰',
      'Stroller': '👶',
      'OldMan': '👴',
      'OldWoman': '👵',
      'Boy': '👦',
      'Girl': '👧',
      'Homeless': '🧑',
      'LargeWoman': '👩',
      'LargeMan': '👨',
      'Criminal': '🦹',
      'MaleExecutive': '👔',
      'FemaleExecutive': '👩‍💼',
      'FemaleAthlete': '🏃‍♀️',
      'MaleAthlete': '🏃‍♂️',
      'FemaleDoctor': '👩‍⚕️',
      'MaleDoctor': '👨‍⚕️',
      'Dog': '🐕',
      'Cat': '🐈',
      'Barricade': '🚧'
    };
    return emojiMap[name] || '👤';
  };

  const hasBarricade = scenario.pedestrians.includes('Barricade');

  const handleDecision = async (action) => {
    setSimulationState('simulating');
    setAnimationPhase('action');
    setError(null);

    try {
      // Simulate API call delay for animation
      await new Promise(resolve => setTimeout(resolve, 800));

      const result = await simulateScenario(scenario.id, action);
      setOutcome(result);

      // Progress through animation phases
      setTimeout(() => setAnimationPhase('result'), 600);
      setTimeout(() => setSimulationState('completed'), 1200);
    } catch (err) {
      setError(err.message || 'Failed to run simulation');
      setSimulationState('ready');
      setAnimationPhase('initial');
      console.error('Simulation error:', err);
    }
  };

  const handleReset = () => {
    setSimulationState('ready');
    setOutcome(null);
    setAnimationPhase('initial');
    setError(null);
  };

  const getVehiclePosition = () => {
    if (animationPhase === 'initial') return 'vehicle-approaching';
    if (animationPhase === 'action' && outcome?.outcome_choice === 'swerve') {
      return 'vehicle-swerving';
    }
    if (animationPhase === 'action' && outcome?.outcome_choice === 'stay') {
      return 'vehicle-continuing';
    }
    return 'vehicle-final';
  };

  return (
    <div className="visualization container">
      <div className="viz-header">
        <button className="btn-back" onClick={onBack}>
          ← Back to Configuration
        </button>
        <h2>Simulation Visualization</h2>
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      <div className="viz-main section">
        <div className="scenario-info">
          <div className="info-item">
            <strong>Passengers:</strong> {scenario.passengers.length}
            <div className="character-list">
              {scenario.passengers.map((p, i) => (
                <span key={i}>{getCharacterEmoji(p)}</span>
              ))}
            </div>
          </div>
          <div className="info-item">
            <strong>{hasBarricade ? 'Obstacle:' : 'Pedestrians:'}</strong> {hasBarricade ? 'Barricade' : scenario.pedestrians.length}
            <div className="character-list">
              {scenario.pedestrians.map((p, i) => (
                <span key={i}>{getCharacterEmoji(p)}</span>
              ))}
            </div>
          </div>
          <div className="info-item">
            <strong>Pedestrian Signal:</strong>
            <span className={`light-badge ${scenario.traffic_light.toLowerCase()}`}>
              {scenario.traffic_light === 'Red' ? '🚫 Don\'t Walk' : '🚶 Walk'}
            </span>
          </div>
        </div>

        <div className="intersection-container">
          <div className="intersection">
            {/* Main road (vertical) */}
            <div className="road-main"></div>

            {/* Lane markings */}
            <div className="lane-markings"></div>

            {/* Left barrier/building */}
            <div className="barrier-left"></div>

            {/* Right barrier/building */}
            <div className="barrier-right"></div>

            {/* Left crosswalk */}
            <div className="crosswalk crosswalk-left"></div>

            {/* Right crosswalk */}
            <div className="crosswalk crosswalk-right"></div>

            {/* Left pedestrian signal */}
            <div className="pedestrian-signal signal-left">
              <div className={`signal-light ${scenario.traffic_light === 'Red' ? 'active' : ''}`}>
                🚫
              </div>
              <div className={`signal-light ${scenario.traffic_light === 'Green' ? 'active' : ''}`}>
                🚶
              </div>
            </div>

            {/* Right pedestrian signal */}
            <div className="pedestrian-signal signal-right">
              <div className={`signal-light ${scenario.traffic_light === 'Red' ? 'active' : ''}`}>
                🚫
              </div>
              <div className={`signal-light ${scenario.traffic_light === 'Green' ? 'active' : ''}`}>
                🚶
              </div>
            </div>

            {/* Pedestrians or Barricade */}
            {hasBarricade ? (
              <div className={`barricade-obstacle ${animationPhase === 'result' && outcome?.outcome_choice === 'stay' ? 'harmed' : ''}`}>
                <div className="barricade-icon">🚧</div>
              </div>
            ) : (
              <div className={`pedestrian-group ${animationPhase === 'result' && outcome?.harmed_group === 'pedestrians' ? 'harmed' : ''}`}>
                {scenario.pedestrians.map((pedestrian, index) => (
                  <div key={index} className="character pedestrian">
                    {getCharacterEmoji(pedestrian)}
                  </div>
                ))}
              </div>
            )}

            {/* Vehicle with passengers */}
            <div className={`vehicle ${getVehiclePosition()}`}>
              <div className="vehicle-body">
                <div className="vehicle-top">
                  {scenario.passengers.map((passenger, index) => (
                    <div key={index} className="passenger-icon">
                      {getCharacterEmoji(passenger)}
                    </div>
                  ))}
                </div>
                <div className="vehicle-front">🚙</div>
              </div>
              {animationPhase === 'result' && outcome?.harmed_group === 'passengers' && (
                <div className="harm-indicator">💥</div>
              )}
            </div>

            {/* Direction arrow */}
            {animationPhase === 'initial' && (
              <div className="direction-arrow">⬇️</div>
            )}

            {/* Outcome overlay */}
            {animationPhase === 'result' && outcome && (
              <div className="outcome-overlay">
                <div className="outcome-indicator">
                  {outcome.outcome_choice === 'stay' ? '⬇️ Stayed in Lane' : '↘️ Swerved'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Decision buttons */}
        {simulationState === 'ready' && (
          <div className="decision-panel">
            <h3>Choose Vehicle Action:</h3>
            <div className="decision-buttons">
              <button
                className="decision-btn stay"
                onClick={() => handleDecision('stay')}
              >
                <div className="btn-icon">⬇️</div>
                <div className="btn-label">Stay in Lane</div>
                <div className="btn-consequence">
                  {hasBarricade
                    ? 'Hits barricade, harms passengers'
                    : `Hits ${scenario.pedestrians.length} pedestrian${scenario.pedestrians.length > 1 ? 's' : ''}`}
                </div>
              </button>
              <button
                className="decision-btn swerve"
                onClick={() => handleDecision('swerve')}
              >
                <div className="btn-icon">↘️</div>
                <div className="btn-label">Swerve</div>
                <div className="btn-consequence">
                  {hasBarricade
                    ? 'Avoids barricade, continues safely'
                    : `Swerves to avoid pedestrians, harms ${scenario.passengers.length} passenger${scenario.passengers.length > 1 ? 's' : ''}`}
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Simulation in progress */}
        {simulationState === 'simulating' && (
          <div className="simulation-status">
            <div className="status-spinner"></div>
            <p>Simulating outcome...</p>
          </div>
        )}

        {/* Results panel */}
        {simulationState === 'completed' && outcome && (
          <div className="results-panel">
            <h3>Simulation Results</h3>
            <div className="result-grid">
              <div className="result-item">
                <div className="result-label">Action Taken</div>
                <div className="result-value">
                  {outcome.outcome_choice === 'stay' ? '⬆️ Stayed in Lane' : '↗️ Swerved'}
                </div>
              </div>
              <div className="result-item harmed">
                <div className="result-label">Harmed Group</div>
                <div className="result-value">
                  {outcome.harmed_group === 'passengers' ? '🚗 Passengers' : '🚶 Pedestrians'}
                </div>
              </div>
              <div className="result-item">
                <div className="result-label">Number Harmed</div>
                <div className="result-value">{outcome.harmed_count}</div>
              </div>
            </div>

            <div className="result-actions">
              <button className="btn-reset-sim" onClick={handleReset}>
                Try Different Outcome
              </button>
              <button className="btn-new-scenario" onClick={onBack}>
                Create New Scenario
              </button>
            </div>

            {/* Future RL Integration Display */}
            <div className="rl-integration-notice">
              <p>
                <strong>Future Enhancement:</strong> This panel will display RL agent decisions,
                confidence scores, and policy information once the training module is integrated.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Visualization;
