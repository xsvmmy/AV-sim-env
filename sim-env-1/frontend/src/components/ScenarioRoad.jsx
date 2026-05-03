import React from 'react';
import './Visualization.css';

const EMOJI_MAP = {
  Man: '👨', Woman: '👩', Pregnant: '🤰', Stroller: '👶',
  OldMan: '👴', OldWoman: '👵', Boy: '👦', Girl: '👧',
  Homeless: '🧑', LargeWoman: '👩', LargeMan: '👨',
  Criminal: '🦹', MaleExecutive: '👔', FemaleExecutive: '👩‍💼',
  FemaleAthlete: '🏃‍♀️', MaleAthlete: '🏃‍♂️',
  FemaleDoctor: '👩‍⚕️', MaleDoctor: '👨‍⚕️',
  Dog: '🐕', Cat: '🐈',
};
const charEmoji = (name) => EMOJI_MAP[name] || '👤';

/* ── Top-down AV (SVG, front at top = driving downward) ── */
function CarTopDown({ harmed }) {
  return (
    <svg
      width="32" height="58"
      viewBox="0 0 32 58"
      className={`av-car-svg ${harmed ? 'av-car-harmed' : ''}`}
      aria-label="Autonomous vehicle"
    >
      {/* Body */}
      <rect x="3" y="1" width="26" height="56" rx="7" fill="#1d4ed8" />
      {/* Roof panel */}
      <rect x="5" y="19" width="22" height="20" rx="3" fill="#1e3a8a" />
      {/* Front windshield */}
      <rect x="6" y="7" width="20" height="15" rx="3" fill="rgba(186,230,253,0.68)" />
      {/* Rear windshield */}
      <rect x="6" y="40" width="20" height="11" rx="2" fill="rgba(186,230,253,0.4)" />
      {/* Headlights */}
      <rect x="3"  y="2" width="7" height="5" rx="2" fill="#fef9c3" opacity="0.92" />
      <rect x="22" y="2" width="7" height="5" rx="2" fill="#fef9c3" opacity="0.92" />
      {/* Tail lights */}
      <rect x="3"  y="51" width="7" height="5" rx="2" fill="#ef4444" opacity="0.88" />
      <rect x="22" y="51" width="7" height="5" rx="2" fill="#ef4444" opacity="0.88" />
      {/* Wheels */}
      <rect x="0"  y="9"  width="4" height="12" rx="2" fill="#111827" />
      <rect x="28" y="9"  width="4" height="12" rx="2" fill="#111827" />
      <rect x="0"  y="37" width="4" height="12" rx="2" fill="#111827" />
      <rect x="28" y="37" width="4" height="12" rx="2" fill="#111827" />
      {/* AV sensor dot */}
      <circle cx="16" cy="29" r="3" fill="rgba(96,165,250,0.85)" />
    </svg>
  );
}

/* ── CSS crossing signal badge ── */
function CrossingSignalBadge({ signal, posClass }) {
  const isWalk = signal === 'Green';
  return (
    <div className={`crossing-signal ${posClass} ${isWalk ? 'signal-walk' : 'signal-stop'}`}>
      <div className="signal-dot" />
      <span className="signal-label">{isWalk ? 'WALK' : 'STOP'}</span>
    </div>
  );
}

