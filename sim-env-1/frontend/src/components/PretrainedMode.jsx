import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  getCustomAgents, getRLScenarioRandom,
  predictWithCustomAgent, submitHumanFeedback, deleteCustomAgent,
} from '../utils/api';
import ScenarioRoad from './ScenarioRoad';
import './PretrainedMode.css';

// phases: loading | empty | select | mode-select | alpha-setup | testing | testing-feedback

const CHAR_EMOJI = {
  Man: '👨', Woman: '👩', Pregnant: '🤰', Stroller: '👶',
  OldMan: '👴', OldWoman: '👵', Boy: '👦', Girl: '👧',
  Homeless: '🧑', LargeWoman: '👩', LargeMan: '👨',
  Criminal: '🦹', MaleExecutive: '👔', FemaleExecutive: '👩‍💼',
  FemaleAthlete: '🏃‍♀️', MaleAthlete: '🏃‍♂️',
  FemaleDoctor: '👩‍⚕️', MaleDoctor: '👨‍⚕️',
  Dog: '🐕', Cat: '🐈',
};
const charEmoji = (name) => CHAR_EMOJI[name] || '👤';

function groupChars(chars) {
  const counts = {};
  for (const c of chars) counts[c] = (counts[c] || 0) + 1;
  return Object.entries(counts);
}

