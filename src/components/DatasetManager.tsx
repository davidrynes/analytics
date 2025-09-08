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
  videos_total?: number;
  videos_processed?: number;
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
      const response = await fetch('/api/datasets');
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
      const response = await fetch(`/api/datasets/${datasetId}/activate`, {
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

  const deleteDataset = async (datasetId: string) => {
    if (!window.confirm('Opravdu chcete smazat tento dataset? Tato akce je nevratná.')) {
      return;
    }

    try {
      const response = await fetch(`/api/datasets/${datasetId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        // Remove from local state
        setDatasets(prev => prev.filter(d => d.id !== datasetId));
        if (activeDataset === datasetId) {
          setActiveDataset(null);
        }
      } else {
        const error = await response.json();
        console.error('Error deleting dataset:', error);
        alert('Chyba při mazání datasetu: ' + error.error);
      }
    } catch (error) {
      console.error('Error deleting dataset:', error);
      alert('Chyba při mazání datasetu');
    }
  };

  const restartExtraction = async (datasetId: string) => {
    if (!window.confirm('Restartovat extrakci videí? Proces začne znovu od začátku.')) {
      return;
    }

    try {
      const response = await fetch(`/api/datasets/${datasetId}/restart-extraction`, {
        method: 'POST',
      });

      if (response.ok) {
        alert('Extrakce restartována! Sledujte progress bar nahoře.');
        await loadDatasets();
      } else {
        const error = await response.text();
        alert(`Chyba při restartu extrakce: ${error}`);
      }
    } catch (error) {
      console.error('Error restarting extraction:', error);
      alert('Chyba při restartu extrakce');
    }
  };

  const getStatusBadge = (dataset: Dataset) => {
    switch (dataset.status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800 text-xs h-5"><Check className="w-2 h-2 mr-1" />Dokončeno</Badge>;
      case 'processing':
        const progress = dataset.videos_total && dataset.videos_processed 
          ? ` (${dataset.videos_processed}/${dataset.videos_total})`
          : '';
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs h-5"><Clock className="w-2 h-2 mr-1" />Zpracovává se{progress}</Badge>;
      case 'error':
        return <Badge variant="destructive" className="text-xs h-5"><AlertCircle className="w-2 h-2 mr-1" />Chyba</Badge>;
      default:
        return <Badge variant="outline" className="text-xs h-5">Neznámý</Badge>;
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
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-4 w-4" />
            Správa souborů
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-base font-semibold mb-2">Nahrát Excel soubor</h3>
              <FileUpload onUpload={handleFileUpload} />
            </div>
            <div>
              <h3 className="text-base font-semibold mb-2">Nahrát zpracovaný CSV</h3>
              <CsvUpload onUpload={handleDatasetUpload} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Dostupné datasety ({datasets.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          {datasets.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <Database className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Zatím nebyl nahrán žádný soubor.</p>
              <p className="text-xs text-gray-400">Nahrajte soubor pomocí formuláře výše.</p>
            </div>
          ) : (
          <div className="space-y-3">
            <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
              Klikněte na "Aktivovat" pro přepnutí mezi různými Excel soubory.
            </div>
            
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="h-10">
                    <TableHead className="py-2 text-xs font-medium">Soubor</TableHead>
                    <TableHead className="py-2 text-xs font-medium">Status</TableHead>
                    <TableHead className="py-2 text-xs font-medium">Nahráno</TableHead>
                    <TableHead className="py-2 text-xs font-medium">Dokončeno</TableHead>
                    <TableHead className="py-2 text-xs font-medium">Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datasets.map((dataset) => (
                    <TableRow 
                      key={dataset.id}
                      className={`h-12 ${activeDataset === dataset.id ? 'bg-blue-50' : ''}`}
                    >
                      <TableCell className="py-2">
                        <div className="max-w-xs truncate text-sm font-medium" title={getWeekFromFilename(dataset.filename)}>
                          {getWeekFromFilename(dataset.filename)}
                        </div>
                        <div className="text-xs text-gray-500">{dataset.id}</div>
                      </TableCell>
                      <TableCell className="py-2">
                        {getStatusBadge(dataset)}
                        {dataset.error && (
                          <div className="text-xs text-red-600 mt-1" title={dataset.error}>
                            {dataset.error.substring(0, 40)}...
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-xs">
                        {formatDate(dataset.uploadTime)}
                      </TableCell>
                      <TableCell className="py-2 text-xs">
                        {dataset.completedTime ? formatDate(dataset.completedTime) : '-'}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex gap-1">
                          {dataset.status === 'completed' && (
                            <Button
                              variant={activeDataset === dataset.id ? "default" : "outline"}
                              size="sm"
                              onClick={() => activateDataset(dataset.id)}
                              className="h-7 px-2 text-xs"
                            >
                              {activeDataset === dataset.id ? 'Aktivní' : 'Aktivovat'}
                            </Button>
                          )}
                          {dataset.status === 'processing' && (
                            <Button variant="ghost" size="sm" disabled className="h-7 px-2 text-xs">
                              <Clock className="w-3 h-3 mr-1" />
                              Zpracovává se...
                            </Button>
                          )}
                          {dataset.status === 'error' && (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => restartExtraction(dataset.id)}
                                className="bg-orange-600 hover:bg-orange-700 h-7 px-2 text-xs"
                              >
                                Restart
                              </Button>
                              <Button
                                variant={activeDataset === dataset.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => activateDataset(dataset.id)}
                                disabled={!dataset.steps.extraction_completed}
                                title={!dataset.steps.extraction_completed ? "Extrakce nebyla dokončena" : ""}
                                className="h-7 px-2 text-xs"
                              >
                                {activeDataset === dataset.id ? 'Aktivní' : 'Aktivovat'}
                              </Button>
                            </>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteDataset(dataset.id)}
                            className="h-7 px-2 text-xs"
                          >
                            Smazat
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="flex justify-between items-center pt-2 border-t text-xs text-gray-500">
              <div>
                Automatická aktualizace každých 30 sekund
              </div>
              <Button variant="outline" size="sm" onClick={loadDatasets} className="h-7 px-2 text-xs">
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