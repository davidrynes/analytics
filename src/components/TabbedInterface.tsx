import React from 'react';
import { Button } from './ui/button';
import { Upload, BarChart3, Database, Edit3, Settings } from 'lucide-react';

interface TabbedInterfaceProps {
  children: React.ReactNode;
  activeTab: 'upload' | 'dashboard' | 'datasets' | 'sources' | 'editor';
  onTabChange: (tab: 'upload' | 'dashboard' | 'datasets' | 'sources' | 'editor') => void;
}

const TabbedInterface: React.FC<TabbedInterfaceProps> = ({ 
  children, 
  activeTab, 
  onTabChange 
}) => {
  const tabs = [
    { id: 'upload', label: 'Správa souborů', icon: Upload },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'datasets', label: 'Datasety', icon: Database },
    { id: 'sources', label: 'Zdroje', icon: Edit3 },
    { id: 'editor', label: 'Editor', icon: Settings },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                variant="ghost"
                onClick={() => onTabChange(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.label}
              </Button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {children}
      </div>
    </div>
  );
};

export default TabbedInterface;
