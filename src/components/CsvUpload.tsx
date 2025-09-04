import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface CsvUploadProps {
  onUpload: (datasetId: string) => void;
}

const CsvUpload: React.FC<CsvUploadProps> = ({ onUpload }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [datasetId, setDatasetId] = useState('');

  const generateDatasetId = () => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const randomId = Math.random().toString(36).substr(2, 8);
    return `${timestamp}_${randomId}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      if (!datasetId) {
        setDatasetId(generateDatasetId());
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('csvFile', file);

      const response = await fetch(`/api/upload-csv/${datasetId}`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        console.log('CSV uploaded successfully:', result);
        onUpload(datasetId);
        setFile(null);
        setDatasetId('');
      } else {
        const error = await response.json();
        console.error('Upload failed:', error);
        alert('Nahrání se nezdařilo: ' + error.error);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Chyba při nahrávání: ' + error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nahrát zpracovaný CSV soubor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="csv-file">Vyberte CSV soubor</Label>
          <Input
            id="csv-file"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </div>
        
        <div>
          <Label htmlFor="dataset-id">ID datasetu (volitelné)</Label>
          <Input
            id="dataset-id"
            type="text"
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
            placeholder="Automaticky vygenerováno"
            disabled={uploading}
          />
        </div>

        <Button 
          onClick={handleUpload} 
          disabled={!file || uploading}
          className="w-full"
        >
          {uploading ? 'Nahrávám...' : 'Nahrát CSV'}
        </Button>

        {file && (
          <div className="text-sm text-gray-600">
            <p>Vybraný soubor: {file.name}</p>
            <p>Velikost: {(file.size / 1024).toFixed(1)} KB</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CsvUpload;
