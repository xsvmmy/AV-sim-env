import React, { useState, useCallback } from 'react';
import RLPanel from './RLPanel';
import ManualMode from './ManualMode';
import CharacterSVG from './CharacterSVG';
import CarSVG from './CarSVG';
import CrossingSignalSVG from './CrossingSignalSVG';
import { getRLScenarioRandom, createScenario } from '../utils/api';
import './Visualization.css';

function Visualization({ scenario, onScenarioLoaded }) {
  const [rlPlayback, setRlPlayback]           = useState(null);
  const [loadingScenario, setLoadingScenario] = useState(false);
  const [loadError, setLoadError]             = useState(null);
  const [manualModeActive, setManualModeActive] = useState(false);

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
    } finally {
      setLoadingScenario(false);
    }
  };

  // Driven by RLPanel and ManualMode — each phase transition updates the road
  const handleRLStep = useCallback((step) => {
    setRlPlayback(step.phase === 'done' ? null : step);
  }, []);

  // Manual mode completed — switch back to RL panel mode
  const handleManualComplete = useCallback(() => {
    setManualModeActive(false);
    setRlPlayback(null);
  }, []);

  // Cancel manual mode
  const handleManualCancel = useCallback(() => {
    setManualModeActive(false);
    setRlPlayback(null);
  }, []);

  // RL episode scenario takes priority over scenario prop while running
  const displayScenario    = rlPlayback?.scenario ?? scenario;
  const displayAction      = rlPlayback?.result?.action;
  const displayHarmedGroup = rlPlayback?.result?.harmed_group;

  const lane1Chars     = displayScenario?.lane1_chars     ?? displayScenario?.pedestrians ?? [];
  const lane2Chars     = displayScenario?.lane2_chars     ?? (displayScenario?.passengers?.filter(p => p !== 'Barricade') ?? []);
  const lane1IsBarrier = displayScenario?.lane1_is_barrier ?? false;
  const lane2IsBarrier = displayScenario?.lane2_is_barrier ?? (displayScenario?.passengers?.includes('Barricade') ?? false);
  const passengersInAV = displayScenario?.passengers_in_av ?? [];
  const isPedPed       = displayScenario?.ped_ped ?? false;

  // Per-lane crossing signal states for the SVG signal boxes.
  // In ped_ped scenarios each lane has its own independent signal.
  const toSigState = (tl) => tl === 'Green' ? 'green' : tl === 'Red' ? 'red' : 'none';
  const lane1Signal = toSigState(
    isPedPed
      ? (displayScenario?.lane1_traffic_light ?? displayScenario?.traffic_light)
      : displayScenario?.traffic_light
  );
  const lane2Signal = toSigState(
    isPedPed ? displayScenario?.lane2_traffic_light : null
  );

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

  const isRLRunning = !!rlPlayback;

  return (
    <div className="visualization container">
      <div className="viz-header">
        <h2>Simulation Visualization</h2>

        {loadError && <span className="viz-load-error">{loadError}</span>}

        <div className="viz-header-buttons">
          <button
            className="btn-load-random"
            onClick={handleLoadRandom}
            disabled={loadingScenario || isRLRunning || manualModeActive}
            title={isRLRunning ? 'Wait for the current run to finish' : 'Load a new random scenario'}
          >
            {loadingScenario ? 'Loading…' : '🎲 Random Scenario'}
          </button>

          <button
            className="btn-manual-challenge"
            onClick={() => setManualModeActive(true)}
            disabled={isRLRunning || manualModeActive || loadingScenario}
            title="Solve scenarios manually — the RL agent will learn from your choices"
          >
            🧠 Manual Challenge
          </button>
        </div>


        {/* Mode description — shown after a method is chosen */}
        {manualModeActive && (
          <div className="viz-mode-desc viz-mode-desc--manual">
            <strong>Manual Challenge</strong> — You'll be shown real AV dilemmas from the MIT Moral Machine
            dataset one at a time. Choose <em>Stay</em> or <em>Swerve</em> for each scenario.
            Once you finish, the RL agent trains on your decisions and can then simulate future
            scenarios the way you would decide.
          </div>
        )}
        {scenario && !manualModeActive && (
          <div className="viz-mode-desc viz-mode-desc--random">
            <strong>Random Scenario</strong> — A dilemma from the MIT Moral Machine dataset has been loaded.
            Use the RL panel below to run the agent — it will predict your choice (Stay or Swerve).
            Confirm or correct each prediction to help the agent learn your moral preferences in real time.
          </div>
        )}
      </div>

      <div className="viz-main section">

        {/* Compact info bar */}
        {displayScenario && (
          <div className="scenario-info-bar">
            {isPedPed ? (
              // Ped-ped: show each lane's independent signal
              <>
                <span className="sig-badge sig-amber">Ped vs Ped</span>
                <span className={`sig-badge ${lane1Signal === 'green' ? 'sig-green' : lane1Signal === 'red' ? 'sig-red' : 'sig-amber'}`}>
                  Lane 1 {lane1Signal === 'green' ? '🚶 Walk' : lane1Signal === 'red' ? '🚫 No Walk' : '— No signal'}
                </span>
                <span className={`sig-badge ${lane2Signal === 'green' ? 'sig-green' : lane2Signal === 'red' ? 'sig-red' : 'sig-amber'}`}>
                  Lane 2 {lane2Signal === 'green' ? '🚶 Walk' : lane2Signal === 'red' ? '🚫 No Walk' : '— No signal'}
                </span>
              </>
            ) : (
              // Standard: one shared signal for pedestrians
              displayScenario.traffic_light === 'None' || !displayScenario.traffic_light ? (
                <span className="sig-badge sig-amber">No signal</span>
              ) : displayScenario.traffic_light === 'Green' ? (
                <span className="sig-badge sig-green">🚶 Walk (legal)</span>
              ) : (
                <span className="sig-badge sig-red">🚫 Don't Walk (illegal)</span>
              )
            )}
            {!isPedPed && passengersInAV.length > 0 && (
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

          {/* Lane 1 */}
          {displayScenario && (
            <div className={`road-group road-group-1 ${isLane1Harmed && !lane1IsBarrier ? 'road-group-harmed' : ''}`}>
              <div className="road-group-chars">
                {lane1IsBarrier
                  ? <><CharacterSVG type="Barricade" size={42} /><CharacterSVG type="Barricade" size={42} /></>
                  : lane1Chars.map((p, i) => (
                      <CharacterSVG
                        key={i}
                        type={p}
                        size={42}
                        fill={isLane1Harmed ? '#ef4444' : '#e8e8e8'}
                      />
                    ))
                }
              </div>
              {isLane1Harmed && !lane1IsBarrier && (
                <div className="road-harm-label">✕ Impact</div>
              )}
            </div>
          )}

          {/* Crossing signals — left and right edges, per-lane in ped_ped mode */}
          {displayScenario && (
            <>
              <div className="road-signal road-signal-left">
                <CrossingSignalSVG state={lane1Signal} height={72} />
              </div>
              <div className="road-signal road-signal-right">
                <CrossingSignalSVG state={isPedPed ? lane2Signal : lane1Signal} height={72} />
              </div>
            </>
          )}

          {/* Median barrier — only shown in ped_ped scenarios */}
          {displayScenario && isPedPed && (
            <div className="road-crosswalk-median" />
          )}

          {/* Lane 2 */}
          {displayScenario && (
            <div className={`road-group road-group-2 ${isLane2Harmed && !lane2IsBarrier ? 'road-group-harmed' : ''}`}>
              <div className="road-group-chars">
                {lane2IsBarrier
                  ? <><CharacterSVG type="Barricade" size={42} /><CharacterSVG type="Barricade" size={42} /></>
                  : lane2Chars.map((p, i) => (
                      <CharacterSVG
                        key={i}
                        type={p}
                        size={42}
                        fill={isLane2Harmed ? '#ef4444' : '#e8e8e8'}
                      />
                    ))
                }
              </div>
              {isLane2Harmed && !lane2IsBarrier && (
                <div className="road-harm-label">✕ Impact</div>
              )}
            </div>
          )}

          {/* AV — in ped_ped scenarios the vehicle is unoccupied, no cabin shown */}
          <div className={`road-av ${getAVClass()} ${isAVHarmed ? 'road-av-harmed' : ''}`}>
            {!isPedPed && passengersInAV.length > 0 && (
              <div className="av-cabin">
                {passengersInAV.map((p, i) => (
                  <CharacterSVG key={i} type={p} size={20} fill="#93c5fd" />
                ))}
              </div>
            )}
            <CarSVG width={48} harmed={isAVHarmed} />
          </div>

          {/* Empty-state prompt */}
          {!scenario && !rlPlayback && (
            <div className="road-empty-overlay">
              <span>
                Click <strong>🎲 Random Scenario</strong> to load a dilemma,
                or <strong>🧠 Manual Challenge</strong> to decide yourself.
              </span>
            </div>
          )}

          {/* Idle prompt */}
          {scenario && !rlPlayback && !manualModeActive && (
            <div className="road-idle-overlay">
              <span>Use the RL Panel below to run simulations</span>
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

          {/* Agent deciding overlay */}
          {rlPlayback?.phase === 'deciding' && (
            <div className="road-rl-deciding">🤖 Agent deciding…</div>
          )}
        </div>
      </div>

      {/* ── Panel area: Manual Mode OR RL Panel ── */}
      {manualModeActive ? (
        <ManualMode
          onRLStep={handleRLStep}
          onComplete={handleManualComplete}
          onCancel={handleManualCancel}
        />
      ) : (
        scenario && <RLPanel scenario={scenario} onRLStep={handleRLStep} />
      )}
    </div>
  );
}

export default Visualization;
