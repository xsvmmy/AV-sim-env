import React, { useState, useRef } from 'react';
import { simulateWithRL } from '../utils/api';
import './RLPanel.css';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * RLPanel — RL Training Panel
 *
 * Supports two modes:
 * 1. Single-run: inspect the current scenario's credences, run agent once.
 * 2. Visual training: run N episodes with animated playback driven through
 *    the parent Visualization component via the onRLStep callback.
 *
 * The scenario to train on is always provided by the parent (via the
 * `scenario` prop). RLPanel never fetches its own random scenario — that
 * ensures the road always shows the same event the user loaded.
 */
function RLPanel({ scenario, onRLStep }) {
  const [result, setResult]         = useState(null);
  const [loadingAgent, setLoadingAgent] = useState(false);
  const [error, setError]           = useState(null);

  // ── Multi-episode training state ──
  const [trainEpisodes, setTrainEpisodes]     = useState(5);
  const [isTraining, setIsTraining]           = useState(false);
  const [trainEpisodeNum, setTrainEpisodeNum] = useState(0);
  const [trainHistory, setTrainHistory]       = useState([]);
  const stopTrainingRef = useRef(false);

  const getCharacterEmoji = (name) => {
    const map = {
      Man: '👨', Woman: '👩', Pregnant: '🤰', Stroller: '👶',
      OldMan: '👴', OldWoman: '👵', Boy: '👦', Girl: '👧',
      Homeless: '🧑', LargeWoman: '👩', LargeMan: '👨',
      Criminal: '🦹', MaleExecutive: '👔', FemaleExecutive: '👩‍💼',
      FemaleAthlete: '🏃‍♀️', MaleAthlete: '🏃‍♂️',
      FemaleDoctor: '👩‍⚕️', MaleDoctor: '👨‍⚕️',
      Dog: '🐕', Cat: '🐈', Barricade: '🚧',
    };
    return map[name] || '👤';
  };

  // ── Single-run handler ──
  const handleRunAgent = async () => {
    if (!scenario || !onRLStep) return;
    setLoadingAgent(true);
    setError(null);
    try {
      onRLStep({ phase: 'scenario', scenario, episodeNum: null, totalEpisodes: null });
      await delay(600);

      const r = await simulateWithRL(scenario.response_id);
      setResult(r);

      onRLStep({ phase: 'deciding', scenario, result: r, episodeNum: null, totalEpisodes: null });
      await delay(650);

      onRLStep({ phase: 'animating', scenario, result: r, episodeNum: null, totalEpisodes: null });
      await delay(850);

      onRLStep({ phase: 'result', scenario, result: r, episodeNum: null, totalEpisodes: null });
      await delay(1500);

      onRLStep({ phase: 'done' });
    } catch (e) {
      setError(e.message || 'Failed to run RL agent');
      onRLStep({ phase: 'done' });
    } finally {
      setLoadingAgent(false);
    }
  };

  // ── Multi-episode training ──
  const handleTrainEpisodes = async () => {
    if (!scenario || !onRLStep || isTraining) return;
    setIsTraining(true);
    setTrainEpisodeNum(0);
    setTrainHistory([]);
    setError(null);
    stopTrainingRef.current = false;

    // Use the scenario already on screen — no random fetch needed
    onRLStep({ phase: 'scenario', scenario, episodeNum: 1, totalEpisodes: trainEpisodes });
    await delay(900);

    for (let i = 0; i < trainEpisodes; i++) {
      if (stopTrainingRef.current) break;

      setTrainEpisodeNum(i + 1);

      let rlResult;
      try {
        rlResult = await simulateWithRL(scenario.response_id);
      } catch (e) {
        setError(e.message || 'Failed to run RL agent');
        break;
      }
      if (stopTrainingRef.current) break;

      onRLStep({ phase: 'deciding', scenario, result: rlResult, episodeNum: i + 1, totalEpisodes: trainEpisodes });
      await delay(650);
      if (stopTrainingRef.current) break;

      onRLStep({ phase: 'animating', scenario, result: rlResult, episodeNum: i + 1, totalEpisodes: trainEpisodes });
      await delay(850);
      if (stopTrainingRef.current) break;

      onRLStep({ phase: 'result', scenario, result: rlResult, episodeNum: i + 1, totalEpisodes: trainEpisodes });
      setResult(rlResult);
      setTrainHistory(prev => [...prev, {
        ep:      i + 1,
        action:  rlResult.action,
        reward:  rlResult.reward,
        matches: rlResult.agent_matches_human,
        method:  rlResult.voting_method,
      }]);
      await delay(1400);

      // Reset AV to lane top for next episode (skip after last)
      if (i < trainEpisodes - 1 && !stopTrainingRef.current) {
        onRLStep({ phase: 'scenario', scenario, episodeNum: i + 2, totalEpisodes: trainEpisodes });
        await delay(550);
      }
    }

    onRLStep({ phase: 'done' });
    setIsTraining(false);
  };

  const handleStopTraining = () => {
    stopTrainingRef.current = true;
  };

  // Credence dispersion for display
  const dispersion = scenario
    ? (() => {
        const c = scenario.credences;
        const vals = [c.deontological, c.utilitarian];
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        return vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      })()
    : null;
  const isNash = dispersion !== null && dispersion > 0.04;

  // Lane 2 label (barrier or swerve group)
  const lane2IsBarrier = scenario?.lane2_is_barrier ?? scenario?.barrier ?? false;

  return (
    <div className="rl-panel">
      <div className="rl-panel-header">
        <h3>RL Agent — Nash / Variance Voting</h3>
        <p className="rl-subtitle">
          Tabular Q-learning selects the voting method; crowd credences drive the action.
        </p>
      </div>

      {/* ══════════════════════════════════════════
          SECTION A — Visual Episode Training
      ══════════════════════════════════════════ */}
      <div className="rl-section">
        <div className="rl-section-title">Visual Training</div>
        <p className="rl-hint" style={{ marginBottom: 12 }}>
          Runs N episodes on the loaded scenario and animates each agent decision above.
        </p>

        <div className="rl-train-controls">
          <label className="rl-label" style={{ minWidth: 'auto' }}>Episodes</label>
          <input
            type="number"
            className="rl-episodes-input"
            value={trainEpisodes}
            onChange={e => setTrainEpisodes(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
            min={1}
            max={50}
            disabled={isTraining}
          />
          {!isTraining ? (
            <button className="rl-btn rl-btn-run" onClick={handleTrainEpisodes}>
              ▶ Run Visual Training
            </button>
          ) : (
            <button className="rl-btn rl-btn-stop" onClick={handleStopTraining}>
              ⏹ Stop ({trainEpisodeNum}/{trainEpisodes})
            </button>
          )}
        </div>

        {trainHistory.length > 0 && (
          <div className="rl-train-history">
            <div className="rl-section-subtitle">Episode Log (last {Math.min(trainHistory.length, 10)})</div>
            <div className="rl-history-list">
              {trainHistory.slice(-10).map(h => (
                <div key={h.ep} className="rl-history-row">
                  <span className="rl-history-ep">Ep {h.ep}</span>
                  <span className={`rl-history-action action-${h.action}`}>{h.action}</span>
                  <span className="rl-history-method">{h.method.toUpperCase()}</span>
                  <span className={`rl-history-reward ${h.reward >= 0 ? 'reward-pos' : 'reward-neg'}`}>
                    {h.reward >= 0 ? '+' : ''}{h.reward.toFixed(3)}
                  </span>
                  <span className="rl-history-match">{h.matches ? '✅' : '❌'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          SECTION B — Scenario Inspector
      ══════════════════════════════════════════ */}
      <div className="rl-section">
        <div className="rl-section-title">Scenario Inspector</div>

        <div className="rl-scenario-info">
          <div className="rl-info-row">
            <span className="rl-label">Response ID</span>
            <span className="rl-value mono">{scenario.response_id}</span>
          </div>
          <div className="rl-info-row">
            <span className="rl-label">Pedestrians (lane 1)</span>
            <span className="rl-value">
              {scenario.pedestrians.map((c, i) => (
                <span key={i} title={c}>{getCharacterEmoji(c)}</span>
              ))}
              <span className="rl-count"> ×{scenario.pedestrians.length}</span>
            </span>
          </div>
          <div className="rl-info-row">
            <span className="rl-label">
              {lane2IsBarrier ? 'Barricade (lane 2)' : 'Swerve group (lane 2)'}
            </span>
            <span className="rl-value">
              {scenario.passengers.map((c, i) => (
                <span key={i} title={c}>{getCharacterEmoji(c)}</span>
              ))}
              {!lane2IsBarrier && (
                <span className="rl-count"> ×{scenario.passengers.length}</span>
              )}
            </span>
          </div>
          <div className="rl-info-row">
            <span className="rl-label">Signal</span>
            <span className={`rl-badge ${scenario.traffic_light === 'Green' ? 'badge-green' : 'badge-red'}`}>
              {scenario.traffic_light === 'Green' ? '🚶 Walk' : '🚫 Don\'t Walk'}
            </span>
          </div>
        </div>
      </div>

      {/* Credences */}
      <div className="rl-section">
        <div className="rl-section-title">Crowd Credences</div>
        <div className="rl-credence-row">
          <span className="rl-credence-label">Deontological (stay)</span>
          <div className="rl-bar-track">
            <div className="rl-bar deont" style={{ width: `${(scenario.credences.deontological * 100).toFixed(1)}%` }} />
          </div>
          <span className="rl-credence-pct">{(scenario.credences.deontological * 100).toFixed(1)}%</span>
        </div>
        <div className="rl-credence-row">
          <span className="rl-credence-label">Utilitarian (swerve)</span>
          <div className="rl-bar-track">
            <div className="rl-bar util" style={{ width: `${(scenario.credences.utilitarian * 100).toFixed(1)}%` }} />
          </div>
          <span className="rl-credence-pct">{(scenario.credences.utilitarian * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* Dispersion */}
      {dispersion !== null && (
        <div className="rl-section">
          <div className="rl-section-title">Credence Dispersion</div>
          <div className="rl-dispersion-row">
            <span className="rl-label">Var([C_d, C_u])</span>
            <span className="rl-value mono">{dispersion.toFixed(4)}</span>
            <span className={`rl-badge ${isNash ? 'badge-green' : 'badge-amber'}`}>
              {isNash ? '✅ Nash' : '⚠️ Variance'}
            </span>
          </div>
          <p className="rl-hint">
            {isNash
              ? 'Dispersion > 0.04: one theory dominates → Nash voting.'
              : 'Dispersion ≤ 0.04: genuine uncertainty → Variance voting.'}
          </p>
        </div>
      )}

      {/* Single-run agent button */}
      <div className="rl-section">
        <div className="rl-section-title">Run Single Episode</div>
        <button
          className="rl-btn rl-btn-run"
          onClick={handleRunAgent}
          disabled={loadingAgent || isTraining}
        >
          {loadingAgent ? '⏳ Running…' : '▶ Run Agent Once'}
        </button>
      </div>

      {error && <div className="rl-error">{error}</div>}

      {/* Result display */}
      {result && (
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
                <div className="rl-result-label">Voting method</div>
                <div className="rl-result-value">{result.voting_method.toUpperCase()}</div>
              </div>
              <div className="rl-result-item">
                <div className="rl-result-label">Moral reward</div>
                <div className={`rl-result-value ${result.reward >= 0 ? 'reward-pos' : 'reward-neg'}`}>
                  {result.reward >= 0 ? '+' : ''}{result.reward.toFixed(4)}
                </div>
              </div>
              <div className="rl-result-item">
                <div className="rl-result-label">Harmed</div>
                <div className="rl-result-value">
                  {result.harmed_group === 'passengers' ? '🛣️ Lane 2' : '🚶 Pedestrians'}
                  {' '}×{result.harmed_count}
                </div>
              </div>
            </div>

            <div className="rl-qvalue-section">
              <div className="rl-section-subtitle">Q-values</div>
              {Object.entries(result.q_values).map(([theory, actions]) => (
                <div key={theory} className="rl-qvalue-theory">
                  <div className="rl-qvalue-theory-label">{theory}</div>
                  {Object.entries(actions).map(([action, q]) => (
                    <div key={action} className="rl-qvalue-row">
                      <span className="rl-qvalue-action">{action}</span>
                      <div className="rl-bar-track qbar-track">
                        <div className={`rl-bar qbar ${q >= 0 ? 'qbar-pos' : 'qbar-neg'}`}
                             style={{ width: `${Math.abs(q) * 100}%` }} />
                      </div>
                      <span className="rl-qvalue-num">{q >= 0 ? '+' : ''}{q.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="rl-section">
            <div className="rl-section-title">Human vs Agent</div>
            <div className="rl-compare">
              <div className="rl-compare-side">
                <div className="rl-compare-label">Human majority</div>
                <div className={`rl-compare-choice action-${result.human_choice}`}>
                  {result.human_choice === 'stay' ? '⬇️ Stay' : '↘️ Swerve'}
                </div>
              </div>
              <div className="rl-compare-vs">
                {result.agent_matches_human ? '✅ Match' : '❌ Differ'}
              </div>
              <div className="rl-compare-side">
                <div className="rl-compare-label">Agent decision</div>
                <div className={`rl-compare-choice action-${result.action}`}>
                  {result.action === 'stay' ? '⬇️ Stay' : '↘️ Swerve'}
                </div>
              </div>
            </div>
          </div>

          <div className="rl-section rl-stats-bar">
            <div className="rl-section-title">Training Stats</div>
            <div className="rl-stats-row">
              <div className="rl-stat">
                <div className="rl-stat-val">{result.episode_count}</div>
                <div className="rl-stat-lbl">Episodes</div>
              </div>
              <div className="rl-stat">
                <div className={`rl-stat-val ${result.avg_reward >= 0 ? 'reward-pos' : 'reward-neg'}`}>
                  {result.avg_reward >= 0 ? '+' : ''}{result.avg_reward.toFixed(3)}
                </div>
                <div className="rl-stat-lbl">Avg Reward</div>
              </div>
              <div className="rl-stat">
                <div className="rl-stat-val">{(result.epsilon * 100).toFixed(1)}%</div>
                <div className="rl-stat-lbl">Epsilon ε</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default RLPanel;
