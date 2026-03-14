import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CompetitionProvider } from "./context/CompetitionContext";
import LoadCompetitionPage from "./pages/LoadCompetitionPage";
import DashboardPage from "./pages/DashboardPage";
import TeamPage from "./pages/TeamPage";
import QRScannerPage from "./pages/QRScannerPage";

function App() {
  return (
    <CompetitionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoadCompetitionPage />} />
          <Route path="/dashboard/:eventKey" element={<DashboardPage />} />
          <Route path="/dashboard/:eventKey/team/:teamNumber" element={<TeamPage />} />
          <Route path="/dashboard/:eventKey/scanner" element={<QRScannerPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </CompetitionProvider>
  );
}

export default App;
