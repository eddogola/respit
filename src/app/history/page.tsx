'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PromptHistory } from '@/types';
import Map from 'react-map-gl';
import { TrashIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function HistoryPage() {
  const [history, setHistory] = useState<PromptHistory[]>([]);
  const router = useRouter();

  useEffect(() => {
    const savedHistory = localStorage.getItem('promptHistory');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  const deletePrompt = (id: string) => {
    const newHistory = history.filter(item => item.id !== id);
    setHistory(newHistory);
    localStorage.setItem('promptHistory', JSON.stringify(newHistory));
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="flex items-center mb-8">
        <button
          onClick={() => router.push('/')}
          className="flex items-center text-white hover:text-gray-300 transition-colors mr-4"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back to Map
        </button>
        <h1 className="text-3xl font-bold text-white">Route History</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {history.map((item) => (
          <div
            key={item.id}
            className="bg-gray-800 rounded-lg overflow-hidden shadow-lg"
          >
            <div className="h-48 relative">
              <Map
                key={`map-${item.id}`}
                initialViewState={{
                  longitude: -98,
                  latitude: 39,
                  zoom: 3,
                  pitch: 45,
                  bearing: 0
                }}
                style={{ width: '100%', height: '100%' }}
                mapStyle="mapbox://styles/mapbox/dark-v11"
                mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
                interactive={false}
              >
                {/* Map visualization */}
              </Map>
            </div>
            
            <div className="p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-sm">
                  {formatDate(item.timestamp)}
                </span>
                <button
                  onClick={() => deletePrompt(item.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
              <p className="text-white text-sm">{item.prompt}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 