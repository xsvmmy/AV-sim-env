import React, { useState } from 'react';
import Visualization from './components/Visualization';
import CustomModelMode from './components/CustomModelMode';
import PretrainedMode from './components/PretrainedMode';
import './App.css';

function App() {
  const [mode, setMode] = useState('simulation');
  const [currentScenario, setCurrentScenario] = useState(null);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <h1>Autonomous Vehicle Ethics Simulator</h1>
            <p className="app-subtitle">
              Ethics assessment platform for autonomous vehicle decision-making agents
            </p>
          </div>
          <nav className="mode-tabs">
            <button
              className={`mode-tab ${mode === 'simulation' ? 'mode-tab-active' : ''}`}
              onClick={() => setMode('simulation')}
            >
              Simulation
            </button>
            <button
              className={`mode-tab ${mode === 'custom' ? 'mode-tab-active' : ''}`}
              onClick={() => setMode('custom')}
            >
              Custom Model
            </button>
            <button
              className={`mode-tab ${mode === 'pretrained' ? 'mode-tab-active' : ''}`}
              onClick={() => setMode('pretrained')}
            >
              Pretrained Models
            </button>
          </nav>
        </div>
      </header>

      <main>
        {mode === 'simulation' && (
          <Visualization
            key={currentScenario?.id}
            scenario={currentScenario}
            onScenarioLoaded={setCurrentScenario}
          />
        )}
        {mode === 'custom' && <CustomModelMode />}
        {mode === 'pretrained' && <PretrainedMode />}
      </main>

      <footer className="app-footer">
        <p>AV Ethics Simulator &nbsp;·&nbsp; Built for ethical AI research and assessment</p>
      </footer>
    </div>
  );
}

export default App;
