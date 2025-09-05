import React, { useState } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import Header from './components/Header';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import DatasetManager from './components/DatasetManager';
import ManualSourceEditor from './components/ManualSourceEditor';
import DatasetEditor from './components/DatasetEditor';
import TrendsAnalysis from './components/TrendsAnalysis';
import GlobalProgress from './components/GlobalProgress';
import TabbedInterface from './components/TabbedInterface';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'upload' | 'dashboard' | 'datasets' | 'sources' | 'editor' | 'trends'>('upload');

  const handleDatasetSelected = () => {
    setActiveTab('dashboard');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'upload':
        return (
          <div className="space-y-8">
            <FileUpload />
            <DatasetManager onDatasetSelected={handleDatasetSelected} />
          </div>
        );
      case 'dashboard':
        return <Dashboard />;
      case 'datasets':
        return <DatasetManager onDatasetSelected={handleDatasetSelected} />;
      case 'sources':
        return <ManualSourceEditor />;
      case 'editor':
        return <DatasetEditor />;
      case 'trends':
        return <TrendsAnalysis />;
      default:
        return null;
    }
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-4">
            <GlobalProgress />
            <TabbedInterface 
              activeTab={activeTab} 
              onTabChange={setActiveTab}
            >
              {renderContent()}
            </TabbedInterface>
          </div>
        </div>
      </div>
    </Router>
  );
};

export default App;
