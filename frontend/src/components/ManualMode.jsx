import React, { useState, useRef, useCallback } from 'react';
import { startManualSession, submitManualDecisions } from '../utils/api';
import './ManualMode.css';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const CHAR_EMOJI = {
  Man: '👨', Woman: '👩', Pregnant: '🤰', Stroller: '👶',
  OldMan: '👴', OldWoman: '👵', Boy: '👦', Girl: '👧',
  Homeless: '🧑', LargeWoman: '👩', LargeMan: '👨',
  Criminal: '🦹', MaleExecutive: '👔', FemaleExecutive: '👩‍💼',
  FemaleAthlete: '🏃‍♀️', MaleAthlete: '🏃‍♂️',
  FemaleDoctor: '👩‍⚕️', MaleDoctor: '👨‍⚕️',
  Dog: '🐕', Cat: '🐈', Barricade: '🚧',
};

const emoji = (name) => CHAR_EMOJI[name] || '👤';

/**
 * ManualMode — manual challenge panel.
 *
 * Phases:
 *   config   → user picks how many scenarios (min 10)
 *   active   → one scenario at a time, Stay / Swerve buttons
 *   training → uploading batch to backend
 *   complete → summary + "Run Simulations" button
 *
 * Props:
 *   onRLStep(step)  — drives road animation in Visualization (same contract as RLPanel)
 *   onComplete()    — called when user is ready to switch to RL sim mode
 *   onCancel()      — called when user cancels before finishing
 */
