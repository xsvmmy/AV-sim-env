import React, { useState, useCallback, useRef, useEffect } from 'react';
import { getRLScenarioRandom, trainCustomAgent, predictWithCustomAgent } from '../utils/api';
import './Visualization.css';
import './CustomModelMode.css';

const EMOJI_MAP = {
  Man: '👨', Woman: '👩', Pregnant: '🤰', Stroller: '👶',
  OldMan: '👴', OldWoman: '👵', Boy: '👦', Girl: '👧',
  Homeless: '🧑', LargeWoman: '👩', LargeMan: '👨',
  Criminal: '🦹', MaleExecutive: '👔', FemaleExecutive: '👩‍💼',
  FemaleAthlete: '🏃‍♀️', MaleAthlete: '🏃‍♂️',
  FemaleDoctor: '👩‍⚕️', MaleDoctor: '👨‍⚕️',
  Dog: '🐕', Cat: '🐈', Barricade: '🚧',
};
const charEmoji = (name) => EMOJI_MAP[name] || '👤';

// ── Shared road visualization ─────────────────────────────────────────────

function ScenarioRoad({ scenario, action, animPhase, harmedGroup, showLoadingOverlay, showDecidingOverlay }) {
  if (!scenario) {
    return (
      <div className="road-container">
        {showLoadingOverlay ? (
          <div className="road-rl-overlay">
            <div className="road-rl-spinner" />
            <p>Loading scenario…</p>
          </div>
        ) : (
          <div className="road-empty-overlay"><span>Loading…</span></div>
        )}
      </div>
    );
  }

  const lane1Chars     = scenario.lane1_chars     ?? scenario.pedestrians ?? [];
  const lane2Chars     = scenario.lane2_chars     ?? (scenario.passengers?.filter(p => p !== 'Barricade') ?? []);
  const lane1IsBarrier = scenario.lane1_is_barrier ?? false;
  const lane2IsBarrier = scenario.lane2_is_barrier ?? (scenario.passengers?.includes('Barricade') ?? false);
  const passengersInAV = scenario.passengers_in_av ?? [];

  const effectiveHarmed = harmedGroup
    ?? (action === 'stay' ? 'pedestrians' : action === 'swerve' ? 'passengers' : null);

  const isLane1Harmed = animPhase === 'result' && effectiveHarmed === 'pedestrians';
  const isLane2Harmed = animPhase === 'result' && effectiveHarmed === 'passengers';
  const isAVHarmed    = (isLane1Harmed && lane1IsBarrier) || (isLane2Harmed && lane2IsBarrier);

  const avClass = !action || animPhase === 'idle'
    ? 'av-initial'
    : action === 'swerve' ? 'av-swerving' : 'av-staying';

  return (
    <div className="road-container">
      <div className="road-lane-label road-lane-label-1">LANE 1 — AV</div>
      <div className="road-lane-label road-lane-label-2">LANE 2 — SWERVE</div>
      <div className="road-lane-divider" />
      <div className="road-dir-arrow road-dir-1">▼</div>
      <div className="road-dir-arrow road-dir-2">▼</div>
      <div className="road-crosswalk" />

      <div className={`road-group road-group-1 ${isLane1Harmed && !lane1IsBarrier ? 'road-group-harmed' : ''}`}>
        <div className="road-group-chars">
          {lane1IsBarrier
            ? <span className="road-char road-char-barrier">🚧🚧</span>
            : lane1Chars.map((p, i) => <span key={i} className="road-char" title={p}>{charEmoji(p)}</span>)}
        </div>
        {isLane1Harmed && !lane1IsBarrier && <div className="road-harm-burst">💥</div>}
      </div>

      <div className={`road-signal ${scenario.traffic_light === 'Green' ? 'road-signal-green' : 'road-signal-red'}`}>
        {scenario.traffic_light === 'Green' ? '🚶' : '🚫'}
      </div>

      <div className={`road-group road-group-2 ${isLane2Harmed && !lane2IsBarrier ? 'road-group-harmed' : ''}`}>
        <div className="road-group-chars">
          {lane2IsBarrier
            ? <span className="road-char road-char-barrier">🚧🚧</span>
            : lane2Chars.map((p, i) => <span key={i} className="road-char" title={p}>{charEmoji(p)}</span>)}
        </div>
        {isLane2Harmed && !lane2IsBarrier && <div className="road-harm-burst">💥</div>}
      </div>

      <div className={`road-av ${avClass} ${isAVHarmed ? 'road-av-harmed' : ''}`}>
        {passengersInAV.length > 0 && (
          <div className="av-cabin">
            {passengersInAV.map((p, i) => <span key={i} className="av-passenger" title={p}>{charEmoji(p)}</span>)}
          </div>
        )}
        <div className="road-av-icon">🚙</div>
        {isAVHarmed && <div className="av-harm-indicator">💥</div>}
      </div>

      {animPhase === 'result' && action && (
        <div className="road-result-overlay">
          {action === 'stay' ? '⬇️ Stayed in Lane 1' : '↘️ Swerved to Lane 2'}
        </div>
      )}
      {showDecidingOverlay && (
        <div className="road-rl-deciding">🤖 Agent deciding…</div>
      )}
      {showLoadingOverlay && (
        <div className="road-rl-overlay">
          <div className="road-rl-spinner" />
          <p>Loading scenario…</p>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

const COUNT_PRESETS = [10, 25, 50];

function CustomModelMode() {
  const [phase, setPhase]         = useState('setup');
  const [totalScenarios, setTotalScenarios] = useState(10);
  const [customCount, setCustomCount]       = useState('');

  // Labeling state
  const [labels, setLabels]                   = useState([]);
  const [currentScenario, setCurrentScenario] = useState(null);
  const [labelSubPhase, setLabelSubPhase]     = useState('loading');
  const [userChoice, setUserChoice]           = useState(null);
  const [animPhase, setAnimPhase]             = useState('idle');

  // Naming
  const [agentName, setAgentName] = useState('');

  // Done / testing
  const [createdAgent, setCreatedAgent]     = useState(null);
  const [testScenario, setTestScenario]     = useState(null);
  const [testSubPhase, setTestSubPhase]     = useState('loading');
  const [agentDecision, setAgentDecision]   = useState(null);

  const [error, setError] = useState(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // ── Scenario loading ───────────────────────────────────────────────────

  const loadLabelScenario = useCallback(async () => {
    if (!mounted.current) return;
    setLabelSubPhase('loading');
    setCurrentScenario(null);
    setUserChoice(null);
    setAnimPhase('idle');
    setError(null);
    try {
      const s = await getRLScenarioRandom();
      if (!mounted.current) return;
      setCurrentScenario(s);
      setLabelSubPhase('choosing');
    } catch (e) {
      if (mounted.current) setError(e.message || 'Failed to load scenario');
    }
  }, []);

  // ── Setup ─────────────────────────────────────────────────────────────

  const handleCountPreset = (n) => { setTotalScenarios(n); setCustomCount(''); };
  const handleCustomCount = (e) => {
    const val = e.target.value;
    setCustomCount(val);
    const n = parseInt(val);
    if (n > 0 && n <= 200) setTotalScenarios(n);
  };
  const handleStart = () => {
    setLabels([]);
    setPhase('labeling');
    loadLabelScenario();
  };

  // ── Labeling ──────────────────────────────────────────────────────────

  const handleChoice = async (choice) => {
    setUserChoice(choice);
    await new Promise(r => setTimeout(r, 400));
    if (!mounted.current) return;
    setAnimPhase('result');
    setLabelSubPhase('decided');
  };

  const handleRedo = () => {
    setUserChoice(null);
    setAnimPhase('idle');
    setLabelSubPhase('choosing');
  };

  const handleNext = () => {
    const newLabels = [...labels, { scenario: currentScenario, choice: userChoice }];
    setLabels(newLabels);
    if (newLabels.length >= totalScenarios) {
      setPhase('naming');
    } else {
      loadLabelScenario();
    }
  };

  // ── Training ──────────────────────────────────────────────────────────

  const handleCreateAgent = async () => {
    const trimmed = agentName.trim();
    if (!trimmed) return;
    setPhase('training');
    setError(null);
    await new Promise(r => setTimeout(r, 1500));
    try {
      const agent = await trainCustomAgent(
        trimmed,
        labels.map(l => ({ response_id: l.scenario.response_id, choice: l.choice }))
      );
      if (!mounted.current) return;
      setCreatedAgent(agent);
      setPhase('done');
    } catch (e) {
      if (!mounted.current) return;
      setError(e.message || 'Training failed');
      setPhase('naming');
    }
  };

  // ── Testing ───────────────────────────────────────────────────────────

  const loadTestScenario = useCallback(async (name) => {
    if (!mounted.current) return;
    setTestSubPhase('loading');
    setTestScenario(null);
    setAgentDecision(null);
    setError(null);
    try {
      const s = await getRLScenarioRandom();
      if (!mounted.current) return;
      setTestScenario(s);
      setTestSubPhase('deciding');
      await new Promise(r => setTimeout(r, 900));
      if (!mounted.current) return;
      const decision = await predictWithCustomAgent(name, s.passengers, s.pedestrians, s.traffic_light);
      if (!mounted.current) return;
      setAgentDecision(decision);
      setTestSubPhase('result');
    } catch (e) {
      if (mounted.current) setError(e.message || 'Failed to run agent');
    }
  }, []);

  const handleStartTesting = () => {
    setPhase('testing');
    loadTestScenario(createdAgent.name);
  };

  const handleNextTest = () => loadTestScenario(createdAgent.name);

  const completedCount = phase === 'labeling' ? labels.length : 0;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="cm-container">

      {/* SETUP */}
      {phase === 'setup' && (
        <div className="cm-card cm-setup">
          <h2 className="cm-title">🤖 Custom Model</h2>
          <p className="cm-desc">
            Label a set of ethical dilemma scenarios with your own moral choices.
            We'll train a personal RL agent that reflects your preferences.
          </p>
          <div className="cm-field">
            <label className="cm-label">How many scenarios do you want to label?</label>
            <div className="cm-count-row">
              {COUNT_PRESETS.map(n => (
                <button
                  key={n}
                  className={`cm-count-btn ${totalScenarios === n && !customCount ? 'cm-count-btn-active' : ''}`}
                  onClick={() => handleCountPreset(n)}
                >{n}</button>
              ))}
              <input
                type="number"
                className="cm-count-input"
                placeholder="custom"
                min={1}
                max={200}
                value={customCount}
                onChange={handleCustomCount}
              />
            </div>
            <p className="cm-hint">Selected: <strong>{totalScenarios} scenarios</strong></p>
          </div>
          <button className="cm-btn cm-btn-primary cm-btn-lg" onClick={handleStart}>
            Start Labeling →
          </button>
        </div>
      )}

      {/* LABELING */}
      {phase === 'labeling' && (
        <div className="cm-card cm-labeling">
          <div className="cm-progress-wrap">
            <div className="cm-progress-bar">
              <div
                className="cm-progress-fill"
                style={{ width: `${(completedCount / totalScenarios) * 100}%` }}
              />
            </div>
            <span className="cm-progress-text">
              {completedCount + 1} / {totalScenarios}
            </span>
          </div>

          {error && <div className="cm-error">{error}</div>}

          <ScenarioRoad
            scenario={currentScenario}
            action={userChoice}
            animPhase={animPhase}
            harmedGroup={null}
            showLoadingOverlay={labelSubPhase === 'loading'}
            showDecidingOverlay={false}
          />

          {labelSubPhase === 'choosing' && (
            <div className="cm-choice-section">
              <p className="cm-choice-prompt">What would you choose?</p>
              <div className="cm-choice-row">
                <button className="cm-choice-btn cm-choice-stay" onClick={() => handleChoice('stay')}>
                  <span className="cm-choice-icon">⬇️</span>
                  <span className="cm-choice-main">Stay in Lane</span>
                  <span className="cm-choice-sub">Pedestrians at risk</span>
                </button>
                <button className="cm-choice-btn cm-choice-swerve" onClick={() => handleChoice('swerve')}>
                  <span className="cm-choice-icon">↘️</span>
                  <span className="cm-choice-main">Swerve</span>
                  <span className="cm-choice-sub">Passengers at risk</span>
                </button>
              </div>
            </div>
          )}

          {labelSubPhase === 'decided' && (
            <div className="cm-decided-section">
              <p className="cm-decided-label">
                You chose:{' '}
                <strong className={`cm-choice-tag cm-tag-${userChoice}`}>
                  {userChoice === 'stay' ? '⬇️ Stay in Lane' : '↘️ Swerve'}
                </strong>
              </p>
              <div className="cm-nav-row">
                <button className="cm-btn cm-btn-ghost" onClick={handleRedo}>↩ Redo</button>
                <button className="cm-btn cm-btn-primary" onClick={handleNext}>
                  {completedCount + 1 >= totalScenarios ? 'Finish →' : 'Next →'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* NAMING */}
      {phase === 'naming' && (
        <div className="cm-card cm-naming">
          <div className="cm-big-icon">✅</div>
          <h2 className="cm-title">All {totalScenarios} scenarios labeled!</h2>
          <p className="cm-desc">Give your agent a name before we train it.</p>
          <div className="cm-field">
            <label className="cm-label">Agent name</label>
            <input
              type="text"
              className="cm-text-input"
              placeholder="e.g. My Moral Agent"
              maxLength={40}
              value={agentName}
              onChange={e => setAgentName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && agentName.trim() && handleCreateAgent()}
              autoFocus
            />
          </div>
          {error && <div className="cm-error">{error}</div>}
          <button
            className="cm-btn cm-btn-primary cm-btn-lg"
            onClick={handleCreateAgent}
            disabled={!agentName.trim()}
          >
            Create Agent
          </button>
        </div>
      )}

      {/* TRAINING */}
      {phase === 'training' && (
        <div className="cm-card cm-training">
          <div className="cm-training-spinner" />
          <h2 className="cm-title">Training "{agentName}"…</h2>
          <p className="cm-desc">Deriving your moral credences from your choices.</p>
        </div>
      )}

      {/* DONE */}
      {phase === 'done' && createdAgent && (
        <div className="cm-card cm-done">
          <div className="cm-big-icon">🎉</div>
          <h2 className="cm-title">Agent "{createdAgent.name}" created!</h2>
          <p className="cm-desc">
            Trained on {createdAgent.training_count} scenarios. Your moral profile:
          </p>
          <div className="cm-credence-block">
            <div className="cm-credence-row">
              <span className="cm-cred-label">Deontological (stay)</span>
              <div className="cm-bar-track">
                <div className="cm-bar cm-bar-deont"
                  style={{ width: `${(createdAgent.credences.deontological * 100).toFixed(1)}%` }} />
              </div>
              <span className="cm-cred-pct">
                {(createdAgent.credences.deontological * 100).toFixed(1)}%
              </span>
            </div>
            <div className="cm-credence-row">
              <span className="cm-cred-label">Utilitarian (swerve)</span>
              <div className="cm-bar-track">
                <div className="cm-bar cm-bar-util"
                  style={{ width: `${(createdAgent.credences.utilitarian * 100).toFixed(1)}%` }} />
              </div>
              <span className="cm-cred-pct">
                {(createdAgent.credences.utilitarian * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <button className="cm-btn cm-btn-primary cm-btn-lg" onClick={handleStartTesting}>
            🧪 Test Your Agent
          </button>
        </div>
      )}

      {/* TESTING */}
      {phase === 'testing' && createdAgent && (
        <div className="cm-card cm-testing">
          <div className="cm-test-header">
            <h2 className="cm-title">Testing "{createdAgent.name}"</h2>
            <span className="cm-agent-badge">🤖 {createdAgent.name}</span>
          </div>

          {error && <div className="cm-error">{error}</div>}

          <ScenarioRoad
            scenario={testScenario}
            action={agentDecision?.action ?? null}
            animPhase={testSubPhase === 'result' ? 'result' : 'idle'}
            harmedGroup={agentDecision?.harmed_group ?? null}
            showLoadingOverlay={testSubPhase === 'loading'}
            showDecidingOverlay={testSubPhase === 'deciding'}
          />

          {testSubPhase === 'result' && agentDecision && (
            <div className="cm-agent-result">
              <div className="cm-result-grid">
                <div className="cm-result-item">
                  <div className="cm-result-label">Agent Decision</div>
                  <div className={`cm-result-value cm-action-${agentDecision.action}`}>
                    {agentDecision.action === 'stay' ? '⬇️ Stay' : '↘️ Swerve'}
                  </div>
                </div>
                <div className="cm-result-item">
                  <div className="cm-result-label">Voting Method</div>
                  <div className="cm-result-value">{agentDecision.voting_method.toUpperCase()}</div>
                </div>
                <div className="cm-result-item">
                  <div className="cm-result-label">Harmed</div>
                  <div className="cm-result-value">
                    {agentDecision.harmed_group === 'pedestrians' ? '🚶 Pedestrians' : '🛣️ Lane 2'}
                    {' '}×{agentDecision.harmed_count}
                  </div>
                </div>
                <div className="cm-result-item">
                  <div className="cm-result-label">Dispersion</div>
                  <div className="cm-result-value">{agentDecision.credence_dispersion.toFixed(4)}</div>
                </div>
              </div>
              <button className="cm-btn cm-btn-primary cm-btn-full" onClick={handleNextTest}>
                Next Scenario →
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default CustomModelMode;