/* ── CSS barrier block ── */
function BarrierBlock() {
  return (
    <div className="road-barrier-block">
      <div className="barrier-stripes" />
      <span className="barrier-label">BARRIER</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ScenarioRoad — shared road visualization
   Props:
     scenario          CSV scenario dict (null = not loaded)
     action            'stay' | 'swerve' | null
     animPhase         'idle' | 'initial' | 'action' | 'result'
     harmedGroup       'pedestrians' | 'passengers' | null
     showLoadingOverlay
     showDecidingOverlay
     showEmptyOverlay
     showIdleOverlay
───────────────────────────────────────────────────────── */
function ScenarioRoad({
  scenario,
  action,
  animPhase = 'idle',
  harmedGroup = null,
  showLoadingOverlay = false,
  showDecidingOverlay = false,
  showEmptyOverlay = false,
  showIdleOverlay = false,
}) {
  const lane1Chars     = scenario?.lane1_chars     ?? scenario?.pedestrians ?? [];
  const lane2Chars     = scenario?.lane2_chars     ?? (scenario?.passengers?.filter(p => p !== 'Barricade') ?? []);
  const lane1IsBarrier = scenario?.lane1_is_barrier ?? false;
  const lane2IsBarrier = scenario?.lane2_is_barrier ?? (scenario?.passengers?.includes('Barricade') ?? false);
  const passengersInAV = scenario?.passengers_in_av ?? [];
  const lane1Signal    = scenario?.lane1_signal ?? (lane1IsBarrier ? null : (scenario?.traffic_light ?? null));
  const lane2Signal    = scenario?.lane2_signal ?? null;

  const effectiveHarmed = harmedGroup
    ?? (action === 'stay' ? 'pedestrians' : action === 'swerve' ? 'passengers' : null);

  const isLane1Harmed = animPhase === 'result' && effectiveHarmed === 'pedestrians';
  const isLane2Harmed = animPhase === 'result' && effectiveHarmed === 'passengers';
  const isAVHarmed    = (isLane1Harmed && lane1IsBarrier) || (isLane2Harmed && lane2IsBarrier);

  const avClass = (!action || animPhase === 'idle' || animPhase === 'initial')
    ? 'av-initial'
    : action === 'swerve' ? 'av-swerving' : 'av-staying';

  return (
    <div className="road-container">
      <div className="road-lane-label road-lane-label-1">LANE 1 — AV PATH</div>
      <div className="road-lane-label road-lane-label-2">LANE 2 — SWERVE PATH</div>

      <div className="road-lane-divider" />
      <div className="road-dir-arrow road-dir-1">▼</div>
      <div className="road-dir-arrow road-dir-2">▼</div>
      <div className="road-crosswalk" />
      <div className="road-median" />

      {/* Per-lane crossing signals */}
      {scenario && lane1Signal && (
        <CrossingSignalBadge signal={lane1Signal} posClass="crossing-signal-lane1" />
      )}
      {scenario && lane2Signal && (
        <CrossingSignalBadge signal={lane2Signal} posClass="crossing-signal-lane2" />
      )}

      {/* Lane 1 */}
      {scenario && (
        <div className={`road-group road-group-1 ${isLane1Harmed && !lane1IsBarrier ? 'road-group-harmed' : ''}`}>
          <div className="road-group-chars">
            {lane1IsBarrier
              ? <BarrierBlock />
              : lane1Chars.map((p, i) => (
                  <span key={i} className="road-char" title={p}>{charEmoji(p)}</span>
                ))
            }
          </div>
        </div>
      )}

      {/* Lane 2 */}
      {scenario && (
        <div className={`road-group road-group-2 ${isLane2Harmed && !lane2IsBarrier ? 'road-group-harmed' : ''}`}>
          <div className="road-group-chars">
            {lane2IsBarrier
              ? <BarrierBlock />
              : lane2Chars.map((p, i) => (
                  <span key={i} className="road-char" title={p}>{charEmoji(p)}</span>
                ))
            }
          </div>
        </div>
      )}

      {/* Autonomous vehicle */}
      <div className={`road-av ${avClass} ${isAVHarmed ? 'road-av-harmed' : ''}`}>
        <div className="av-car-wrap">
          <CarTopDown harmed={isAVHarmed} />
          {passengersInAV.length > 0 && (
            <div className="av-cabin-overlay">
              {passengersInAV.map((p, i) => (
                <span key={i} className="av-passenger" title={p}>{charEmoji(p)}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action result label */}
      {animPhase === 'result' && action && (
        <div className="road-result-overlay">
          {action === 'stay' ? 'Stayed in Lane 1' : 'Swerved to Lane 2'}
        </div>
      )}

      {/* RL overlays */}
      {showLoadingOverlay && (
        <div className="road-rl-overlay">
          <div className="road-rl-spinner" />
          <p>Loading scenario…</p>
        </div>
      )}
      {showDecidingOverlay && (
        <div className="road-rl-deciding">Agent deciding…</div>
      )}

      {/* Empty / idle prompts */}
      {showEmptyOverlay && (
        <div className="road-empty-overlay">
          <span>Click <strong>Random Scenario</strong> above to load a dilemma</span>
        </div>
      )}
      {showIdleOverlay && (
        <div className="road-idle-overlay">
          Use the RL Panel below to run the simulation
        </div>
      )}
    </div>
  );
}

export default ScenarioRoad;
