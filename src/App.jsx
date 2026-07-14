import { BrowserRouter, Routes, Route } from "react-router-dom";

import CompanySite from "./company-site";
import LeadershipPortal from "./leadership-portal";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CompanySite />} />
        <Route path="/leaders" element={<LeadershipPortal />} />
      </Routes>
    </BrowserRouter>
  );
}
