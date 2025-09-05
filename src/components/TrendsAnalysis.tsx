import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { TrendingUp, TrendingDown, Calendar, Eye, Video, BarChart3 } from 'lucide-react';

interface Dataset {
  id: string;
  filename?: string;
  uploadTime?: string;
  status?: string;
  hasExtracted: boolean;
}

interface WeeklyMetrics {
  weekRange: string;
  weekStart: Date;
  totalViews: number;
  averageViews: number;
  videoCount: number;
  averageCompletion25: number;
  averageCompletion50: number;
  averageCompletion75: number;
  averageCompletion100: number;
  datasetId: string;
  filename: string;
}

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

const TrendsAnalysis: React.FC = () => {
  const [weeklyData, setWeeklyData] = useState<WeeklyMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<'views' | 'count' | 'completion'>('views');

  useEffect(() => {
    loadTrendsData();
  }, []);

  const parseWeekFromFilename = (filename: string): string | null => {
    // Hledáme pattern jako "20250818-20250824" v názvu souboru
    const dateRangeMatch = filename.match(/(\d{8})-(\d{8})/);
    if (dateRangeMatch) {
      const startDate = dateRangeMatch[1];
      const endDate = dateRangeMatch[2];
      
      // Konvertujeme na čitelný formát
      const start = `${startDate.slice(6,8)}.${startDate.slice(4,6)}.${startDate.slice(0,4)}`;
      const end = `${endDate.slice(6,8)}.${endDate.slice(4,6)}.${endDate.slice(0,4)}`;
      
      return `${start} - ${end}`;
    }
    return null;
  };

  const parseWeekStartDate = (filename: string): Date | null => {
    const dateRangeMatch = filename.match(/(\d{8})-(\d{8})/);
    if (dateRangeMatch) {
      const startDate = dateRangeMatch[1];
      const year = parseInt(startDate.slice(0,4));
      const month = parseInt(startDate.slice(4,6)) - 1; // JS months are 0-indexed
      const day = parseInt(startDate.slice(6,8));
      return new Date(year, month, day);
    }
    return null;
  };

  const loadTrendsData = async () => {
    try {
      // Načteme všechny datasety
      const datasetsResponse = await fetch('/api/datasets');
      if (!datasetsResponse.ok) return;
      
      const datasets: Dataset[] = await datasetsResponse.json();
      const extractedDatasets = datasets.filter(d => d.hasExtracted);
      
      const weeklyMetrics: WeeklyMetrics[] = [];
      
      // Pro každý dataset načteme data a vypočítáme metriky
      for (const dataset of extractedDatasets) {
        try {
          const dataResponse = await fetch(`/datasets/${dataset.id}/extracted.csv`);
          if (!dataResponse.ok) continue;
          
          const csvText = await dataResponse.text();
          const lines = csvText.split('\n');
          const headers = lines[0].split(';');
          
          const videos: VideoData[] = [];
          for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
              const values = lines[i].split(';');
              const row: any = {};
              headers.forEach((header, index) => {
                row[header] = values[index] || '';
              });
              videos.push(row);
            }
          }
          
          if (videos.length === 0) continue;
          
          // Vypočítáme metriky
          const totalViews = videos.reduce((sum, video) => {
            const views = parseInt(video.Views) || 0;
            return sum + views;
          }, 0);
          
          const averageViews = Math.round(totalViews / videos.length);
          
          const completionMetrics = videos.reduce((acc, video) => {
            acc.completion25 += parseFloat(video['Dokoukanost do 25 %']) || 0;
            acc.completion50 += parseFloat(video['Dokoukanost do 50 %']) || 0;
            acc.completion75 += parseFloat(video['Dokoukanost do 75 %']) || 0;
            acc.completion100 += parseFloat(video['Dokoukanost do 100 %']) || 0;
            return acc;
          }, { completion25: 0, completion50: 0, completion75: 0, completion100: 0 });
          
          const videoCount = videos.length;
          const weekRange = parseWeekFromFilename(dataset.filename || dataset.id);
          const weekStart = parseWeekStartDate(dataset.filename || dataset.id);
          
          if (weekRange && weekStart) {
            weeklyMetrics.push({
              weekRange,
              weekStart,
              totalViews,
              averageViews,
              videoCount,
              averageCompletion25: Math.round((completionMetrics.completion25 / videoCount) * 100) / 100,
              averageCompletion50: Math.round((completionMetrics.completion50 / videoCount) * 100) / 100,
              averageCompletion75: Math.round((completionMetrics.completion75 / videoCount) * 100) / 100,
              averageCompletion100: Math.round((completionMetrics.completion100 / videoCount) * 100) / 100,
              datasetId: dataset.id,
              filename: dataset.filename || dataset.id
            });
          }
          
        } catch (error) {
          console.error(`Error processing dataset ${dataset.id}:`, error);
        }
      }
      
      // Seřadíme podle data (nejnovější první)
      weeklyMetrics.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
      
      setWeeklyData(weeklyMetrics);
    } catch (error) {
      console.error('Error loading trends data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateGrowth = (current: number, previous: number): { value: number; isPositive: boolean } => {
    if (previous === 0) return { value: 0, isPositive: true };
    const growth = ((current - previous) / previous) * 100;
    return { value: Math.round(growth * 100) / 100, isPositive: growth >= 0 };
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  const getMetricValue = (metrics: WeeklyMetrics, metric: string): number => {
    switch (metric) {
      case 'views': return metrics.totalViews;
      case 'count': return metrics.videoCount;
      case 'completion': return metrics.averageCompletion100;
      default: return 0;
    }
  };

  const getMetricLabel = (metric: string): string => {
    switch (metric) {
      case 'views': return 'Celkové views';
      case 'count': return 'Počet videí';
      case 'completion': return 'Průměrná dokoukanost 100%';
      default: return '';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="text-lg font-medium">Načítám trendy...</div>
            <div className="text-sm text-gray-500 mt-2">Analyzuji týdenní data</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Analýza trendů</h1>
        <Badge variant="outline">
          {weeklyData.length} týdnů dat
        </Badge>
      </div>

      {weeklyData.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-lg font-medium">Žádná data k analýze</div>
            <div className="text-sm text-gray-500 mt-2">
              Nahrajte více týdenních datasetů pro zobrazení trendů
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Metric Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Vyberte metriku</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  variant={selectedMetric === 'views' ? 'default' : 'outline'}
                  onClick={() => setSelectedMetric('views')}
                  className="flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Views
                </Button>
                <Button
                  variant={selectedMetric === 'count' ? 'default' : 'outline'}
                  onClick={() => setSelectedMetric('count')}
                  className="flex items-center gap-2"
                >
                  <Video className="w-4 h-4" />
                  Počet videí
                </Button>
                <Button
                  variant={selectedMetric === 'completion' ? 'default' : 'outline'}
                  onClick={() => setSelectedMetric('completion')}
                  className="flex items-center gap-2"
                >
                  <BarChart3 className="w-4 h-4" />
                  Dokoukanost
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Overview Cards */}
          {weeklyData.length >= 2 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Nejnovější týden</p>
                      <p className="text-2xl font-bold">
                        {selectedMetric === 'completion' 
                          ? `${getMetricValue(weeklyData[0], selectedMetric)}%`
                          : formatNumber(getMetricValue(weeklyData[0], selectedMetric))
                        }
                      </p>
                      <p className="text-xs text-gray-500">{weeklyData[0].weekRange}</p>
                    </div>
                    <Calendar className="w-8 h-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Týdenní změna</p>
                      {(() => {
                        const growth = calculateGrowth(
                          getMetricValue(weeklyData[0], selectedMetric),
                          getMetricValue(weeklyData[1], selectedMetric)
                        );
                        return (
                          <div className="flex items-center gap-2">
                            <p className={`text-2xl font-bold ${growth.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                              {growth.isPositive ? '+' : ''}{growth.value}%
                            </p>
                            {growth.isPositive ? (
                              <TrendingUp className="w-5 h-5 text-green-600" />
                            ) : (
                              <TrendingDown className="w-5 h-5 text-red-600" />
                            )}
                          </div>
                        );
                      })()}
                      <p className="text-xs text-gray-500">vs minulý týden</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Průměr za období</p>
                      <p className="text-2xl font-bold">
                        {selectedMetric === 'completion' 
                          ? `${Math.round(weeklyData.reduce((sum, w) => sum + getMetricValue(w, selectedMetric), 0) / weeklyData.length * 100) / 100}%`
                          : formatNumber(Math.round(weeklyData.reduce((sum, w) => sum + getMetricValue(w, selectedMetric), 0) / weeklyData.length))
                        }
                      </p>
                      <p className="text-xs text-gray-500">{weeklyData.length} týdnů</p>
                    </div>
                    <BarChart3 className="w-8 h-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Weekly Data Table */}
          <Card>
            <CardHeader>
              <CardTitle>Týdenní přehled - {getMetricLabel(selectedMetric)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3">Týden</th>
                      <th className="text-right p-3">Celkové views</th>
                      <th className="text-right p-3">Průměrné views</th>
                      <th className="text-right p-3">Počet videí</th>
                      <th className="text-right p-3">Dokoukanost 25%</th>
                      <th className="text-right p-3">Dokoukanost 50%</th>
                      <th className="text-right p-3">Dokoukanost 75%</th>
                      <th className="text-right p-3">Dokoukanost 100%</th>
                      <th className="text-right p-3">Změna</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyData.map((week, index) => {
                      const previousWeek = weeklyData[index + 1];
                      const growth = previousWeek 
                        ? calculateGrowth(getMetricValue(week, selectedMetric), getMetricValue(previousWeek, selectedMetric))
                        : null;

                      return (
                        <tr key={week.datasetId} className="border-b hover:bg-gray-50">
                          <td className="p-3">
                            <div>
                              <div className="font-medium">{week.weekRange}</div>
                              <div className="text-xs text-gray-500">{week.filename}</div>
                            </div>
                          </td>
                          <td className="text-right p-3 font-medium">
                            {formatNumber(week.totalViews)}
                          </td>
                          <td className="text-right p-3">
                            {formatNumber(week.averageViews)}
                          </td>
                          <td className="text-right p-3">
                            {week.videoCount}
                          </td>
                          <td className="text-right p-3">
                            {week.averageCompletion25}%
                          </td>
                          <td className="text-right p-3">
                            {week.averageCompletion50}%
                          </td>
                          <td className="text-right p-3">
                            {week.averageCompletion75}%
                          </td>
                          <td className="text-right p-3">
                            {week.averageCompletion100}%
                          </td>
                          <td className="text-right p-3">
                            {growth ? (
                              <div className={`flex items-center justify-end gap-1 ${growth.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                {growth.isPositive ? (
                                  <TrendingUp className="w-3 h-3" />
                                ) : (
                                  <TrendingDown className="w-3 h-3" />
                                )}
                                <span className="text-xs font-medium">
                                  {growth.isPositive ? '+' : ''}{growth.value}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default TrendsAnalysis;
