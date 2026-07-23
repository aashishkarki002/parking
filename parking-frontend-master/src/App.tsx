import { Navigate, Route, Routes } from 'react-router-dom';
import RootPage from './pages/RootPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
