import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import CsvUpload from './CsvUpload';
import FileUpload from './FileUpload';
import { Database, Check, Clock, AlertCircle } from 'lucide-react';

interface Dataset {
  id: string;
  filename: string;
  uploadTime: string;
  completedTime?: string;
  status: 'processing' | 'completed' | 'error';
  steps: {
    excel_processed: boolean;
    extraction_completed: boolean;
  };
  error?: string;
}

interface DatasetManagerProps {
  onDatasetSelected?: (datasetId: string) => void;
}

const DatasetManager: React.FC<DatasetManagerProps> = ({ onDatasetSelected }) => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDataset, setActiveDataset] = useState<string | null>(null);

  const loadDatasets = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/datasets');
      const data = await response.json();
      setDatasets(data);
    } catch (error) {
      console.error('Error loading datasets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (file: File) => {
    console.log('File uploaded:', file.name);
    // The parent component will handle the actual upload
  };

  const handleDatasetUpload = (datasetId: string) => {
    console.log('Dataset uploaded:', datasetId);
    // Refresh the datasets list
    loadDatasets();
  };

  const activateDataset = async (datasetId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/datasets/${datasetId}/activate`, {
        method: 'POST',
      });
      
      if (response.ok) {
        setActiveDataset(datasetId);
        onDatasetSelected?.(datasetId);
        // Refresh page to load new data
        window.location.reload();
      } else {
        const error = await response.json();
        console.error('Error activating dataset:', error);
      }
    } catch (error) {
      console.error('Error activating dataset:', error);
    }
  };

  const getStatusBadge = (dataset: Dataset) => {
    switch (dataset.status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800"><Check className="w-3 h-3 mr-1" />Dokončeno</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><Clock className="w-3 h-3 mr-1" />Zpracovává se</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Chyba</Badge>;
      default:
        return <Badge variant="outline">Neznámý</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('cs-CZ');
  };

  const getWeekFromFilename = (filename: string) => {
    // Extrahuje datum z názvu souboru: Reporter_Novinky.cz_Sledovanost_videí_-_NOVÁ_20250825-20250831.xlsx
    const match = filename.match(/(\d{8})-(\d{8})/);
    if (match) {
      const startDate = match[1];
      const endDate = match[2];
      const start = new Date(
        parseInt(startDate.slice(0,4)), 
        parseInt(startDate.slice(4,6))-1, 
        parseInt(startDate.slice(6,8))
      );
      const end = new Date(
        parseInt(endDate.slice(0,4)), 
        parseInt(endDate.slice(4,6))-1, 
        parseInt(endDate.slice(6,8))
      );
      return `${start.toLocaleDateString('cs-CZ')} - ${end.toLocaleDateString('cs-CZ')}`;
    }
    return filename;
  };

  useEffect(() => {
    loadDatasets();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadDatasets, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Správa Excel souborů
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2">Načítám...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Správa souborů
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Nahrát Excel soubor</h3>
              <FileUpload onUpload={handleFileUpload} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Nahrát zpracovaný CSV</h3>
              <CsvUpload onUpload={handleDatasetUpload} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dostupné datasety ({datasets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {datasets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Database className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Zatím nebyl nahrán žádný soubor.</p>
              <p className="text-sm">Nahrajte soubor pomocí formuláře výše.</p>
            </div>
          ) : (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              Klikněte na "Aktivovat" pro přepnutí mezi různými Excel soubory.
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Soubor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Nahráno</TableHead>
                  <TableHead>Dokončeno</TableHead>
                  <TableHead>Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map((dataset) => (
                  <TableRow 
                    key={dataset.id}
                    className={activeDataset === dataset.id ? 'bg-blue-50' : ''}
                  >
                    <TableCell>
                      <div className="max-w-xs truncate font-medium" title={getWeekFromFilename(dataset.filename)}>
                        {getWeekFromFilename(dataset.filename)}
                      </div>
                      <div className="text-xs text-gray-500">{dataset.id}</div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(dataset)}
                      {dataset.error && (
                        <div className="text-xs text-red-600 mt-1" title={dataset.error}>
                          {dataset.error.substring(0, 50)}...
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(dataset.uploadTime)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {dataset.completedTime ? formatDate(dataset.completedTime) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {dataset.status === 'completed' && (
                          <Button
                            variant={activeDataset === dataset.id ? "default" : "outline"}
                            size="sm"
                            onClick={() => activateDataset(dataset.id)}
                          >
                            {activeDataset === dataset.id ? 'Aktivní' : 'Aktivovat'}
                          </Button>
                        )}
                        {dataset.status === 'processing' && (
                          <Button variant="ghost" size="sm" disabled>
                            <Clock className="w-4 h-4 mr-1" />
                            Zpracovává se...
                          </Button>
                        )}
                        {dataset.status === 'error' && (
                          <Button variant="ghost" size="sm" disabled>
                            <AlertCircle className="w-4 h-4 mr-1" />
                            Chyba
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            <div className="flex justify-between items-center pt-2 border-t">
              <div className="text-sm text-gray-500">
                Automatická aktualizace každých 30 sekund
              </div>
              <Button variant="outline" size="sm" onClick={loadDatasets}>
                Aktualizovat
              </Button>
            </div>
                      </div>
          )}
        </CardContent>
      </Card>
    </div>
    );
  };

export default DatasetManager;