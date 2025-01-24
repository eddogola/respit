'use client'

import { useState, useRef } from "react";
import { SignUpButton, useAuth } from "@clerk/nextjs";
import Map, { Marker, Source, Layer, LayerProps, Popup, useMap } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ChevronLeftIcon, ChevronRightIcon, SpeakerWaveIcon, SpeakerXMarkIcon, PlayIcon, PauseIcon } from "@heroicons/react/24/outline";

// Add this helper function to create the route GeoJSON
const createRouteGeoJSON = (tripData: any) => {
  if (!tripData) return null;

  // Collect all points in order: start -> waypoints -> end
  const coordinates = [
    tripData.startLocation.coordinates,
    ...tripData.waypoints.map((wp: Waypoint) => wp.coordinates),
    tripData.endLocation.coordinates
  ].filter(coord => coord !== undefined);

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: coordinates
    }
  };
};

// Route line style
const routeLayer: LayerProps = {
  id: 'route',
  type: 'line',
  layout: {
    'line-join': 'round',
    'line-cap': 'round'
  },
  paint: {
    'line-color': '#3b82f6', // Blue color
    'line-width': 3,
    'line-opacity': 0.8
  }
};

interface Waypoint {
  name: string;
  description: string;
  type: string;
  coordinates?: [number, number];
}

