import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Search, BarChart3, TrendingUp, Eye, Video, Filter } from 'lucide-react';

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

const MAIN_SOURCES = ['Novinky', 'Reuters', 'AP'];

// Barvy pro koláčový graf
const PIE_COLORS = {
  'Novinky': '#3b82f6',
  'Reuters': '#ef4444', 
  'Policie': '#10b981',
  'AP': '#f59e0b',
  'Ostatní': '#6b7280'
};

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

const Dashboard: React.FC = () => {
  const [data, setData] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRubrika, setSelectedRubrika] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [metricType, setMetricType] = useState<'count' | 'views'>('views');
  const [page, setPage] = useState(0);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const rowsPerPage = 10;

  useEffect(() => {
    loadDatasets();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedDataset) {
      loadDataForDataset(selectedDataset);
    } else {
      loadData();
    }
  }, [selectedDataset]);

  const loadDatasets = async () => {
    try {
      const response = await fetch('/api/datasets');
      const datasetsData = await response.json();
      setDatasets(datasetsData);
      
      // Automaticky vybereme nejnovější dokončený dataset
      const completedDatasets = datasetsData.filter((d: Dataset) => d.status === 'completed');
      if (completedDatasets.length > 0 && !selectedDataset) {
        setSelectedDataset(completedDatasets[0].id);
      }
    } catch (error) {
      console.error('Chyba při načítání datasetů:', error);
    }
  };

  const loadDataForDataset = async (datasetId: string) => {
    setLoading(true);
    try {
      const csvResponse = await fetch(`/datasets/${datasetId}/extracted.csv`);
      if (csvResponse.ok) {
        const csvText = await csvResponse.text();
        Papa.parse(csvText, {
          header: true,
          complete: (results: Papa.ParseResult<VideoData>) => {
            setData(results.data);
            setLoading(false);
          },
          error: (error: Papa.ParseError) => {
            console.error('Chyba při načítání dat:', error);
            setLoading(false);
          }
        } as Papa.ParseConfig<VideoData>);
      } else {
        console.error('Nepodařilo se načíst CSV soubor');
        setLoading(false);
      }
    } catch (error) {
      console.error('Chyba při načítání dat:', error);
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      // Nejdříve zkusíme načíst data z aktuálního aktivního datasetu
      const response = await fetch('/api/datasets');
      const datasets = await response.json();
      
      // Najdeme nejnovější dokončený dataset
      const completedDatasets = datasets.filter((d: any) => d.status === 'completed');
      if (completedDatasets.length > 0) {
        const latestDataset = completedDatasets[0]; // Už jsou seřazené podle času
        
        // Načteme data z nejnovějšího datasetu
        const csvResponse = await fetch(`/datasets/${latestDataset.id}/extracted.csv`);
        if (csvResponse.ok) {
          const csvText = await csvResponse.text();
          Papa.parse(csvText, {
            header: true,
            delimiter: ';',
            complete: (results: Papa.ParseResult<VideoData>) => {
              setData(results.data);
              setLoading(false);
            },
            error: (error: Papa.ParseError) => {
              console.error('Chyba při načítání dat:', error);
              setLoading(false);
            }
          } as Papa.ParseConfig<VideoData>);
          return;
        }
      }
      
      // Fallback na starý způsob
      Papa.parse('/videa_s_extrahovanymi_info.csv', {
        header: true,
        delimiter: ';',
        complete: (results: Papa.ParseResult<VideoData>) => {
          setData(results.data);
          setLoading(false);
        },
        error: (error: Papa.ParseError) => {
          console.error('Chyba při načítání dat:', error);
          setLoading(false);
        }
      } as Papa.ParseConfig<VideoData>);
    } catch (error) {
      console.error('Chyba při načítání datasetů:', error);
      setLoading(false);
    }
  };

  const processSource = (sourceString: string) => {
    if (!sourceString || sourceString === 'N/A') {
      return { mainSource: 'N/A', author: null, category: 'Ostatní zdroje' };
    }

    const parts = sourceString.split(',').map(s => s.trim());
    let mainSource: string | null = null;
    let author: string | null = null;

    for (const part of parts) {
      if (MAIN_SOURCES.includes(part)) {
        mainSource = part;
        break;
      }
    }

    if (mainSource) {
      author = parts.find(part => part !== mainSource) || null;
      return { mainSource, author, category: 'Hlavní zdroj' };
    } else {
      return { mainSource: parts[0] || 'N/A', author: parts[1] || null, category: 'Ostatní zdroje' };
    }
  };

  const getFilteredData = () => {
    return data.filter(item => {
      // Kontrola, že item existuje a má potřebné vlastnosti
      if (!item || !item['Název článku/videa'] || !item['Jméno rubriky']) {
        return false;
      }
      
      const matchesSearch = !searchTerm || item['Název článku/videa'].toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRubrika = !selectedRubrika || selectedRubrika === 'all' || item['Jméno rubriky'] === selectedRubrika;
      const matchesSource = !selectedSource || selectedSource === 'all' || processSource(item['Extrahované info']).mainSource === selectedSource;
      
      return matchesSearch && matchesRubrika && matchesSource;
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const filteredData = getFilteredData();

  const getRubriky = () => {
    return Array.from(new Set(data
      .filter(item => item && item['Jméno rubriky'])
      .map(item => item['Jméno rubriky'])
    ));
  };

  const getSources = () => {
    return Array.from(new Set(data
      .filter(item => item && item['Extrahované info'])
      .map(item => processSource(item['Extrahované info']).mainSource)
    ));
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

  // Základní statistiky
  const getBasicStats = () => {
    const views = data
      .filter(item => item && item['Views'])
      .map(item => Number(item['Views']));
    
    if (views.length === 0) {
      return {
        totalViews: 0,
        avgViews: 0,
        maxViews: 0,
        minViews: 0
      };
    }
    
    return {
      totalViews: views.reduce((sum, view) => sum + view, 0),
      avgViews: Math.round(views.reduce((sum, view) => sum + view, 0) / views.length),
      maxViews: Math.max(...views),
      minViews: Math.min(...views)
    };
  };

  // Statistiky podle rubrik (počet nebo Views)
  const getRubrikaStats = () => {
    const stats = data
      .filter(item => item && item['Jméno rubriky'] && item['Views'])
      .reduce((acc, item) => {
        const rubrika = item['Jméno rubriky'];
        if (!acc[rubrika]) {
          acc[rubrika] = { count: 0, views: 0 };
        }
        acc[rubrika].count += 1;
        acc[rubrika].views += Number(item['Views']);
        return acc;
      }, {} as Record<string, { count: number; views: number }>);

    return Object.entries(stats)
      .map(([name, data]) => ({
        name,
        value: metricType === 'count' ? data.count : data.views,
        count: data.count,
        views: data.views
      }))
      .sort((a, b) => b.value - a.value);
  };

  // Statistiky podle zdrojů (počet nebo Views)
  const getSourceStats = () => {
    const stats = data
      .filter(item => item && item['Extrahované info'] && item['Views'])
      .reduce((acc, item) => {
        const processed = processSource(item['Extrahované info']);
        if (processed.mainSource && processed.mainSource !== 'N/A') {
          if (!acc[processed.mainSource]) {
            acc[processed.mainSource] = { count: 0, views: 0 };
          }
          acc[processed.mainSource].count += 1;
          acc[processed.mainSource].views += Number(item['Views']);
        }
        return acc;
      }, {} as Record<string, { count: number; views: number }>);

    return Object.entries(stats)
      .map(([name, data]) => ({
        name,
        value: metricType === 'count' ? data.count : data.views,
        count: data.count,
        views: data.views
      }))
      .sort((a, b) => b.value - a.value);
  };

  // Kategorizované zdroje pro koláčový graf
  const getCategorizedSourceStats = () => {
    const stats = data
      .filter(item => item && item['Extrahované info'] && item['Views'])
      .reduce((acc, item) => {
        const processed = processSource(item['Extrahované info']);
        if (processed.mainSource && processed.mainSource !== 'N/A') {
          let category = 'Ostatní';
          
          if (processed.mainSource.includes('Novinky')) {
            category = 'Novinky';
          } else if (processed.mainSource.includes('Reuters')) {
            category = 'Reuters';
          } else if (processed.mainSource.includes('Policie')) {
            category = 'Policie';
          } else if (processed.mainSource.includes('AP')) {
            category = 'AP';
          }
          
          if (!acc[category]) {
            acc[category] = { count: 0, views: 0 };
          }
          acc[category].count += 1;
          acc[category].views += Number(item['Views']);
        }
        return acc;
      }, {} as Record<string, { count: number; views: number }>);

    return Object.entries(stats)
      .map(([name, data]) => ({
        name,
        value: metricType === 'count' ? data.count : data.views,
        count: data.count,
        views: data.views
      }))
      .sort((a, b) => b.value - a.value);
  };

  // Top videí podle Views
  const getTopVideos = () => {
    return data
      .sort((a, b) => Number(b['Views']) - Number(a['Views']))
      .slice(0, 10)
      .map((item, index) => ({
        rank: index + 1,
        name: item['Název článku/videa'],
        views: Number(item['Views']),
        rubrika: item['Jméno rubriky'],
        source: processSource(item['Extrahované info']).mainSource
      }));
  };

  // Top videí podle dokoukanosti (100%)
  const getTopCompletionVideos = () => {
    return data
      .filter(item => item && item['Dokoukanost do 100 %'] && !isNaN(Number(item['Dokoukanost do 100 %'])))
      .sort((a, b) => Number(b['Dokoukanost do 100 %']) - Number(a['Dokoukanost do 100 %']))
      .slice(0, 10)
      .map((item, index) => ({
        rank: index + 1,
        name: item['Název článku/videa'],
        completion: Number(item['Dokoukanost do 100 %']),
        views: Number(item['Views']),
        rubrika: item['Jméno rubriky'],
        source: processSource(item['Extrahované info']).mainSource
      }));
  };

  // Statistiky dokoukanosti
  const getCompletionStats = () => {
    const validData = data.filter(item => 
      item && 
      item['Dokoukanost do 25 %'] && 
      item['Dokoukanost do 50 %'] && 
      item['Dokoukanost do 75 %'] && 
      item['Dokoukanost do 100 %']
    );

    if (validData.length === 0) {
      return {
        avg25: 0, avg50: 0, avg75: 0, avg100: 0,
        total25: 0, total50: 0, total75: 0, total100: 0
      };
    }

    const stats = validData.reduce((acc, item) => {
      acc.total25 += Number(item['Dokoukanost do 25 %']);
      acc.total50 += Number(item['Dokoukanost do 50 %']);
      acc.total75 += Number(item['Dokoukanost do 75 %']);
      acc.total100 += Number(item['Dokoukanost do 100 %']);
      return acc;
    }, { total25: 0, total50: 0, total75: 0, total100: 0 });

    return {
      avg25: Math.round(stats.total25 / validData.length * 100) / 100,
      avg50: Math.round(stats.total50 / validData.length * 100) / 100,
      avg75: Math.round(stats.total75 / validData.length * 100) / 100,
      avg100: Math.round(stats.total100 / validData.length * 100) / 100,
      total25: Math.round(stats.total25 * 100) / 100,
      total50: Math.round(stats.total50 * 100) / 100,
      total75: Math.round(stats.total75 * 100) / 100,
      total100: Math.round(stats.total100 * 100) / 100
    };
  };

  // Data pro graf dokoukanosti
  const getCompletionChartData = () => {
    return [
      { name: '25%', value: getCompletionStats().avg25, color: '#ef4444' },
      { name: '50%', value: getCompletionStats().avg50, color: '#f59e0b' },
      { name: '75%', value: getCompletionStats().avg75, color: '#10b981' },
      { name: '100%', value: getCompletionStats().avg100, color: '#3b82f6' }
    ];
  };

  // Funkce pro řazení
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Seřazená data pro tabulku
  const getSortedData = () => {
    if (!sortConfig) return getFilteredData();

    return [...getFilteredData()].sort((a, b) => {
      let aValue: any = a[sortConfig.key as keyof VideoData];
      let bValue: any = b[sortConfig.key as keyof VideoData];

      // Speciální zpracování pro číselné hodnoty
      if (sortConfig.key === 'Views' || sortConfig.key.includes('Dokoukanost')) {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  const basicStats = getBasicStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Načítám data...</p>
        </div>
      </div>
    );
  }

  const renderChart = (data: any[], title: string, color: string = '#8884d8') => {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip 
            formatter={(value: any, name: any) => [
              metricType === 'count' ? `${value} videí` : `${value.toLocaleString()} Views`,
              metricType === 'count' ? 'Počet videí' : 'Celkové Views'
            ]}
          />
          <Bar dataKey="value" fill={color} stroke={color} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderCompletionChart = (data: any[], title: string) => {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip formatter={(value: any) => [`${value}%`, 'Dokoukanost']} />
          <Bar dataKey="value">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderPieChart = (data: any[], title: string) => {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }: { name: string; percent?: number }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name as keyof typeof PIE_COLORS] || '#6b7280'} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: any, name: any) => [
              metricType === 'count' ? `${value} videí` : `${value.toLocaleString()} Views`,
              metricType === 'count' ? 'Počet videí' : 'Celkové Views'
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Video Analytics Dashboard</h1>
          <p className="text-gray-600">Analýza videí z Novinky.cz</p>
        </div>

        {/* Filtry */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtry a vyhledávání
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="week">Týden</Label>
                <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Vyberte týden" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets
                      .filter(d => d.status === 'completed')
                      .map((dataset) => (
                        <SelectItem key={dataset.id} value={dataset.id}>
                          {getWeekFromFilename(dataset.filename)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="search">Hledat v názvech</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Zadejte název videa..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="rubrika">Rubrika</Label>
                <Select value={selectedRubrika} onValueChange={setSelectedRubrika}>
                  <SelectTrigger>
                    <SelectValue placeholder="Všechny rubriky" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Všechny</SelectItem>
                    {getRubriky().map((rubrika) => (
                      <SelectItem key={rubrika} value={rubrika}>{rubrika}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="source">Zdroj</Label>
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger>
                    <SelectValue placeholder="Všechny zdroje" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Všechny</SelectItem>
                    {getSources().map((source) => (
                      <SelectItem key={source} value={source}>{source}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Přepínač metrik */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Nastavení analýzy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Label>Metrika:</Label>
              <ToggleGroup type="single" value={metricType} onValueChange={(value) => value && setMetricType(value as 'count' | 'views')}>
                <ToggleGroupItem value="count">Počet videí</ToggleGroupItem>
                <ToggleGroupItem value="views">Views</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardContent>
        </Card>

        {/* Statistiky */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Celkem videí</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.length}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Celkem Views</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{basicStats.totalViews.toLocaleString()}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Průměrné Views</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{basicStats.avgViews.toLocaleString()}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Max Views</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{basicStats.maxViews.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        {/* Statistiky dokoukanosti */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Průměrná dokoukanost 25%</CardTitle>
              <div className="h-4 w-4 rounded-full bg-red-500"></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{getCompletionStats().avg25}%</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Průměrná dokoukanost 50%</CardTitle>
              <div className="h-4 w-4 rounded-full bg-orange-500"></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{getCompletionStats().avg50}%</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Průměrná dokoukanost 75%</CardTitle>
              <div className="h-4 w-4 rounded-full bg-green-500"></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{getCompletionStats().avg75}%</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Průměrná dokoukanost 100%</CardTitle>
              <div className="h-4 w-4 rounded-full bg-blue-500"></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{getCompletionStats().avg100}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Grafy */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Rozdělení podle rubrik - {metricType === 'count' ? 'Počet videí' : 'Views'}</CardTitle>
            </CardHeader>
            <CardContent>
              {renderChart(getRubrikaStats(), 'Rubriky', '#3b82f6')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kategorizované zdroje - {metricType === 'count' ? 'Počet videí' : 'Views'}</CardTitle>
            </CardHeader>
            <CardContent>
              {renderPieChart(getCategorizedSourceStats(), 'Kategorizované zdroje')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Všechny zdroje - {metricType === 'count' ? 'Počet videí' : 'Views'}</CardTitle>
            </CardHeader>
            <CardContent>
              {renderChart(getSourceStats(), 'Všechny zdroje', '#f59e0b')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Průměrná dokoukanost videí</CardTitle>
            </CardHeader>
            <CardContent>
              {renderCompletionChart(getCompletionChartData(), 'Dokoukanost')}
            </CardContent>
          </Card>
        </div>

        {/* Top videí */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Top 10 videí podle Views</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pořadí</TableHead>
                    <TableHead>Název</TableHead>
                    <TableHead>Rubrika</TableHead>
                    <TableHead>Zdroj</TableHead>
                    <TableHead>Views</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getTopVideos().map((video) => (
                    <TableRow key={video.rank}>
                      <TableCell>
                        <Badge variant="secondary">#{video.rank}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate" title={video.name}>
                          {video.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{video.rubrika}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{video.source}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">{video.views.toLocaleString()}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top 10 videí podle dokoukanosti</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pořadí</TableHead>
                    <TableHead>Název</TableHead>
                    <TableHead>Rubrika</TableHead>
                    <TableHead>Zdroj</TableHead>
                    <TableHead>Dokoukanost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getTopCompletionVideos().map((video) => (
                    <TableRow key={video.rank}>
                      <TableCell>
                        <Badge variant="secondary">#{video.rank}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate" title={video.name}>
                          {video.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{video.rubrika}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{video.source}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-green-600">{video.completion}%</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Hlavní tabulka */}
        <Card>
          <CardHeader>
            <CardTitle>Seznam videí</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('Název článku/videa')}
                  >
                    Název
                    {sortConfig?.key === 'Název článku/videa' && (
                      <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('Jméno rubriky')}
                  >
                    Rubrika
                    {sortConfig?.key === 'Jméno rubriky' && (
                      <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('Views')}
                  >
                    Views
                    {sortConfig?.key === 'Views' && (
                      <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('Dokoukanost do 100 %')}
                  >
                    Dokoukanost
                    {sortConfig?.key === 'Dokoukanost do 100 %' && (
                      <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </TableHead>
                  <TableHead>Hlavní zdroj</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead>URL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getSortedData()
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((row, index) => {
                    const processed = processSource(row['Extrahované info']);
                    return (
                      <TableRow key={index}>
                        <TableCell>
                          <div className="max-w-xs truncate" title={row['Název článku/videa']}>
                            {row['Název článku/videa']}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{row['Jméno rubriky']}</Badge>
                        </TableCell>
                        <TableCell>{Number(row['Views']).toLocaleString()}</TableCell>
                        <TableCell>
                          {row['Dokoukanost do 100 %'] && !isNaN(Number(row['Dokoukanost do 100 %'])) ? (
                            <span className="font-medium text-green-600">
                              {Number(row['Dokoukanost do 100 %']).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={processed.category === 'Hlavní zdroj' ? 'default' : 'secondary'}
                          >
                            {processed.mainSource}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {processed.author ? (
                            <Badge variant="outline">{processed.author}</Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={processed.category === 'Hlavní zdroj' ? 'default' : 'secondary'}
                          >
                            {processed.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" asChild>
                            <a href={row['Novinky URL']} target="_blank" rel="noopener noreferrer">
                              Zobrazit
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
            
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-600">
                Zobrazeno {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, getSortedData().length)} z {getSortedData().length} výsledků
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                >
                  Předchozí
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * rowsPerPage >= getSortedData().length}
                >
                  Další
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;

