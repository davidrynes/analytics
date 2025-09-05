import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

interface VideoData {
  'Jméno rubriky': string;
  'Název článku/videa': string;
  'Views': string;
  'Dokoukanost do 25 %': string;
  'Dokoukanost do 50 %': string;
  'Dokoukanost do 75 %': string;
  'Dokoukanost do 100 %': string;
  'Extrahované info': string;
  'Novinky URL': string;
}

interface Dataset {
  id: string;
  filename?: string;
  uploadTime?: string;
  status?: string;
  hasExtracted: boolean;
}

const DatasetEditor: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCell, setEditingCell] = useState<{row: number, field: string} | null>(null);
  const [editValue, setEditValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      const response = await fetch('/api/datasets');
      if (response.ok) {
        const data = await response.json();
        // Pouze datasety s extracted.csv
        const extractedDatasets = data.filter((dataset: Dataset) => dataset.hasExtracted);
        setDatasets(extractedDatasets);
      }
    } catch (error) {
      console.error('Error loading datasets:', error);
    }
  };

  const loadDatasetData = async (datasetId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/datasets/${datasetId}/extracted.csv`);
      if (response.ok) {
        const csvText = await response.text();
        
        // Parse CSV with semicolon delimiter
        const lines = csvText.split('\n');
        const headers = lines[0].split(';');
        const data: VideoData[] = [];
        
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim()) {
            const values = lines[i].split(';');
            const row: any = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });
            data.push(row);
          }
        }
        
        setVideos(data);
        setCurrentPage(1);
      } else {
        console.error('Failed to load dataset data');
        setVideos([]);
      }
    } catch (error) {
      console.error('Error loading dataset data:', error);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDatasetChange = (datasetId: string) => {
    setSelectedDataset(datasetId);
    if (datasetId) {
      loadDatasetData(datasetId);
    } else {
      setVideos([]);
    }
  };

  const startEditing = (rowIndex: number, field: string, currentValue: string) => {
    setEditingCell({ row: rowIndex, field });
    setEditValue(currentValue);
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEdit = () => {
    if (editingCell) {
      const newVideos = [...videos];
      (newVideos[editingCell.row] as any)[editingCell.field] = editValue;
      setVideos(newVideos);
      setEditingCell(null);
      setEditValue('');
    }
  };

  const saveDataset = async () => {
    if (!selectedDataset || videos.length === 0) return;
    
    setSaving(true);
    try {
      // Convert videos back to CSV format
      const headers = Object.keys(videos[0]);
      const csvLines = [headers.join(';')];
      
      videos.forEach(video => {
        const values = headers.map(header => (video as any)[header] || '');
        csvLines.push(values.join(';'));
      });
      
      const csvContent = csvLines.join('\n');
      
      const response = await fetch(`/api/datasets/${selectedDataset}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: csvContent,
      });
      
      if (response.ok) {
        alert('Dataset byl úspěšně uložen!');
      } else {
        alert('Chyba při ukládání datasetu.');
      }
    } catch (error) {
      console.error('Error saving dataset:', error);
      alert('Chyba při ukládání datasetu.');
    } finally {
      setSaving(false);
    }
  };

  // Filter videos based on search term
  const filteredVideos = videos.filter(video => 
    video['Název článku/videa']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    video['Jméno rubriky']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    video['Extrahované info']?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredVideos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedVideos = filteredVideos.slice(startIndex, startIndex + itemsPerPage);

  const editableFields = [
    'Jméno rubriky',
    'Název článku/videa', 
    'Extrahované info'
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Editor Datasetů</h1>
        <Button 
          onClick={saveDataset} 
          disabled={!selectedDataset || videos.length === 0 || saving}
          className="bg-green-600 hover:bg-green-700"
        >
          {saving ? 'Ukládám...' : 'Uložit změny'}
        </Button>
      </div>

      {/* Dataset Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Vybrat Dataset</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedDataset} onValueChange={handleDatasetChange}>
            <SelectTrigger>
              <SelectValue placeholder="Vyberte dataset k editaci" />
            </SelectTrigger>
            <SelectContent>
              {datasets.map((dataset) => (
                <SelectItem key={dataset.id} value={dataset.id}>
                  {dataset.filename || dataset.id} 
                  <Badge variant="secondary" className="ml-2">
                    {dataset.uploadTime ? new Date(dataset.uploadTime).toLocaleDateString('cs-CZ') : 'N/A'}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedDataset && (
        <>
          {/* Search */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4 items-center">
                <Input
                  placeholder="Hledat podle názvu, rubriky nebo zdroje..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
                <Badge variant="outline">
                  {filteredVideos.length} z {videos.length} videí
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-lg">Načítám data...</div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead className="min-w-[120px]">Rubrika</TableHead>
                        <TableHead className="min-w-[300px]">Název videa</TableHead>
                        <TableHead className="w-20">Views</TableHead>
                        <TableHead className="w-20">25%</TableHead>
                        <TableHead className="w-20">50%</TableHead>
                        <TableHead className="w-20">75%</TableHead>
                        <TableHead className="w-20">100%</TableHead>
                        <TableHead className="min-w-[200px]">Zdroj</TableHead>
                        <TableHead className="min-w-[300px]">URL</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedVideos.map((video, index) => {
                        const actualIndex = startIndex + index;
                        return (
                          <TableRow key={actualIndex}>
                            <TableCell className="font-medium">
                              {actualIndex + 1}
                            </TableCell>
                            {Object.entries(video).map(([field, value]) => (
                              <TableCell key={field} className="max-w-[300px]">
                                {editingCell?.row === actualIndex && editingCell?.field === field ? (
                                  <div className="flex gap-2">
                                    <Input
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      className="h-8"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEdit();
                                        if (e.key === 'Escape') cancelEditing();
                                      }}
                                    />
                                    <Button size="sm" onClick={saveEdit} className="h-8 px-2">
                                      ✓
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={cancelEditing} className="h-8 px-2">
                                      ✕
                                    </Button>
                                  </div>
                                ) : (
                                  <div
                                    className={`truncate ${
                                      editableFields.includes(field)
                                        ? 'cursor-pointer hover:bg-gray-100 p-1 rounded'
                                        : ''
                                    }`}
                                    onClick={() => {
                                      if (editableFields.includes(field)) {
                                        startEditing(actualIndex, field, value);
                                      }
                                    }}
                                    title={value}
                                  >
                                    {value || (editableFields.includes(field) ? '(klikněte pro editaci)' : '-')}
                                  </div>
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    Předchozí
                  </Button>
                  <span className="flex items-center px-4">
                    Stránka {currentPage} z {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Další
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default DatasetEditor;
