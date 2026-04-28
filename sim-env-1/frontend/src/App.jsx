import React, { useState } from 'react';
import Visualization from './components/Visualization';
import CustomModelMode from './components/CustomModelMode';
import './App.css';

function App() {
  const [mode, setMode] = useState('simulation');
  const [currentScenario, setCurrentScenario] = useState(null);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🚗 Autonomous Vehicle Ethics Simulator</h1>
        <p className="app-subtitle">
          Configure and visualize ethical dilemmas for autonomous vehicles
        </p>
        <div className="mode-tabs">
          <button
            className={`mode-tab ${mode === 'simulation' ? 'mode-tab-active' : ''}`}
            onClick={() => setMode('simulation')}
          >
            🔬 Simulation
          </button>
          <button
            className={`mode-tab ${mode === 'custom' ? 'mode-tab-active' : ''}`}
            onClick={() => setMode('custom')}
          >
            🤖 Custom Model
          </button>
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
      </main>

      <footer className="app-footer">
        <p>AV Ethics Simulator v1.0 | Built for ethical AI research and education</p>
      </footer>
    </div>
  );
}

export default App;
