import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Trash2, Calendar, Video, CheckCircle, XCircle } from 'lucide-react';

interface Dataset {
  id: string;
  name: string;
  createdAt: string;
  hasExtracted: boolean;
  videoCount: number;
}

interface DatasetManagerProps {
  onDatasetSelected?: () => void;
}

const DatasetManager: React.FC<DatasetManagerProps> = ({ onDatasetSelected }) => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      const response = await fetch('/api/datasets');
      if (response.ok) {
        const data = await response.json();
        setDatasets(data);
      } else {
        console.error('Failed to load datasets');
      }
    } catch (error) {
      console.error('Error loading datasets:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteDataset = async (datasetId: string) => {
    if (!confirm('Opravdu chcete smazat tento dataset? Tato akce je nevratná.')) {
      return;
    }

    setDeleting(datasetId);
    try {
      const response = await fetch(`/api/datasets/${datasetId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setDatasets(datasets.filter(d => d.id !== datasetId));
      } else {
        const error = await response.json();
        alert(`Chyba při mazání: ${error.error}`);
      }
    } catch (error) {
      console.error('Error deleting dataset:', error);
      alert('Chyba při mazání datasetu');
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('cs-CZ', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Načítám datasety...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Správa datasetů</h2>
        <Button onClick={loadDatasets} variant="outline">
          Obnovit
        </Button>
      </div>

      {datasets.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-500">Žádné datasety nebyly nalezeny.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {datasets.map((dataset) => (
            <Card key={dataset.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{dataset.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    {dataset.hasExtracted ? (
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Zpracováno
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <XCircle className="w-3 h-3 mr-1" />
                        Nezpracováno
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(dataset.createdAt)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Video className="w-4 h-4" />
                      {dataset.videoCount} videí
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteDataset(dataset.id)}
                    disabled={deleting === dataset.id}
                  >
                    {deleting === dataset.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-1" />
                        Smazat
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default DatasetManager;