function ManualMode({ onRLStep, onComplete, onCancel }) {
  // ── Phase management ──
  const [phase, setPhase] = useState('config');   // config | active | training | complete

  // ── Config phase ──
  const [nScenarios, setNScenarios] = useState(10);

  // ── Active phase ──
  const [scenarios, setScenarios]       = useState([]);
  const [currentIdx, setCurrentIdx]     = useState(0);
  const [decisions, setDecisions]       = useState([]);
  const [isAnimating, setIsAnimating]   = useState(false);
  const [lastAction, setLastAction]     = useState(null);
  const [lastHarmed, setLastHarmed]     = useState(null);

  // ── Training / complete phase ──
  const [trainResult, setTrainResult]   = useState(null);
  const [loadError, setLoadError]       = useState(null);
  const [trainError, setTrainError]     = useState(null);

  // ── Start the challenge ──
  const handleStart = async () => {
    setLoadError(null);
    setPhase('training');   // re-use training phase label as "loading"
    try {
      const resp = await startManualSession(nScenarios);
      const loaded = resp.scenarios || resp;
      if (!loaded.length) throw new Error('No scenarios returned');

      setScenarios(loaded);
      setCurrentIdx(0);
      setDecisions([]);
      setPhase('active');

      // Show first scenario on the road
      onRLStep({ phase: 'scenario', scenario: loaded[0], episodeNum: 1, totalEpisodes: loaded.length });
    } catch (err) {
      setLoadError(err.message || 'Failed to load scenarios');
      setPhase('config');
    }
  };

  // ── User makes a choice ──
  const handleChoice = useCallback(async (action) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setLastAction(action);

    const sc = scenarios[currentIdx];
    const harmedGroup  = action === 'stay' ? 'pedestrians' : 'passengers';
    const harmedCount  = action === 'stay'
      ? (sc.pedestrians?.length ?? 0)
      : (sc.passengers?.length  ?? 0);

    setLastHarmed(harmedGroup);

    // Brief result animation
    const result = { action, harmed_group: harmedGroup, harmed_count: harmedCount };
    onRLStep({ phase: 'animating', scenario: sc, result, episodeNum: currentIdx + 1, totalEpisodes: scenarios.length });
    await delay(800);
    onRLStep({ phase: 'result',    scenario: sc, result, episodeNum: currentIdx + 1, totalEpisodes: scenarios.length });
    await delay(1200);

    // Record decision
    const updated = [...decisions, { response_id: sc.response_id, action }];
    setDecisions(updated);

    const nextIdx = currentIdx + 1;
    if (nextIdx < scenarios.length) {
      setCurrentIdx(nextIdx);
      setLastAction(null);
      setLastHarmed(null);
      const nextSc = scenarios[nextIdx];
      onRLStep({ phase: 'scenario', scenario: nextSc, episodeNum: nextIdx + 1, totalEpisodes: scenarios.length });
    } else {
      // All done — submit
      onRLStep({ phase: 'done' });
      await handleSubmit(updated);
    }

    setIsAnimating(false);
  }, [isAnimating, currentIdx, scenarios, decisions, onRLStep]);

  // ── Submit batch to backend ──
  const handleSubmit = async (finalDecisions) => {
    setPhase('training');
    setTrainError(null);
    try {
      const res = await submitManualDecisions(finalDecisions);
      setTrainResult(res);
      setPhase('complete');
    } catch (err) {
      setTrainError(err.message || 'Failed to train agent');
      setPhase('complete');
    }
  };

  // ── Render helpers ──
  const currentScenario = scenarios[currentIdx] || null;
  const progressPct     = scenarios.length > 0
    ? Math.round((currentIdx / scenarios.length) * 100)
    : 0;

  // ── Phase: config ──
  if (phase === 'config') {
    return (
      <div className="mm-panel">
        <div className="mm-header">
          <h3>Manual Challenge</h3>
          <p className="mm-subtitle">
            Decide for yourself — the RL agent will learn from your choices.
          </p>
        </div>

        {loadError && <div className="mm-error">{loadError}</div>}

        <div className="mm-section">
          <div className="mm-section-title">How many scenarios?</div>
          <div className="mm-count-row">
            <input
              type="number"
              className="mm-count-input"
              value={nScenarios}
              min={10}
              max={200}
              onChange={e => setNScenarios(Math.max(10, Math.min(200, parseInt(e.target.value) || 10)))}
            />
            <span className="mm-count-hint">min 10 · max 200</span>
          </div>
          <p className="mm-hint">
            You will see {nScenarios} real-world survey scenarios one at a time and choose
            what the AV should do. After you finish, the RL agent trains on your decisions
            and then simulates future scenarios the way you would.
          </p>
        </div>

        <div className="mm-actions">
          <button className="mm-btn mm-btn-start" onClick={handleStart}>
            ▶ Start Challenge
          </button>
          <button className="mm-btn mm-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: training / loading ──
  if (phase === 'training') {
    return (
      <div className="mm-panel mm-panel-center">
        <div className="mm-spinner" />
        <p className="mm-loading-text">
          {decisions.length === 0 ? 'Loading scenarios…' : 'Training RL agent on your decisions…'}
        </p>
        {decisions.length > 0 && (
          <p className="mm-loading-sub">{decisions.length} decisions submitted</p>
        )}
      </div>
    );
  }

  // ── Phase: complete ──
  if (phase === 'complete') {
    return (
      <div className="mm-panel">
        <div className="mm-header">
          <h3>Challenge Complete</h3>
        </div>

        {trainError && <div className="mm-error">{trainError}</div>}

        {trainResult && (
          <div className="mm-section">
            <div className="mm-complete-stats">
              <div className="mm-stat">
                <div className="mm-stat-val">{trainResult.saved_count}</div>
                <div className="mm-stat-lbl">Decisions Saved</div>
              </div>
              <div className="mm-stat">
                <div className="mm-stat-val">{trainResult.trained_count}</div>
                <div className="mm-stat-lbl">Q-Updates</div>
              </div>
            </div>
            <p className="mm-hint">
              Saved to <code className="mm-filename">{trainResult.csv_filename}</code>
            </p>
          </div>
        )}

        <div className="mm-section">
          <p className="mm-hint">
            The RL agent has been trained on your decisions. You can now run simulations
            to see how it predicts your choices on new scenarios.
          </p>
        </div>

        <div className="mm-actions">
          <button className="mm-btn mm-btn-start" onClick={onComplete}>
            ▶ Run Simulations
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: active ──
  if (!currentScenario) return null;

  const lane2IsBarrier = currentScenario.lane2_is_barrier ?? currentScenario.barrier ?? false;
  const lane1Chars     = currentScenario.lane1_chars     ?? currentScenario.pedestrians ?? [];
  const lane2Chars     = currentScenario.lane2_chars     ?? (currentScenario.passengers?.filter(p => p !== 'Barricade') ?? []);

  return (
    <div className="mm-panel">
      <div className="mm-header">
        <h3>Manual Challenge</h3>
        <div className="mm-progress-row">
          <div className="mm-progress-bar">
            <div className="mm-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="mm-progress-label">{currentIdx + 1} / {scenarios.length}</span>
        </div>
      </div>

      {/* Scenario details */}
      <div className="mm-section">
        <div className="mm-section-title">Scenario</div>

        {/* Ethical context banner */}
        {currentScenario.scenario_type && (
          <div className="mm-context-banner">
            <span className={`mm-type-badge type-${(currentScenario.scenario_type || 'random').toLowerCase().replace(' ', '-')}`}>
              {currentScenario.scenario_type}
            </span>
            {currentScenario.attribute_level && currentScenario.attribute_level !== 'Rand' && (
              <span className="mm-attr-label">
                Testing: <strong>{currentScenario.attribute_level}</strong>
              </span>
            )}
            {currentScenario.ped_ped != null && (
              <span className="mm-pedped-badge">
                {currentScenario.ped_ped ? '🚶 Ped vs Ped' : '🚶 Ped vs Passenger'}
              </span>
            )}
          </div>
        )}

        <div className="mm-scenario-info">
          <div className="mm-info-row">
            <span className="mm-label">Signal</span>
            {currentScenario.traffic_light === 'Green' ? (
              <span className="mm-badge badge-green">🚶 Walk (legal)</span>
            ) : currentScenario.traffic_light === 'Red' ? (
              <span className="mm-badge badge-red">🚫 Don't Walk (illegal)</span>
            ) : (
              <span className="mm-badge badge-amber">No signal</span>
            )}
          </div>

          <div className="mm-info-row">
            <span className="mm-label">Lane 1 (straight)</span>
            <span className="mm-chars">
              {lane1Chars.map((c, i) => <span key={i} title={c}>{emoji(c)}</span>)}
              <span className="mm-count"> ×{lane1Chars.length}</span>
            </span>
          </div>

          <div className="mm-info-row">
            <span className="mm-label">{lane2IsBarrier ? 'Lane 2 (barrier)' : 'Lane 2 (swerve)'}</span>
            <span className="mm-chars">
              {lane2IsBarrier
                ? <span title="Barricade">🚧🚧</span>
                : lane2Chars.map((c, i) => <span key={i} title={c}>{emoji(c)}</span>)
              }
              {!lane2IsBarrier && <span className="mm-count"> ×{lane2Chars.length}</span>}
            </span>
          </div>

          {(currentScenario.passengers_in_av?.length > 0) && (
            <div className="mm-info-row">
              <span className="mm-label">AV passengers</span>
              <span className="mm-chars">
                {currentScenario.passengers_in_av.map((c, i) => <span key={i} title={c}>{emoji(c)}</span>)}
                <span className="mm-count"> ×{currentScenario.passengers_in_av.length}</span>
              </span>
            </div>
          )}

          <div className="mm-info-row">
            <span className="mm-label">Crowd leans</span>
            <span className="mm-chars">
              {currentScenario.credences
                ? (currentScenario.credences.deontological >= currentScenario.credences.utilitarian
                    ? `⬇️ Stay (${(currentScenario.credences.deontological * 100).toFixed(0)}%)`
                    : `↘️ Swerve (${(currentScenario.credences.utilitarian * 100).toFixed(0)}%)`)
                : '—'
              }
            </span>
          </div>
        </div>
      </div>

      {/* Decision prompt */}
      <div className="mm-section">
        <div className="mm-section-title">What should the AV do?</div>
        <div className="mm-choice-row">
          <button
            className="mm-btn mm-btn-stay"
            onClick={() => handleChoice('stay')}
            disabled={isAnimating}
          >
            ⬇️ Stay in Lane
            <span className="mm-choice-sub">Pedestrians in lane 1 are harmed</span>
          </button>
          <button
            className="mm-btn mm-btn-swerve"
            onClick={() => handleChoice('swerve')}
            disabled={isAnimating}
          >
            ↘️ Swerve to Lane 2
            <span className="mm-choice-sub">
              {lane2IsBarrier ? 'AV hits barrier' : 'People in lane 2 are harmed'}
            </span>
          </button>
        </div>
      </div>

      <div className="mm-footer-row">
        <button className="mm-btn mm-btn-cancel mm-btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <span className="mm-hint">
          {decisions.length} decision{decisions.length !== 1 ? 's' : ''} recorded
        </span>
      </div>
    </div>
  );
}

export default ManualMode;
