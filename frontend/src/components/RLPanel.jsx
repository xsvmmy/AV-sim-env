import React, { useState, useEffect } from 'react';
import { simulateWithRL, datasetRun, getRLScenarioRandom } from '../utils/api';
import './RLPanel.css';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ── Legal status badge ──────────────────────────────────────────────────────
function LegalBadge({ tl }) {
  if (!tl || tl === 'None') {
    return <span className="rl-badge badge-amber">No signal</span>;
  }
  if (tl === 'Green') {
    return <span className="rl-badge badge-green">🚶 Walk (legal)</span>;
  }
  return <span className="rl-badge badge-red">🚫 Don't Walk (illegal)</span>;
}

// ── Attribute label helper ───────────────────────────────────────────────────
const _ATTR_LABELS = {
  Utilitarian:     { More: 'More lives at stake', Less: 'Fewer lives at stake' },
  Gender:          { Male: 'Male', Female: 'Female' },
  Age:             { Young: 'Young', Old: 'Old', Elderly: 'Elderly' },
  Fitness:         { Fit: 'Physically fit', Fat: 'Overweight' },
  'Social Status': { High: 'High social status', Low: 'Low social status' },
  Species:         { Hoomans: 'Humans', Pets: 'Pets' },
};

function getAttributeLabel(scenarioType, attrLevel) {
  const map = _ATTR_LABELS[scenarioType] || {};
  return map[attrLevel] || attrLevel;
}

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
 * RLPanel — RL Simulation Panel
 *
 * Runs the agent on a scenario, animates the result, asks for feedback,
 * then automatically fetches a new random scenario for the next run.
 *
 * Props:
 *   scenario    — initial scenario loaded by the parent (Random Scenario button)
 *   onRLStep    — callback to drive road animation in Visualization
 */
