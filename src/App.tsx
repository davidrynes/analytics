import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import DatasetManager from './components/DatasetManager';
import ManualSourceEditor from './components/ManualSourceEditor';
import GlobalProgress from './components/GlobalProgress';

const App: React.FC = () => {
  const handleDatasetSelected = () => {
    // Force dashboard refresh when dataset is changed
    window.location.pathname = '/dashboard';
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-4">
            <GlobalProgress />
            <Routes>
              <Route path="/" element={
                <div className="space-y-8">
                  <FileUpload />
                  <DatasetManager onDatasetSelected={handleDatasetSelected} />
                </div>
              } />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/datasets" element={<DatasetManager onDatasetSelected={handleDatasetSelected} />} />
              <Route path="/sources" element={<ManualSourceEditor />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
};

export default App;
