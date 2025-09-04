import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface ProgressData {
  current: number;
  total: number;
  status: string;
  message: string;
  percentage: number;
}

const GlobalProgress: React.FC = () => {
  const [progress, setProgress] = useState<ProgressData | null>(null);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const fetchProgress = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/progress');
        const data = await response.json();
        
        // Only show progress if there's active processing
        if (data.status === 'processing') {
          setProgress(data);
        } else if (data.status === 'completed' && progress?.status === 'processing') {
          // Show completed state briefly
          setProgress(data);
          setTimeout(() => setProgress(null), 5000);
        } else if (data.status === 'idle' || data.status === 'completed' || !data.status) {
          setProgress(null);
        }
      } catch (error) {
        console.error('Error fetching progress:', error);
      }
    };

    // Fetch immediately
    fetchProgress();

    // Then poll every 3 seconds
    intervalId = setInterval(fetchProgress, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, [progress?.status]);

  if (!progress) return null;

  const getStatusIcon = () => {
    switch (progress.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusBadge = () => {
    switch (progress.status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Dokončeno</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800">Zpracovává se</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Čeká</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            Extrakce videí z Novinky.cz
          </div>
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span>Progress: {progress.current} z {progress.total} videí</span>
          <span className="font-medium">{progress.percentage}%</span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress.percentage}%` }}
          ></div>
        </div>
        
        <p className="text-xs text-gray-600">{progress.message}</p>
        
        {progress.status === 'processing' && (
          <p className="text-xs text-blue-600">
            Odhadovaný čas: ~{Math.round((progress.total - progress.current) * 3.5 / 60)} minut
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default GlobalProgress;