function RLPanel({ scenario, onRLStep }) {
  // Track the current scenario internally so it can rotate after each feedback
  const [currentScenario, setCurrentScenario] = useState(scenario);

  // If the parent loads a brand-new scenario (user clicks 🎲 again), adopt it
  useEffect(() => { setCurrentScenario(scenario); }, [scenario]);

  const [loading, setLoading]         = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState(null);
  const [runLog, setRunLog]           = useState([]);
  const [showLog, setShowLog]         = useState(false);

  // ── Initial run: Q-table decides, no Q-update ──
  const handleRun = async () => {
    if (!currentScenario || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      onRLStep({ phase: 'scenario', scenario: currentScenario, episodeNum: null, totalEpisodes: null });
      await delay(600);

      const res = await simulateWithRL(currentScenario.response_id);
      setResult(res);

      onRLStep({ phase: 'deciding',  scenario: currentScenario, result: res, episodeNum: null, totalEpisodes: null });
      await delay(650);
      onRLStep({ phase: 'animating', scenario: currentScenario, result: res, episodeNum: null, totalEpisodes: null });
      await delay(850);
      onRLStep({ phase: 'result',    scenario: currentScenario, result: res, episodeNum: null, totalEpisodes: null });
    } catch (e) {
      setError(e.message || 'Failed to run RL agent');
      onRLStep({ phase: 'done' });
    } finally {
      setLoading(false);
    }
  };

  // ── Dataset rerun: Nash/variance decides, Q-table trains on +1 ──
  const handleDatasetRun = async () => {
    if (!currentScenario || loading) return;
    setLoading(true);
    setError(null);

    try {
      const dr = await datasetRun(currentScenario.response_id);

      // Animate the dataset-guided action on the road
      onRLStep({ phase: 'deciding',  scenario: currentScenario, result: dr, episodeNum: null, totalEpisodes: null });
      await delay(650);
      onRLStep({ phase: 'animating', scenario: currentScenario, result: dr, episodeNum: null, totalEpisodes: null });
      await delay(850);
      onRLStep({ phase: 'result',    scenario: currentScenario, result: dr, episodeNum: null, totalEpisodes: null });

      // Derive the agent's new greedy choice from updated Q-values (argmax Q)
      const greedyAction = dr.q_values.stay >= dr.q_values.swerve ? 'stay' : 'swerve';

      // Update displayed Q-values, action, and voting to reflect the trained state
      setResult(prev => prev ? {
        ...prev,
        action:            greedyAction,
        agent_matches_human: greedyAction === prev.human_choice,
        q_values:          dr.q_values,
        episode_count:     dr.episode_count,
        avg_reward:        dr.avg_reward,
        epsilon:           dr.epsilon,
        voting: {
          ...dr.voting,
          agent_matches: greedyAction === dr.voting.recommendation,
        },
      } : prev);

      setRunLog(prev => [...prev, {
        run:      prev.length + 1,
        action:   dr.action,
        q_stay:   dr.q_values?.stay   ?? 0,
        q_swerve: dr.q_values?.swerve ?? 0,
        method:   dr.voting?.method   ?? '—',
        reward:   dr.reward,
        episodes: dr.episode_count,
      }]);
    } catch (e) {
      setError(e.message || 'Failed dataset rerun');
      onRLStep({ phase: 'done' });
    } finally {
      setLoading(false);
    }
  };

  // ── Load a new random scenario ──
  const handleNextScenario = async () => {
    setLoadingNext(true);
    setResult(null);
    setRunLog([]);
    try {
      const nextSc = await getRLScenarioRandom();
      setCurrentScenario(nextSc);
      onRLStep({ phase: 'scenario', scenario: nextSc, episodeNum: null, totalEpisodes: null });
    } catch (e) {
      onRLStep({ phase: 'done' });
    } finally {
      setLoadingNext(false);
    }
  };

  const lane2IsBarrier = currentScenario?.lane2_is_barrier ?? currentScenario?.barrier ?? false;

  return (
    <div className="rl-panel">

      {/* ── Header ── */}
      <div className="rl-panel-header">
        <h3>RL Agent — Simulation</h3>
        <p className="rl-subtitle">
          Run the agent to see its current Q-table decision, then rerun with dataset context to train it using Nash/variance voting.
        </p>
      </div>

      {/* ══════════════════════════════════════════
          SECTION A — Controls
      ══════════════════════════════════════════ */}
      <div className="rl-section">
        <div className="rl-section-title">Controls</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="rl-btn rl-btn-run"
            onClick={handleRun}
            disabled={loading || loadingNext}
          >
            {loading ? '⏳ Running…' : loadingNext ? '⏳ Loading…' : '▶ Run Agent'}
          </button>
          {result && (
            <button
              className="rl-btn rl-btn-dataset"
              onClick={handleDatasetRun}
              disabled={loading || loadingNext}
            >
              🔄 Rerun with Dataset Context
            </button>
          )}
          <button
            className="rl-btn rl-btn-next"
            onClick={handleNextScenario}
            disabled={loading || loadingNext}
          >
            ⏭ Next Scenario
          </button>
        </div>
        {result && !loading && (
          <p className="rl-hint" style={{ marginTop: 10, marginBottom: 0 }}>
            The agent made its Q-table decision above. Click <strong>Rerun with Dataset Context</strong> to have it use the Nash/variance recommendation from the CSV data — this trains the Q-table with a +1 reward. Repeat as many times as you like, then move on.
          </p>
        )}
      </div>

      {error && <div className="rl-error">{error}</div>}

      {/* ══════════════════════════════════════════
          SECTION B — Current Scenario
      ══════════════════════════════════════════ */}
      <div className="rl-section">
        <div className="rl-section-title">Current Scenario</div>

        {currentScenario.scenario_type && (
          <div className="rl-scenario-context">
            <span className={`rl-type-badge type-${(currentScenario.scenario_type || 'random').toLowerCase().replace(' ', '-')}`}>
              {currentScenario.scenario_type}
            </span>
            {currentScenario.attribute_level && currentScenario.attribute_level !== 'Rand' && (
              <span className="rl-attr-label">
                Testing: <strong>{getAttributeLabel(currentScenario.scenario_type, currentScenario.attribute_level)}</strong>
              </span>
            )}
            {currentScenario.ped_ped != null && (
              <span className="rl-pedped-badge">
                {currentScenario.ped_ped ? '🚶 Ped vs Ped' : '🚶 Ped vs Passenger'}
              </span>
            )}
          </div>
        )}

        <div className="rl-scenario-info">
          <div className="rl-info-row">
            <span className="rl-label">Response ID</span>
            <span className="rl-value mono">{currentScenario.response_id}</span>
          </div>
          <div className="rl-info-row">
            <span className="rl-label">Pedestrians (lane 1)</span>
            <span className="rl-value">
              {currentScenario.pedestrians.map((c, i) => (
                <span key={i} title={c}>{emoji(c)}</span>
              ))}
              <span className="rl-count"> ×{currentScenario.pedestrians.length}</span>
            </span>
          </div>
          <div className="rl-info-row">
            <span className="rl-label">
              {lane2IsBarrier ? 'Barricade (lane 2)' : 'Swerve group (lane 2)'}
            </span>
            <span className="rl-value">
              {currentScenario.passengers.map((c, i) => (
                <span key={i} title={c}>{emoji(c)}</span>
              ))}
              {!lane2IsBarrier && <span className="rl-count"> ×{currentScenario.passengers.length}</span>}
            </span>
          </div>
          <div className="rl-info-row">
            <span className="rl-label">Crossing</span>
            <LegalBadge tl={currentScenario.traffic_light} />
          </div>
          {currentScenario.diff_n_chars > 0 && (
            <div className="rl-info-row">
              <span className="rl-label">Size difference</span>
              <span className="rl-value">
                {currentScenario.diff_n_chars} more character{currentScenario.diff_n_chars !== 1 ? 's' : ''} in one lane
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Crowd Credences + Voting (combined) ── */}
      <div className="rl-section">
        <div className="rl-section-title">
          Crowd Credences
          {result?.voting && !loadingNext && (
            <span className="rl-voting-method-tag">
              {result.voting.method === 'nash' ? '— Nash Equilibrium' : '— Variance'}
            </span>
          )}
        </div>
        {result?.voting && !loadingNext && (
          <p className="rl-hint" style={{ marginTop: 0, marginBottom: 10 }}>
            {result.voting.method === 'nash'
              ? `Strong moral consensus (${(result.voting.split * 100).toFixed(0)}% gap) — Nash equilibrium: the dominant framework's choice is stable.`
              : `Frameworks nearly tied (${(result.voting.split * 100).toFixed(0)}% gap) — variance voting minimises total moral disagreement.`
            }
          </p>
        )}
        <div className="rl-credence-row">
          <span className="rl-credence-label">Deontological (stay)</span>
          <div className="rl-bar-track">
            <div className="rl-bar deont" style={{ width: `${result?.voting ? result.voting.deont_pct : (currentScenario.credences.deontological * 100).toFixed(1)}%` }} />
          </div>
          <span className="rl-credence-pct">{result?.voting ? result.voting.deont_pct : (currentScenario.credences.deontological * 100).toFixed(1)}%</span>
        </div>
        <div className="rl-credence-row">
          <span className="rl-credence-label">Utilitarian (swerve)</span>
          <div className="rl-bar-track">
            <div className="rl-bar util" style={{ width: `${result?.voting ? result.voting.util_pct : (currentScenario.credences.utilitarian * 100).toFixed(1)}%` }} />
          </div>
          <span className="rl-credence-pct">{result?.voting ? result.voting.util_pct : (currentScenario.credences.utilitarian * 100).toFixed(1)}%</span>
        </div>
        {result?.voting && !loadingNext && (
          <div className="rl-compare" style={{ marginTop: 12 }}>
            <div className="rl-compare-side">
              <div className="rl-compare-label">Vote recommends</div>
              <div className={`rl-compare-choice action-${result.voting.recommendation}`}>
                {result.voting.recommendation === 'stay' ? '⬇️ Stay' : '↘️ Swerve'}
              </div>
            </div>
            <div className="rl-compare-vs">
              {result.voting.agent_matches ? '✅ Match' : '❌ Differ'}
            </div>
            <div className="rl-compare-side">
              <div className="rl-compare-label">Agent chose</div>
              <div className={`rl-compare-choice action-${result.action}`}>
                {result.action === 'stay' ? '⬇️ Stay' : '↘️ Swerve'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Result display ── */}
      {result && !loadingNext && (
        <>
          <div className="rl-section">
            <div className="rl-section-title">Agent Decision</div>
            <div className="rl-result-grid">
              <div className="rl-result-item">
                <div className="rl-result-label">Action</div>
                <div className={`rl-result-value action-${result.action}`}>
                  {result.action === 'stay' ? '⬇️ Stay' : '↘️ Swerve'}
                </div>
              </div>
              <div className="rl-result-item">
                <div className="rl-result-label">Harmed</div>
                <div className="rl-result-value">
                  {result.harmed_group === 'passengers' ? '🛣️ Lane 2' : '🚶 Pedestrians'}
                  {' '}×{result.harmed_count}
                </div>
              </div>
              <div className="rl-result-item">
                <div className="rl-result-label">Q(stay)</div>
                <div className={`rl-result-value ${result.q_values?.stay >= 0 ? 'reward-pos' : 'reward-neg'}`}>
                  {(result.q_values?.stay ?? 0) >= 0 ? '+' : ''}
                  {(result.q_values?.stay ?? 0).toFixed(4)}
                </div>
              </div>
              <div className="rl-result-item">
                <div className="rl-result-label">Q(swerve)</div>
                <div className={`rl-result-value ${result.q_values?.swerve >= 0 ? 'reward-pos' : 'reward-neg'}`}>
                  {(result.q_values?.swerve ?? 0) >= 0 ? '+' : ''}
                  {(result.q_values?.swerve ?? 0).toFixed(4)}
                </div>
              </div>
            </div>
          </div>

        </>
      )}


      {/* ── Reward Log (collapsible) ── */}
      {runLog.length > 0 && (
        <div className="rl-section">
          <button className="rl-log-toggle" onClick={() => setShowLog(v => !v)}>
            {showLog ? '▾' : '▸'} Reward Log — {runLog.length} run{runLog.length !== 1 ? 's' : ''} on this scenario
          </button>
          {showLog && (
            <div className="rl-log-table-wrap">
              <table className="rl-log-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Action</th>
                    <th>Voting Method</th>
                    <th>Q(stay)</th>
                    <th>Q(swerve)</th>
                    <th>Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {runLog.map(entry => (
                    <tr key={entry.run}>
                      <td>{entry.run}</td>
                      <td className={`action-${entry.action}`}>
                        {entry.action === 'stay' ? '⬇️ Stay' : '↘️ Swerve'}
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{entry.method}</td>
                      <td className={entry.q_stay >= 0 ? 'reward-pos' : 'reward-neg'}>
                        {entry.q_stay >= 0 ? '+' : ''}{entry.q_stay.toFixed(4)}
                      </td>
                      <td className={entry.q_swerve >= 0 ? 'reward-pos' : 'reward-neg'}>
                        {entry.q_swerve >= 0 ? '+' : ''}{entry.q_swerve.toFixed(4)}
                      </td>
                      <td className={entry.reward >= 0 ? 'reward-pos' : 'reward-neg'}>
                        {entry.reward >= 0 ? '+' : ''}{entry.reward}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RLPanel;
