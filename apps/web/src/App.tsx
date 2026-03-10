import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Pages are implemented in Phase4 (Frontend Core).
// Placeholder components allow the app to compile now.
const Placeholder = ({ name }: { name: string }) => (
  <div style={{ padding: 32, fontFamily: 'monospace' }}>
    <h2>FXDE — {name}</h2>
    <p>Phase4 implementation pending.</p>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Placeholder name="Dashboard" />} />
        <Route path="/trades" element={<Placeholder name="Trades" />} />
        <Route path="/trades/:id" element={<Placeholder name="Trade Detail" />} />
        <Route path="/analytics" element={<Placeholder name="Analytics" />} />
        <Route path="/journal" element={<Placeholder name="Journal" />} />
        <Route path="/chart" element={<Placeholder name="Chart" />} />
        <Route path="/settings" element={<Placeholder name="Settings" />} />
        <Route path="*" element={<Placeholder name="404" />} />
      </Routes>
    </BrowserRouter>
  );
}