interface TripData {
  start_location: {
    name: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  end_location: {
    name: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  waypoints: {
    name: string;
    description: string;
    type: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  }[];
}

export default function Home() {
  const { isSignedIn } = useAuth();
  const [tripDescription, setTripDescription] = useState('');
  const [tripData, setTripData] = useState<{
    startLocation: {
      name: string;
      coordinates?: [number, number];
    };
    endLocation: {
      name: string;
      coordinates?: [number, number];
    };
    waypoints: Waypoint[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<Waypoint | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { current: mapRef } = useMap();
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Function to calculate bounds of all points
  const fitMapToPoints = () => {
    if (!tripData || !mapRef) return;

    const points = [
      tripData.startLocation.coordinates,
      ...tripData.waypoints.map((wp: Waypoint) => wp.coordinates),
      tripData.endLocation.coordinates
    ].filter(coord => coord !== undefined) as [number, number][];

    if (points.length === 0) return;

    // Calculate bounds
    const bounds = points.reduce(
      (bounds, coord) => {
        return {
          minLng: Math.min(bounds.minLng, coord[0]),
          maxLng: Math.max(bounds.maxLng, coord[0]),
          minLat: Math.min(bounds.minLat, coord[1]),
          maxLat: Math.max(bounds.maxLat, coord[1]),
        };
      },
      {
        minLng: points[0][0],
        maxLng: points[0][0],
        minLat: points[0][1],
        maxLat: points[0][1],
      }
    );

    // Calculate padding based on viewport size
    const padding = {
      top: window.innerHeight * 0.2,
      bottom: window.innerHeight * 0.2,
      left: window.innerWidth * 0.2,
      right: window.innerWidth * 0.2
    };

    // Fit map to bounds with padding
    mapRef.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat]
      ],
      {
        padding,
        duration: 1500,
        maxZoom: 12  // Prevent zooming in too close
      }
    );
  };

  const handleGenerateRoute = async () => {
    if (!tripDescription.trim() || isLoading) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: tripDescription })
      });

      if (!response.ok) {
        throw new Error('Failed to generate route');
      }

      const rawData: TripData = await response.json();
      
      // Transform the data to match our internal structure
      const transformedData = {
        startLocation: {
          name: rawData.start_location.name,
          coordinates: [rawData.start_location.coordinates.longitude, rawData.start_location.coordinates.latitude] as [number, number]
        },
        endLocation: {
          name: rawData.end_location.name,
          coordinates: [rawData.end_location.coordinates.longitude, rawData.end_location.coordinates.latitude] as [number, number]
        },
        waypoints: rawData.waypoints.map(wp => ({
          name: wp.name,
          description: wp.description,
          type: wp.type,
          coordinates: [wp.coordinates.longitude, wp.coordinates.latitude] as [number, number]
        }))
      };

      setTripData(transformedData);
      
      // Fit map to the route after a short delay to ensure the map is ready
      setTimeout(fitMapToPoints, 100);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerateRoute();
    }
  };

  // Update the audio generation handler
  const handleGenerateAudio = async () => {
    if (!tripData) return;
    setIsLoading(true);
    try {
      const response = await fetch('/api/generate-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tripDescription,
          waypoints: tripData.waypoints,
          startLocation: tripData.startLocation,
          endLocation: tripData.endLocation
        }),
      });

      if (!response.ok) throw new Error('Failed to generate audio');

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Create and configure audio element
      const audio = new Audio(audioUrl);
      audio.volume = volume;
      
      // Set up event listeners
      audio.onplay = () => setIsPlaying(true);
      audio.onpause = () => setIsPlaying(false);
      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };

      // Add timeupdate listener to track progress
      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
      };
      
      // Get duration once it's loaded
      audio.onloadedmetadata = () => {
        setDuration(audio.duration);
      };

      audioRef.current = audio;
      setAudioElement(audio);
      
      // Start playing
      await audio.play();
      setIsPlaying(true);
    } catch (error) {
      console.error('Error generating audio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update the play/pause handler
  const handlePlayPause = () => {
    if (!audioRef.current && !isPlaying) {
      handleGenerateAudio();
      return;
    }

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Add volume control handler
  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(event.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    setIsMuted(newVolume === 0);
  };

  // Update the mute handler
  const handleMute = () => {
    if (audioRef.current) {
      const newMuted = !isMuted;
      audioRef.current.volume = newMuted ? 0 : volume;
      setIsMuted(newMuted);
    }
  };

  // Add progress bar click handler
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    
    const bounds = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - bounds.left) / bounds.width;
    const newTime = percent * duration;
    
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  return (
    <div className="relative min-h-screen">
      {/* Map Background */}
      <div className="absolute inset-0 z-0">
        <Map
          reuseMaps
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          initialViewState={{
            longitude: -2.5,  // Centered on UK
            latitude: 54.5,
            zoom: 5
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
        >
          {/* Add the route line */}
          {tripData && (
            <Source
              type="geojson"
              data={createRouteGeoJSON(tripData) as any}
            >
              <Layer {...routeLayer} />
            </Source>
          )}

          {/* Start Location Marker */}
          {tripData?.startLocation?.coordinates && (
            <Marker
              longitude={tripData.startLocation.coordinates[0]}
              latitude={tripData.startLocation.coordinates[1]}
              anchor="bottom"
            >
              <div className="bg-green-500 p-2 rounded-full text-white text-xs font-bold">
                Start
              </div>
            </Marker>
          )}

          {/* End Location Marker */}
          {tripData?.endLocation?.coordinates && (
            <Marker
              longitude={tripData.endLocation.coordinates[0]}
              latitude={tripData.endLocation.coordinates[1]}
              anchor="bottom"
            >
              <div className="bg-red-500 p-2 rounded-full text-white text-xs font-bold">
                End
              </div>
            </Marker>
          )}

          {/* Waypoint Markers */}
          {tripData?.waypoints.map((waypoint, index) => (
            waypoint.coordinates && (
              <Marker
                key={index}
                longitude={waypoint.coordinates[0]}
                latitude={waypoint.coordinates[1]}
                anchor="bottom"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelectedMarker(waypoint);
                }}
              >
                <div className={`p-2 rounded-full text-white text-xs font-bold ${
                  waypoint.type === 'scenic' ? 'bg-blue-500' : 
                  waypoint.type === 'historic' ? 'bg-yellow-500' : 
                  'bg-purple-500'  // for 'both'
                }`}>
                  {index + 1}
                </div>
              </Marker>
            )
          ))}

          {/* Popup for selected waypoint */}
          {selectedMarker && selectedMarker.coordinates && (
            <Popup
              longitude={selectedMarker.coordinates[0]}
              latitude={selectedMarker.coordinates[1]}
              anchor="top"
              onClose={() => setSelectedMarker(null)}
              className="rounded-lg"
              maxWidth="300px"
            >
              <div className="p-4 bg-white/95 backdrop-blur-md rounded-lg shadow-lg">
                <h3 className="font-bold text-lg text-gray-900 mb-2">{selectedMarker.name}</h3>
                <p className="text-sm text-gray-700 leading-relaxed mb-2">{selectedMarker.description}</p>
                <p className="text-xs text-gray-500 italic capitalize">
                  Type: {selectedMarker.type}
                </p>
              </div>
            </Popup>
          )}
        </Map>
      </div>

      {/* Content Overlay - keep it non-interactive by default */}
      <div className="relative z-10 flex flex-col min-h-screen pointer-events-none">
        {/* Header - make it interactive */}
        <div className="w-full p-4">
          <div className="max-w-7xl mx-auto w-full px-4 flex justify-end pointer-events-auto">
            {/* Clerk component */}
          </div>
        </div>

        {/* Main content - make it interactive */}
        <div className="flex-1 flex items-center justify-center">
          <main className="max-w-2xl mx-auto p-8 backdrop-blur-sm bg-black/30 rounded-lg shadow-xl text-white pointer-events-auto">
            <h1 className="text-4xl font-bold mb-6 text-center">Plan Your Adventure</h1>
            
            <div className="space-y-6">
              <textarea
                className="w-full p-4 bg-white/20 backdrop-blur-md rounded-lg border border-white/30 text-white placeholder-white/70 disabled:opacity-50"
                placeholder="Describe your dream journey... (e.g., 'I want to take a scenic drive from Seattle to Portland, passing through beautiful forests and coastal views')"
                rows={4}
                value={tripDescription}
                onChange={(e) => setTripDescription(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={isLoading}
              />
              
              <div className="flex gap-4 justify-center">
                {!isSignedIn && (
                  <SignUpButton mode="modal">
                    <button className="px-6 py-2 bg-white text-black rounded-full hover:bg-gray-100 transition-colors">
                      Sign Up
                    </button>
                  </SignUpButton>
                )}
                <button 
                  className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  onClick={handleGenerateRoute}
                  disabled={isLoading || !tripDescription.trim()}
                >
                  {isLoading ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full" />
                      Generating...
                    </>
                  ) : (
                    'Generate Route'
                  )}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Audio Control Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-md text-white z-30 p-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayPause}
            className="text-white hover:text-white/80 transition-colors p-2"
            disabled={!tripData || isLoading}
          >
            {isLoading ? (
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full" />
            ) : isPlaying ? (
              <PauseIcon className="h-5 w-5" />
            ) : (
              <PlayIcon className="h-5 w-5" />
            )}
          </button>
          
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-32 h-1 rounded-full appearance-none cursor-pointer 
              bg-gradient-to-r from-emerald-500 to-emerald-300
              [&::-webkit-slider-thumb]:appearance-none 
              [&::-webkit-slider-thumb]:w-2.5 
              [&::-webkit-slider-thumb]:h-2.5 
              [&::-webkit-slider-thumb]:bg-white 
              [&::-webkit-slider-thumb]:rounded-full 
              [&::-webkit-slider-thumb]:mt-[-3px]
              [&::-moz-range-thumb]:appearance-none 
              [&::-moz-range-thumb]:w-2.5 
              [&::-moz-range-thumb]:h-2.5 
              [&::-moz-range-thumb]:bg-white 
              [&::-moz-range-thumb]:rounded-full 
              [&::-moz-range-thumb]:border-0"
          />
        </div>
      </div>

      {/* Sidebar - More subtle styling */}
      <div className={`fixed top-0 right-0 h-full bg-white/60 backdrop-blur-sm shadow-sm transition-all duration-300 z-20 
        ${isSidebarOpen ? 'w-80' : 'w-0'}`}>
        {tripData && (
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute -left-8 top-1/2 -translate-y-1/2 bg-white/60 backdrop-blur-sm p-1.5 rounded-l shadow-sm hover:bg-white/70 transition-colors"
          >
            {isSidebarOpen ? (
              <ChevronRightIcon className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
            )}
          </button>
        )}
        
        {isSidebarOpen && tripData && (
          <div className="p-6 space-y-6">
            <h2 className="text-lg font-medium text-gray-700">Trip Stops</h2>
            
            <div className="space-y-4">
              {/* Start Location */}
              <div className="bg-white/40 p-3 rounded shadow-sm flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-gray-700">{tripData.startLocation.name}</h3>
                  <p className="text-sm text-gray-500">Starting Point</p>
                </div>
              </div>
              
              {/* Waypoints */}
              {tripData.waypoints.map((waypoint, index) => (
                <div key={index} className="bg-white/40 p-3 rounded shadow-sm flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    waypoint.type === 'scenic' ? 'bg-blue-500' : 
                    waypoint.type === 'historic' ? 'bg-yellow-500' : 
                    'bg-purple-500'  // for 'both'
                  }`} />
                  <div>
                    <h3 className="font-medium text-gray-700">{waypoint.name}</h3>
                    <p className="text-sm text-gray-500 capitalize">{waypoint.type}</p>
                  </div>
                </div>
              ))}
              
              {/* End Location */}
              <div className="bg-white/40 p-3 rounded shadow-sm flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-gray-700">{tripData.endLocation.name}</h3>
                  <p className="text-sm text-gray-500">Destination</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