function PretrainedMode() {
  const [phase, setPhase]                 = useState('loading');
  const [agents, setAgents]               = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [testMode, setTestMode]           = useState(null); // 'only' | 'feedback'

  // Shared testing state
  const [testScenario, setTestScenario]   = useState(null);
  const [testSubPhase, setTestSubPhase]   = useState('loading'); // loading|deciding|result
  const [agentDecision, setAgentDecision] = useState(null);
  const [error, setError]                 = useState(null);

  // Feedback-mode state
  const [feedbackAlpha, setFeedbackAlpha]     = useState(0.3);
  const [feedbackGiven, setFeedbackGiven]     = useState(false);
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [latestCredences, setLatestCredences] = useState(null);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting]           = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // ── Load agent list on mount ──────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const list = await getCustomAgents();
        if (!mounted.current) return;
        setAgents(list);
        setPhase(list.length === 0 ? 'empty' : 'select');
      } catch (e) {
        if (!mounted.current) return;
        setError(e.message || 'Failed to load agents');
        setPhase('empty');
      }
    })();
  }, []);

  // ── Scenario runner (shared by both test modes) ───────────────────────────

  const loadTestScenario = useCallback(async (agentName) => {
    if (!mounted.current) return;
    setTestSubPhase('loading');
    setTestScenario(null);
    setAgentDecision(null);
    setFeedbackGiven(false);
    setLatestCredences(null);
    setError(null);
    try {
      const s = await getRLScenarioRandom();
      if (!mounted.current) return;
      setTestScenario(s);
      setTestSubPhase('deciding');
      await new Promise(r => setTimeout(r, 900));
      if (!mounted.current) return;
      const decision = await predictWithCustomAgent(agentName, s.passengers, s.pedestrians, s.traffic_light);
      if (!mounted.current) return;
      setAgentDecision(decision);
      setTestSubPhase('result');
    } catch (e) {
      if (mounted.current) setError(e.message || 'Failed to run agent');
    }
  }, []);

  // ── Agent selection → mode selection ─────────────────────────────────────

  const handleSelectAgent = (agent) => {
    setSelectedAgent(agent);
    setPhase('mode-select');
  };

  const handleModeSelect = (mode) => {
    setTestMode(mode);
    if (mode === 'only') {
      setPhase('testing');
      loadTestScenario(selectedAgent.name);
    } else {
      setPhase('alpha-setup');
    }
  };

  const handleStartFeedback = () => {
    setPhase('testing-feedback');
    loadTestScenario(selectedAgent.name);
  };

  // ── Human feedback submission ─────────────────────────────────────────────

  const handleFeedbackChoice = async (humanChoice) => {
    if (feedbackPending || !selectedAgent) return;
    setFeedbackPending(true);
    setError(null);
    try {
      const result = await submitHumanFeedback(selectedAgent.name, humanChoice, feedbackAlpha);
      if (!mounted.current) return;
      setLatestCredences(result.updated_credences);
      setFeedbackGiven(true);
    } catch (e) {
      if (mounted.current) setError(e.message || 'Failed to submit feedback');
    } finally {
      if (mounted.current) setFeedbackPending(false);
    }
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleBack = () => {
    setPhase('select');
    setSelectedAgent(null);
    setTestMode(null);
    setTestScenario(null);
    setAgentDecision(null);
    setFeedbackGiven(false);
    setLatestCredences(null);
    setError(null);
  };

  const handleBackToModeSelect = () => {
    setPhase('mode-select');
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCustomAgent(confirmDelete);
      const remaining = agents.filter(a => a.name !== confirmDelete);
      setAgents(remaining);
      setConfirmDelete(null);
      if (remaining.length === 0) setPhase('empty');
    } catch (e) {
      setError(e.message || 'Failed to delete agent');
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  // ── Path breakdown ────────────────────────────────────────────────────────

  const PathBreakdown = ({ scenario, decision }) => {
    if (!scenario) return null;
    const lane2IsBarrier = scenario.passengers?.includes('Barricade');
    const lane2Chars = scenario.passengers?.filter(p => p !== 'Barricade') ?? [];
    const stayHarmed  = decision?.action === 'stay';
    const swerveHarmed = decision?.action === 'swerve';
    return (
      <div className="pt-path-breakdown">
        <div className={`pt-path-col${stayHarmed ? ' pt-path-col-harmed' : ''}`}>
          <div className="pt-path-header">
            <span className="pt-path-label">Stay in Lane</span>
            <span className={`pt-path-count${stayHarmed ? ' pt-path-count-harmed' : ''}`}>
              {scenario.pedestrians.length} at risk
            </span>
          </div>
          <div className="pt-path-chars">
            {groupChars(scenario.pedestrians).map(([name, count]) => (
              <span key={name} className="pt-path-char">
                <span className="pt-path-emoji">{charEmoji(name)}</span>
                <span className="pt-char-name">{name}{count > 1 ? ` ×${count}` : ''}</span>
              </span>
            ))}
          </div>
        </div>
        <div className={`pt-path-col${swerveHarmed ? ' pt-path-col-harmed' : ''}`}>
          <div className="pt-path-header">
            <span className="pt-path-label">Swerve</span>
            <span className={`pt-path-count${swerveHarmed ? ' pt-path-count-harmed' : ''}`}>
              {lane2IsBarrier ? 'Barrier' : `${lane2Chars.length} at risk`}
            </span>
          </div>
          <div className="pt-path-chars">
            {lane2IsBarrier ? (
              <span className="pt-path-barrier">▩ Barricade</span>
            ) : (
              groupChars(lane2Chars).map(([name, count]) => (
                <span key={name} className="pt-path-char">
                  <span className="pt-path-emoji">{charEmoji(name)}</span>
                  <span className="pt-char-name">{name}{count > 1 ? ` ×${count}` : ''}</span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Shared result grid ────────────────────────────────────────────────────

  const ResultGrid = ({ decision }) => (
    <div className="pt-result-grid">
      <div className="pt-result-item">
        <div className="pt-result-label">Agent Decision</div>
        <div className={`pt-result-value pt-action-${decision.action}`}>
          {decision.action === 'stay' ? 'Stay in Lane' : 'Swerve'}
        </div>
      </div>
      <div className="pt-result-item">
        <div className="pt-result-label">Voting Method</div>
        <div className="pt-result-value">{decision.voting_method.toUpperCase()}</div>
      </div>
      <div className="pt-result-item">
        <div className="pt-result-label">Harmed</div>
        <div className="pt-result-value">
          {decision.harmed_group === 'pedestrians' ? 'Pedestrians' : 'Lane 2'}
          {' '}×{decision.harmed_count}
        </div>
      </div>
      <div className="pt-result-item">
        <div className="pt-result-label">Dispersion</div>
        <div className="pt-result-value">{decision.credence_dispersion.toFixed(4)}</div>
      </div>
    </div>
  );

  const TestHeader = ({ onBack }) => (
    <div className="pt-test-header">
      <h2 className="pt-title">Testing "{selectedAgent?.name}"</h2>
      <div className="pt-header-actions">
        <span className="pt-agent-badge">{selectedAgent?.name}</span>
        <button className="pt-back-btn" onClick={onBack}>← Back</button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="pt-container">

      {/* LOADING */}
      {phase === 'loading' && (
        <div className="pt-card">
          <div className="pt-spinner" />
          <p className="pt-loading-text">Loading saved agents…</p>
        </div>
      )}

      {/* EMPTY */}
      {phase === 'empty' && (
        <div className="pt-card">
          <div className="pt-empty-icon" />
          <h2 className="pt-title">No Pretrained Models Yet</h2>
          <p className="pt-desc">
            You haven't created any custom agents yet. Head over to the{' '}
            <strong>Custom Model</strong> tab to label scenarios and train your first one!
          </p>
          {error && <div className="pt-error">{error}</div>}
        </div>
      )}

      {/* SELECT */}
      {phase === 'select' && (
        <div className="pt-card">
          <h2 className="pt-title">Pretrained Models</h2>
          <p className="pt-desc">Select a saved agent to test it on new scenarios.</p>
          {error && <div className="pt-error">{error}</div>}
          <div className="pt-agent-list">
            {agents.map(agent => (
              <div key={agent.name} className="pt-agent-row">
                {confirmDelete === agent.name ? (
                  <div className="pt-agent-confirm">
                    <span className="pt-confirm-text">Delete "{agent.name}"?</span>
                    <button className="pt-confirm-yes" onClick={handleDeleteConfirm} disabled={deleting}>
                      {deleting ? '…' : 'Delete'}
                    </button>
                    <button className="pt-confirm-no" onClick={() => setConfirmDelete(null)} disabled={deleting}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button className="pt-agent-item" onClick={() => handleSelectAgent(agent)}>
                      <div className="pt-agent-name">{agent.name}</div>
                      <div className="pt-agent-meta">
                        <span>Trained on {agent.training_count} scenario{agent.training_count !== 1 ? 's' : ''}</span>
                        <span className="pt-agent-creds">
                          Deontological: {(agent.credences.deontological * 100).toFixed(0)}%
                          &nbsp;·&nbsp;
                          Utilitarian: {(agent.credences.utilitarian * 100).toFixed(0)}%
                        </span>
                      </div>
                    </button>
                    <button className="pt-delete-btn" onClick={() => setConfirmDelete(agent.name)} title="Delete this agent">
                      ×
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODE SELECT */}
      {phase === 'mode-select' && selectedAgent && (
        <div className="pt-card">
          <span className="pt-agent-badge" style={{ alignSelf: 'center' }}>{selectedAgent.name}</span>
          <h2 className="pt-title">How would you like to test?</h2>
          <div className="pt-mode-grid">
            <button className="pt-mode-btn" onClick={() => handleModeSelect('only')}>
              <span className="pt-mode-icon pt-mode-icon-observe" />
              <span className="pt-mode-name">Test Agent</span>
              <span className="pt-mode-desc">
                Watch the agent make decisions on random scenarios with no input from you.
              </span>
            </button>
            <button className="pt-mode-btn pt-mode-btn-feedback" onClick={() => handleModeSelect('feedback')}>
              <span className="pt-mode-icon pt-mode-icon-feedback" />
              <span className="pt-mode-name">Test with Your Feedback</span>
              <span className="pt-mode-desc">
                After each scenario you'll say what you would have chosen, nudging the agent's moral weights.
              </span>
            </button>
          </div>
          <button className="pt-back-btn" onClick={handleBack}>← Back to agents</button>
        </div>
      )}

      {/* ALPHA SETUP (feedback mode) */}
      {phase === 'alpha-setup' && selectedAgent && (
        <div className="pt-card">
          <span className="pt-agent-badge" style={{ alignSelf: 'center' }}>{selectedAgent.name}</span>
          <h2 className="pt-title">Set Your Influence Level</h2>
          <p className="pt-desc">
            α controls how strongly each piece of your feedback shifts the agent's moral weights.
            A low value makes subtle adjustments; a high value makes large ones.
          </p>

          <div className="pt-alpha-block">
            <div className="pt-alpha-display">α = <strong>{feedbackAlpha.toFixed(2)}</strong></div>
            <input
              type="range"
              className="pt-alpha-slider"
              min={0.01}
              max={1.0}
              step={0.01}
              value={feedbackAlpha}
              onChange={e => setFeedbackAlpha(parseFloat(e.target.value))}
            />
            <div className="pt-alpha-legend">
              <span>Subtle (0.01)</span>
              <span>Strong (1.0)</span>
            </div>
          </div>

          <button className="pt-next-btn" onClick={handleStartFeedback}>
            Start Testing →
          </button>
          <button className="pt-back-btn" onClick={handleBackToModeSelect}>← Back</button>
        </div>
      )}

      {/* TESTING — agent only */}
      {phase === 'testing' && selectedAgent && (
        <div className="pt-card">
          <TestHeader onBack={handleBack} />
          {error && <div className="pt-error">{error}</div>}

          <ScenarioRoad
            scenario={testScenario}
            action={agentDecision?.action ?? null}
            animPhase={testSubPhase === 'result' ? 'result' : 'idle'}
            harmedGroup={agentDecision?.harmed_group ?? null}
            showLoadingOverlay={testSubPhase === 'loading'}
            showDecidingOverlay={testSubPhase === 'deciding'}
          />

          {testScenario && testSubPhase !== 'loading' && (
            <PathBreakdown scenario={testScenario} decision={agentDecision} />
          )}

          {testSubPhase === 'result' && agentDecision && (
            <div className="pt-result">
              <ResultGrid decision={agentDecision} />
              <button className="pt-next-btn" onClick={() => loadTestScenario(selectedAgent.name)}>
                Next Scenario →
              </button>
            </div>
          )}
        </div>
      )}

      {/* TESTING — with human feedback */}
      {phase === 'testing-feedback' && selectedAgent && (
        <div className="pt-card">
          <TestHeader onBack={handleBack} />
          <div className="pt-alpha-chip">α = {feedbackAlpha.toFixed(2)}</div>
          {error && <div className="pt-error">{error}</div>}

          <ScenarioRoad
            scenario={testScenario}
            action={agentDecision?.action ?? null}
            animPhase={testSubPhase === 'result' ? 'result' : 'idle'}
            harmedGroup={agentDecision?.harmed_group ?? null}
            showLoadingOverlay={testSubPhase === 'loading'}
            showDecidingOverlay={testSubPhase === 'deciding'}
          />

          {testScenario && testSubPhase !== 'loading' && (
            <PathBreakdown scenario={testScenario} decision={agentDecision} />
          )}

          {testSubPhase === 'result' && agentDecision && (
            <div className="pt-result">
              <ResultGrid decision={agentDecision} />

              {/* Feedback question */}
              {!feedbackGiven && (
                <div className="pt-feedback-section">
                  <p className="pt-feedback-prompt">What would <em>you</em> have chosen?</p>
                  <div className="pt-feedback-row">
                    <button
                      className="pt-fb-btn pt-fb-stay"
                      onClick={() => handleFeedbackChoice('stay')}
                      disabled={feedbackPending}
                    >
                      Stay in Lane
                    </button>
                    <button
                      className="pt-fb-btn pt-fb-swerve"
                      onClick={() => handleFeedbackChoice('swerve')}
                      disabled={feedbackPending}
                    >
                      Swerve
                    </button>
                  </div>
                  {feedbackPending && <div className="pt-fb-spinner" />}
                </div>
              )}

              {/* Credence update after feedback */}
              {feedbackGiven && latestCredences && (
                <div className="pt-cred-update">
                  <p className="pt-cred-update-title">Feedback applied — updated weights:</p>
                  <div className="pt-cred-row">
                    <span className="pt-cred-label">Deontological</span>
                    <div className="pt-cred-track">
                      <div className="pt-cred-fill pt-cred-deont"
                        style={{ width: `${(latestCredences.deontological * 100).toFixed(1)}%` }} />
                    </div>
                    <span className="pt-cred-pct">{(latestCredences.deontological * 100).toFixed(1)}%</span>
                  </div>
                  <div className="pt-cred-row">
                    <span className="pt-cred-label">Utilitarian</span>
                    <div className="pt-cred-track">
                      <div className="pt-cred-fill pt-cred-util"
                        style={{ width: `${(latestCredences.utilitarian * 100).toFixed(1)}%` }} />
                    </div>
                    <span className="pt-cred-pct">{(latestCredences.utilitarian * 100).toFixed(1)}%</span>
                  </div>
                  <button className="pt-next-btn" onClick={() => loadTestScenario(selectedAgent.name)}>
                    Next Scenario →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default PretrainedMode;
