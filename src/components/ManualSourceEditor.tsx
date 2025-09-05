import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Save, Search, AlertCircle, CheckCircle } from 'lucide-react';

interface VideoData {
  'Jméno rubriky': string;
  'Název článku/videa': string;
  'Views': number;
  'Dokoukanost do 25 %': number;
  'Dokoukanost do 50 %': number;
  'Dokoukanost do 75 %': number;
  'Dokoukanost do 100 %': number;
  'Extrahované info': string;
  'Novinky URL': string;
}

const ManualSourceEditor: React.FC = () => {
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingVideo, setEditingVideo] = useState<string | null>(null);
  const [editSource, setEditSource] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    loadVideos();
  }, []);

  useEffect(() => {
    filterVideos();
  }, [videos, searchTerm]);

  const loadVideos = async () => {
    try {
      // Načteme nejnovější extracted.csv
      const response = await fetch('/api/latest-extracted');
      if (response.ok) {
        const result = await response.json();
        // API vrací objekt s 'data' property, ne přímo pole
        const videosData = Array.isArray(result) ? result : (result.data || []);
        setVideos(videosData);
      } else {
        console.error('Failed to load videos');
        setVideos([]);
      }
    } catch (error) {
      console.error('Error loading videos:', error);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const filterVideos = () => {
    // Dodatečná ochrana - ujistíme se, že videos je pole
    if (!Array.isArray(videos)) {
      console.error('videos is not an array:', videos);
      setFilteredVideos([]);
      return;
    }

    if (!searchTerm) {
      setFilteredVideos(videos);
      return;
    }

    const filtered = videos.filter(video =>
      video['Název článku/videa']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      video['Jméno rubriky']?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredVideos(filtered);
  };

  const startEditing = (video: VideoData) => {
    setEditingVideo(video['Název článku/videa']);
    setEditSource(video['Extrahované info'] || '');
  };

  const cancelEditing = () => {
    setEditingVideo(null);
    setEditSource('');
  };

  const saveSource = async (video: VideoData) => {
    if (!editSource.trim()) return;

    setSaving(video['Název článku/videa']);
    try {
      const response = await fetch('/api/update-source', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoTitle: video['Název článku/videa'],
          newSource: editSource.trim()
        }),
      });

      if (response.ok) {
        // Aktualizujeme lokální stav
        setVideos(videos.map(v => 
          v['Název článku/videa'] === video['Název článku/videa']
            ? { ...v, 'Extrahované info': editSource.trim() }
            : v
        ));
        setEditingVideo(null);
        setEditSource('');
      } else {
        const error = await response.json();
        alert(`Chyba při ukládání: ${error.error}`);
      }
    } catch (error) {
      console.error('Error saving source:', error);
      alert('Chyba při ukládání zdroje');
    } finally {
      setSaving(null);
    }
  };

  const getVideosWithoutSource = () => {
    // Dodatečná ochrana - ujistíme se, že filteredVideos je pole
    if (!Array.isArray(filteredVideos)) {
      console.error('filteredVideos is not an array:', filteredVideos);
      return [];
    }
    
    return filteredVideos.filter(video => 
      !video['Extrahované info'] || 
      video['Extrahované info'] === 'N/A' || 
      video['Extrahované info'].trim() === ''
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Načítám videa...</p>
        </div>
      </div>
    );
  }

  const videosWithoutSource = getVideosWithoutSource();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Doplnění zdrojů</h2>
        <Badge variant="outline" className="text-orange-600 border-orange-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          {videosWithoutSource.length} videí bez zdroje
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vyhledávání videí</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" />
            <Input
              placeholder="Hledat podle názvu videa nebo rubriky..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {videosWithoutSource.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-500">Všechna videa mají zdroj!</p>
            </CardContent>
          </Card>
        ) : (
          videosWithoutSource.map((video) => (
            <Card key={video['Název článku/videa']} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{video['Název článku/videa']}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{video['Jméno rubriky']}</Badge>
                  <Badge variant="outline">{video['Views'].toLocaleString()} zhlédnutí</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {editingVideo === video['Název článku/videa'] ? (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="source">Zdroj videa</Label>
                      <Input
                        id="source"
                        value={editSource}
                        onChange={(e) => setEditSource(e.target.value)}
                        placeholder="Zadejte zdroj videa (např. 'Video: Novinky', 'Reuters', 'AP', atd.)"
                        className="mt-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => saveSource(video)}
                        disabled={!editSource.trim() || saving === video['Název článku/videa']}
                        size="sm"
                      >
                        {saving === video['Název článku/videa'] ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-1" />
                            Uložit
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={cancelEditing}
                        size="sm"
                      >
                        Zrušit
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      <p>Zdroj: {video['Extrahované info'] || 'Není zadán'}</p>
                      <p>URL: {video['Novinky URL']}</p>
                    </div>
                    <Button
                      onClick={() => startEditing(video)}
                      size="sm"
                      variant="outline"
                    >
                      Upravit zdroj
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default ManualSourceEditor;
