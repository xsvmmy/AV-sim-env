import React, { useState, useCallback } from 'react';
import RLPanel from './RLPanel';
import { getRLScenarioRandom, createScenario } from '../utils/api';
import './Visualization.css';

function Visualization({ scenario, onScenarioLoaded }) {
  const [rlPlayback, setRlPlayback]       = useState(null);
  const [loadingScenario, setLoadingScenario] = useState(false);
  const [loadError, setLoadError]         = useState(null);

  const getCharacterEmoji = (name) => {
    const emojiMap = {
      'Man': '👨', 'Woman': '👩', 'Pregnant': '🤰', 'Stroller': '👶',
      'OldMan': '👴', 'OldWoman': '👵', 'Boy': '👦', 'Girl': '👧',
      'Homeless': '🧑', 'LargeWoman': '👩', 'LargeMan': '👨',
      'Criminal': '🦹', 'MaleExecutive': '👔', 'FemaleExecutive': '👩‍💼',
      'FemaleAthlete': '🏃‍♀️', 'MaleAthlete': '🏃‍♂️',
      'FemaleDoctor': '👩‍⚕️', 'MaleDoctor': '👨‍⚕️',
      'Dog': '🐕', 'Cat': '🐈', 'Barricade': '🚧',
    };
    return emojiMap[name] || '👤';
  };

  const handleLoadRandom = async () => {
    setLoadingScenario(true);
    setLoadError(null);
    try {
      const csvScenario = await getRLScenarioRandom();
      const created = await createScenario({
        passengers:    csvScenario.passengers,
        pedestrians:   csvScenario.pedestrians,
        traffic_light: csvScenario.traffic_light,
      });
      onScenarioLoaded({ ...csvScenario, ...created });
    } catch (err) {
      setLoadError(err.message || 'Failed to load scenario');
      console.error('Error loading random scenario:', err);
    } finally {
      setLoadingScenario(false);
    }
  };

  // Driven by RLPanel — each phase transition updates the road animation
  const handleRLStep = useCallback((step) => {
    setRlPlayback(step.phase === 'done' ? null : step);
  }, []);

  // RL episode scenario takes priority over the scenario prop while running;
  // when RL finishes (rlPlayback → null), the scenario prop keeps characters visible.
  const displayScenario    = rlPlayback?.scenario ?? scenario;
  const displayAction      = rlPlayback?.result?.action;
  const displayHarmedGroup = rlPlayback?.result?.harmed_group;

  // New fields with fallbacks for backward compatibility
  const lane1Chars     = displayScenario?.lane1_chars     ?? displayScenario?.pedestrians ?? [];
  const lane2Chars     = displayScenario?.lane2_chars     ?? (displayScenario?.passengers?.filter(p => p !== 'Barricade') ?? []);
  const lane1IsBarrier = displayScenario?.lane1_is_barrier ?? false;
  const lane2IsBarrier = displayScenario?.lane2_is_barrier ?? (displayScenario?.passengers?.includes('Barricade') ?? false);
  const passengersInAV = displayScenario?.passengers_in_av ?? [];

  const activeAnimPhase = (() => {
    if (!rlPlayback) return 'initial';
    switch (rlPlayback.phase) {
      case 'scenario':  return 'initial';
      case 'deciding':  return 'action';
      case 'animating': return 'action';
      case 'result':    return 'result';
      default:          return 'initial';
    }
  })();

  const getAVClass = () => {
    if (activeAnimPhase === 'initial') return 'av-initial';
    if (activeAnimPhase === 'action' || activeAnimPhase === 'result') {
      if (displayAction === 'swerve') return 'av-swerving';
      if (displayAction === 'stay')   return 'av-staying';
    }
    return 'av-initial';
  };

  const isLane1Harmed = activeAnimPhase === 'result' && displayHarmedGroup === 'pedestrians';
  const isLane2Harmed = activeAnimPhase === 'result' && displayHarmedGroup === 'passengers';
  const isAVHarmed    = (isLane1Harmed && lane1IsBarrier) || (isLane2Harmed && lane2IsBarrier);

  // Disable the load button while the RL agent is actively running
  const isRLRunning = !!rlPlayback;

  return (
    <div className="visualization container">
      <div className="viz-header">
        <h2>Simulation Visualization</h2>

        {loadError && (
          <span className="viz-load-error">{loadError}</span>
        )}

        <button
          className="btn-load-random"
          onClick={handleLoadRandom}
          disabled={loadingScenario || isRLRunning}
          title={isRLRunning ? 'Wait for the current run to finish' : 'Load a new random scenario'}
        >
          {loadingScenario ? 'Loading…' : '🎲 Random Scenario'}
        </button>

        {rlPlayback?.episodeNum != null && (
          <div className="rl-ep-counter">
            Episode {rlPlayback.episodeNum} / {rlPlayback.totalEpisodes}
          </div>
        )}
      </div>

      <div className="viz-main section">

        {/* Compact info bar — only shown when a scenario is loaded */}
        {displayScenario && (
          <div className="scenario-info-bar">
            <span className={`sig-badge ${displayScenario.traffic_light === 'Green' ? 'sig-green' : 'sig-red'}`}>
              {displayScenario.traffic_light === 'Green' ? '🚶 Walk' : '🚫 Don\'t Walk'}
            </span>
            {passengersInAV.length > 0 && (
              <span className="lane-stat">
                🚙 AV · {passengersInAV.length} passenger{passengersInAV.length !== 1 ? 's' : ''}
              </span>
            )}
            <span className="lane-stat">
              Lane 1 · {lane1IsBarrier ? '🚧 Barrier' : `${lane1Chars.length} pedestrian${lane1Chars.length !== 1 ? 's' : ''}`}
            </span>
            <span className="lane-stat">
              Lane 2 · {lane2IsBarrier ? '🚧 Barrier' : `${lane2Chars.length} person${lane2Chars.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        )}

        {/* ── Two-lane road ── */}
        <div className="road-container">

          <div className="road-lane-label road-lane-label-1">LANE 1 — AV</div>
          <div className="road-lane-label road-lane-label-2">LANE 2 — SWERVE</div>

          <div className="road-lane-divider" />
          <div className="road-dir-arrow road-dir-1">▼</div>
          <div className="road-dir-arrow road-dir-2">▼</div>
          <div className="road-crosswalk" />

          {/* Lane 1: pedestrians or barrier — only rendered once a scenario is loaded */}
          {displayScenario && (
            <div className={`road-group road-group-1 ${isLane1Harmed && !lane1IsBarrier ? 'road-group-harmed' : ''}`}>
              <div className="road-group-chars">
                {lane1IsBarrier
                  ? <span className="road-char road-char-barrier">🚧🚧</span>
                  : lane1Chars.map((p, i) => (
                      <span key={i} className="road-char" title={p}>{getCharacterEmoji(p)}</span>
                    ))
                }
              </div>
              {isLane1Harmed && !lane1IsBarrier && <div className="road-harm-burst">💥</div>}
            </div>
          )}

          {/* Traffic signal — only shown once a scenario is loaded */}
          {displayScenario && (
            <div className={`road-signal ${displayScenario.traffic_light === 'Green' ? 'road-signal-green' : 'road-signal-red'}`}>
              {displayScenario.traffic_light === 'Green' ? '🚶' : '🚫'}
            </div>
          )}

          {/* Lane 2: pedestrians or barrier — only rendered once a scenario is loaded */}
          {displayScenario && (
            <div className={`road-group road-group-2 ${isLane2Harmed && !lane2IsBarrier ? 'road-group-harmed' : ''}`}>
              <div className="road-group-chars">
                {lane2IsBarrier
                  ? <span className="road-char road-char-barrier">🚧🚧</span>
                  : lane2Chars.map((p, i) => (
                      <span key={i} className="road-char" title={p}>{getCharacterEmoji(p)}</span>
                    ))
              }
              </div>
              {isLane2Harmed && !lane2IsBarrier && <div className="road-harm-burst">💥</div>}
            </div>
          )}

          {/* Autonomous vehicle */}
          <div className={`road-av ${getAVClass()} ${isAVHarmed ? 'road-av-harmed' : ''}`}>
            {passengersInAV.length > 0 && (
              <div className="av-cabin">
                {passengersInAV.map((p, i) => (
                  <span key={i} className="av-passenger" title={p}>{getCharacterEmoji(p)}</span>
                ))}
              </div>
            )}
            <div className="road-av-icon">🚙</div>
            {isAVHarmed && <div className="av-harm-indicator">💥</div>}
          </div>

          {/* Empty-state prompt — shown before any scenario is loaded */}
          {!scenario && !rlPlayback && (
            <div className="road-empty-overlay">
              <span>Click <strong>🎲 Random Scenario</strong> above to load a dilemma</span>
            </div>
          )}

          {/* Idle prompt — shown after a scenario is loaded but RL hasn't started yet */}
          {scenario && !rlPlayback && (
            <div className="road-idle-overlay">
              <span>Use the RL Panel below to run the simulation</span>
            </div>
          )}

          {/* Action result label */}
          {activeAnimPhase === 'result' && (
            <div className="road-result-overlay">
              {displayAction === 'stay' ? '⬇️ Stayed in Lane 1' : '↘️ Swerved to Lane 2'}
            </div>
          )}

          {/* RL loading overlay */}
          {rlPlayback?.phase === 'loading' && (
            <div className="road-rl-overlay">
              <div className="road-rl-spinner" />
              <p>Loading scenario…</p>
            </div>
          )}

          {/* RL deciding overlay */}
          {rlPlayback?.phase === 'deciding' && (
            <div className="road-rl-deciding">🤖 Agent deciding…</div>
          )}
        </div>
      </div>

      {/* RLPanel only appears once a scenario has been loaded.
          Pass the loaded scenario so the agent always trains on the same one. */}
      {scenario && <RLPanel scenario={scenario} onRLStep={handleRLStep} />}
    </div>
  );
}

export default Visualization;
