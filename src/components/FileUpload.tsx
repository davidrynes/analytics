import React, { useState } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface VideoData {
  'Jméno rubriky': string;
  'Název článku/videa': string;
  'Views': string;
  'Extrahované info': string;
  'Novinky URL': string;
}

interface FileUploadProps {
  onUpload?: (file: File) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUpload }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [processedData, setProcessedData] = useState<VideoData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0, message: '' });

  const steps = [
    'Nahrání Excel souboru',
    'Vyčištění dat',
    'Extrakce zdrojů',
    'Dokončeno'
  ];

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      setSelectedFile(file);
      setError(null);
      // Call the onUpload callback if provided
      if (onUpload) {
        onUpload(file);
      }
    } else {
      setError('Prosím vyberte platný Excel soubor (.xlsx)');
    }
  };

  const startProcessing = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setError(null);
    setCurrentStep(0);

    try {
      // Krok 1: Nahrání Excel souboru
      const formData = new FormData();
      formData.append('file', selectedFile);

      setCurrentStep(0);
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Chyba při nahrávání souboru');
      }

      const result = await response.json();
      console.log('Upload result:', result);

      // Krok 2: Vyčištění dat (dokončeno)
      setCurrentStep(1);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Krok 3: Extrakce zdrojů (běží na pozadí)
      setCurrentStep(2);
      
      // Čekáme na dokončení extrakce
      await waitForProcessingComplete();

      // Krok 4: Načtení výsledků
      setCurrentStep(3);
      Papa.parse('/videa_s_extrahovanymi_info.csv', {
        download: true,
        header: true,
        delimiter: ';',
        complete: (results: Papa.ParseResult<VideoData>) => {
          setProcessedData(results.data);
          setIsProcessing(false);
        },
        error: (error: Papa.ParseError) => {
          setError('Chyba při načítání výsledků: ' + error.message);
          setIsProcessing(false);
        }
      } as Papa.ParseConfig<VideoData>);

    } catch (err) {
      setError('Chyba při zpracování: ' + (err as Error).message);
      setIsProcessing(false);
    }
  };

  const waitForProcessingComplete = async (): Promise<void> => {
    const maxAttempts = 60; // 5 minut (60 * 5s)
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        // Získáme progress info
        const progressResponse = await fetch('/api/progress');
        const progressData = await progressResponse.json();
        
        // Aktualizace progress státu
        setProgress(progressData);

        // Kontrola dokončení
        const statusResponse = await fetch('/api/status');
        const statusResult = await statusResponse.json();

        if (statusResult.status === 'completed') {
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 3000)); // Čekáme 3 sekundy
        attempts++;
      } catch (error) {
        console.error('Error checking progress:', error);
        await new Promise(resolve => setTimeout(resolve, 3000));
        attempts++;
      }
    }

    throw new Error('Zpracování trvá příliš dlouho. Zkuste to později.');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Nahrání Excel souboru</h1>
          <p className="text-gray-600">Nahrajte Excel soubor pro analýzu videí z Novinky.cz</p>
        </div>

        {/* Upload sekce */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Výběr souboru
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file-upload">Excel soubor</Label>
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx"
                onChange={handleFileSelect}
                className="cursor-pointer"
              />
            </div>

            {selectedFile && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-green-800">
                  Vybraný soubor: <strong>{selectedFile.name}</strong>
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span className="text-red-800">{error}</span>
              </div>
            )}

            <Button
              onClick={startProcessing}
              disabled={!selectedFile || isProcessing}
              className="w-full"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Zpracovávám...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Spustit zpracování
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Progress sekce */}
        {isProcessing && (
          <Card>
            <CardHeader>
              <CardTitle>Průběh zpracování</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      index < currentStep
                        ? 'bg-green-100 text-green-800'
                        : index === currentStep
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      {index < currentStep ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span className={index <= currentStep ? 'text-gray-900' : 'text-gray-400'}>
                      {step}
                    </span>
                  </div>
                ))}
                
                {/* Progress bar pro krok 3 (extrakce) */}
                {currentStep === 2 && progress.total > 0 && (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-800">
                        Extrakce zdrojů videí
                      </span>
                      <span className="text-sm text-blue-600">
                        {progress.current} / {progress.total} ({progress.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${progress.percentage}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-blue-600 mt-2">{progress.message}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Výsledky */}
        {processedData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Zpracovaná data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-green-800">
                    Úspěšně zpracováno <strong>{processedData.length}</strong> videí
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rubrika</TableHead>
                        <TableHead>Název</TableHead>
                        <TableHead>Views</TableHead>
                        <TableHead>Zdroj</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {processedData.slice(0, 5).map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Badge variant="outline">{item['Jméno rubriky']}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs truncate" title={item['Název článku/videa']}>
                              {item['Název článku/videa']}
                            </div>
                          </TableCell>
                          <TableCell>{Number(item['Views']).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{item['Extrahované info']}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {processedData.length > 5 && (
                  <p className="text-sm text-gray-600 text-center">
                    Zobrazeno prvních 5 záznamů z celkových {processedData.length}
                  </p>
                )}

                <div className="text-center">
                  <Button asChild>
                    <a href="/dashboard">Přejít na Dashboard</a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
