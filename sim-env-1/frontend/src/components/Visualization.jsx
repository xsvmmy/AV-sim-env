import React, { useState, useCallback } from 'react';
import RLPanel from './RLPanel';
import ScenarioRoad from './ScenarioRoad';
import { getRLScenarioRandom, createScenario } from '../utils/api';
import './Visualization.css';

function Visualization({ scenario, onScenarioLoaded }) {
  const [rlPlayback, setRlPlayback]         = useState(null);
  const [rlCompleted, setRlCompleted]       = useState(false);
  const [loadingScenario, setLoadingScenario] = useState(false);
  const [loadError, setLoadError]           = useState(null);

  const handleLoadRandom = async () => {
    setLoadingScenario(true);
    setLoadError(null);
    setRlCompleted(false);
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

  const handleRLStep = useCallback((step) => {
    if (step.phase === 'done') {
      setRlPlayback(null);
      setRlCompleted(true);
    } else {
      setRlPlayback(step);
    }
  }, []);

  const displayScenario    = rlPlayback?.scenario ?? scenario;
  const displayAction      = rlPlayback?.result?.action;
  const displayHarmedGroup = rlPlayback?.result?.harmed_group;

  const lane1Chars     = displayScenario?.lane1_chars     ?? displayScenario?.pedestrians ?? [];
  const lane2Chars     = displayScenario?.lane2_chars     ?? (displayScenario?.passengers?.filter(p => p !== 'Barricade') ?? []);
  const lane1IsBarrier = displayScenario?.lane1_is_barrier ?? false;
  const lane2IsBarrier = displayScenario?.lane2_is_barrier ?? (displayScenario?.passengers?.includes('Barricade') ?? false);
  const passengersInAV = displayScenario?.passengers_in_av ?? [];
  const lane1Signal    = displayScenario?.lane1_signal ?? null;
  const lane2Signal    = displayScenario?.lane2_signal ?? null;

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
          {loadingScenario ? 'Loading…' : 'Random Scenario'}
        </button>

        {rlPlayback?.episodeNum != null && (
          <div className="rl-ep-counter">
            Episode {rlPlayback.episodeNum} / {rlPlayback.totalEpisodes}
          </div>
        )}
      </div>

      <div className="viz-main section">

        {/* Compact info bar */}
        {displayScenario && (
          <div className="scenario-info-bar">
            {lane1Signal && (
              <span className={`sig-badge ${lane1Signal === 'Green' ? 'sig-green' : 'sig-red'}`}>
                <span className="sig-dot" />
                L1 {lane1Signal === 'Green' ? 'Walk' : 'Stop'}
              </span>
            )}
            {lane2Signal && (
              <span className={`sig-badge ${lane2Signal === 'Green' ? 'sig-green' : 'sig-red'}`}>
                <span className="sig-dot" />
                L2 {lane2Signal === 'Green' ? 'Walk' : 'Stop'}
              </span>
            )}
            {!lane1Signal && !lane2Signal && (
              <span className={`sig-badge ${displayScenario.traffic_light === 'Green' ? 'sig-green' : 'sig-red'}`}>
                <span className="sig-dot" />
                {displayScenario.traffic_light === 'Green' ? 'Walk' : 'Stop'}
              </span>
            )}
            {passengersInAV.length > 0 && (
              <span className="lane-stat">
                AV · {passengersInAV.length} passenger{passengersInAV.length !== 1 ? 's' : ''}
              </span>
            )}
            <span className="lane-stat">
              Lane 1 · {lane1IsBarrier ? 'Barrier' : `${lane1Chars.length} ped${lane1Chars.length !== 1 ? 's' : ''}`}
            </span>
            <span className="lane-stat">
              Lane 2 · {lane2IsBarrier ? 'Barrier' : `${lane2Chars.length} ped${lane2Chars.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        )}

        <ScenarioRoad
          scenario={displayScenario}
          action={displayAction}
          animPhase={activeAnimPhase}
          harmedGroup={displayHarmedGroup}
          showLoadingOverlay={rlPlayback?.phase === 'loading'}
          showDecidingOverlay={rlPlayback?.phase === 'deciding'}
          showEmptyOverlay={!scenario && !rlPlayback}
          showIdleOverlay={!!scenario && !rlPlayback && !rlCompleted}
        />

        {rlCompleted && !isRLRunning && (
          <div className="viz-next-row">
            <button
              className="btn-next-scenario"
              onClick={handleLoadRandom}
              disabled={loadingScenario}
            >
              {loadingScenario ? 'Loading…' : 'Next Scenario'}
            </button>
          </div>
        )}
      </div>

      {scenario && <RLPanel scenario={scenario} onRLStep={handleRLStep} />}
    </div>
  );
}

export default Visualization;
