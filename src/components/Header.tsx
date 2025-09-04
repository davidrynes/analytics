import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { Video, Upload, BarChart3 } from 'lucide-react';

const Header: React.FC = () => {
  const location = useLocation();

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Video className="h-8 w-8 text-blue-600 mr-3" />
            <h1 className="text-xl font-bold text-gray-900">Video Analytics</h1>
          </div>
          
          <nav className="flex space-x-4">
            <Button
              variant={location.pathname === '/' ? 'default' : 'ghost'}
              asChild
            >
              <Link to="/" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Správa souborů
              </Link>
            </Button>
            
            <Button
              variant={location.pathname === '/dashboard' ? 'default' : 'ghost'}
              asChild
            >
              <Link to="/dashboard" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
