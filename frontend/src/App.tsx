import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/ui/Layout';
import { Dashboard } from './pages/Dashboard';
import { Predictions } from './pages/Predictions';
import { Backtests } from './pages/Backtests';
import { Portfolio } from './pages/Portfolio';
import { ModelLab } from './pages/ModelLab';
import { Settings } from './pages/Settings';
import { Toaster } from 'sonner';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/predictions" element={<Predictions />} />
          <Route path="/backtests" element={<Backtests />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/models" element={<ModelLab />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
      <Toaster theme="dark" position="bottom-right" />
    </Router>
  );
}

export default App;
