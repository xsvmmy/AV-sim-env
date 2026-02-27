import React, { useState } from 'react';
import Visualization from './components/Visualization';
import './App.css';

function App() {
  const [currentScenario, setCurrentScenario] = useState(null);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🚗 Autonomous Vehicle Ethics Simulator</h1>
        <p className="app-subtitle">
          Configure and visualize ethical dilemmas for autonomous vehicles
        </p>
      </header>

      <main>
        <Visualization
          key={currentScenario?.id}
          scenario={currentScenario}
          onScenarioLoaded={setCurrentScenario}
        />
      </main>

      <footer className="app-footer">
        <p>AV Ethics Simulator v1.0 | Built for ethical AI research and education</p>
      </footer>
    </div>
  );
}

export default App;
