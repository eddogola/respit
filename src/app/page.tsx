'use client'

import { useState, useRef, useEffect } from "react";
import { SignUpButton, useAuth } from "@clerk/nextjs";
import Map, { Marker, Source, Layer, LayerProps, Popup } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  PlayIcon, 
  PauseIcon, 
  PaperAirplaneIcon,
  UserPlusIcon,
  ClockIcon
} from "@heroicons/react/24/outline";
import mapboxgl from 'mapbox-gl';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

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
  const mapRef = useRef<any>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const router = useRouter();

  const fitBoundsToRoute = () => {
    if (!tripData || !mapRef.current) return;

    // Get fresh coordinates from current tripData
    const coordinates = [
      tripData.startLocation.coordinates,
      ...tripData.waypoints.map(wp => wp.coordinates),
      tripData.endLocation.coordinates
    ].filter(coord => coord !== undefined) as [number, number][];

    if (coordinates.length === 0) return;

    // Create a fresh bounds object
    const bounds = new mapboxgl.LngLatBounds();
    coordinates.forEach(coord => bounds.extend(coord));

    // Calculate center and bearing
    const center = [
      (bounds.getWest() + bounds.getEast()) / 2,
      (bounds.getNorth() + bounds.getSouth()) / 2
    ] as [number, number];

    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    const bearing = getBearing(start, end);

    // Approximate zoom based on the bounding box size
    const boundsWidth = bounds.getEast() - bounds.getWest();
    const boundsHeight = bounds.getNorth() - bounds.getSouth();
    const maxSpan = Math.max(boundsWidth, boundsHeight);
    const idealZoom = Math.min(Math.floor(8 - Math.log2(maxSpan)), 12);

    // Perform one smooth transition
    const map = mapRef.current.getMap();
    map.flyTo({
      center,
      zoom: idealZoom,
      bearing,
      pitch: 45,
      duration: 3000,     // Increase if you want a slower transition
      essential: true
    });
  };

  // Helper function to calculate bearing between two points
  const getBearing = (start: [number, number], end: [number, number]) => {
    const startLat = toRadians(start[1]);
    const startLng = toRadians(start[0]);
    const endLat = toRadians(end[1]);
    const endLng = toRadians(end[0]);

    const dLng = endLng - startLng;

    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
             Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);

    let bearing = Math.atan2(y, x);
    bearing = toDegrees(bearing);
    return (bearing + 360) % 360;
  };

  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const toDegrees = (radians: number) => radians * 180 / Math.PI;

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

      // Reset map state, if desired
      if (mapRef.current) {
        const map = mapRef.current.getMap();
        map.setCenter([-98, 39]);
        map.setZoom(3);
        map.setBearing(0);
        map.setPitch(0);
      }

      // Transform data
      const transformedData = {
        startLocation: {
          name: rawData.start_location.name,
          coordinates: [
            rawData.start_location.coordinates.longitude, 
            rawData.start_location.coordinates.latitude
          ] as [number, number]
        },
        endLocation: {
          name: rawData.end_location.name,
          coordinates: [
            rawData.end_location.coordinates.longitude,
            rawData.end_location.coordinates.latitude
          ] as [number, number]
        },
        waypoints: rawData.waypoints.map(wp => ({
          name: wp.name,
          description: wp.description,
          type: wp.type,
          coordinates: [wp.coordinates.longitude, wp.coordinates.latitude] as [number, number]
        }))
      };

      // 2. Simply setTripData. No need for setTimeout here:
      setTripData(transformedData);

      // Save to history
      const historyItem = {
        id: uuidv4(),
        prompt: tripDescription,
        timestamp: Date.now(),
        tripData: transformedData
      };

      const existingHistory = JSON.parse(localStorage.getItem('promptHistory') || '[]');
      const newHistory = [historyItem, ...existingHistory].slice(0, 50); // Keep last 50 items
      localStorage.setItem('promptHistory', JSON.stringify(newHistory));

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

  // 3. Use a useEffect that *reacts* to changes in tripData:
  useEffect(() => {
    if (!tripData) return;
    fitBoundsToRoute();
  }, [tripData]);

  return (
    <div className="relative min-h-screen">
      {/* Map Background */}
      <div className="absolute inset-0 z-0">
        <Map
          ref={mapRef}
          reuseMaps
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          initialViewState={{
            longitude: -98,
            latitude: 39,
            zoom: 3,
            pitch: 45,
            bearing: 0
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          dragRotate={true}
          pitchWithRotate={true}
          minPitch={0}
          maxPitch={85}
          minZoom={2}
          maxZoom={18}
        >
          {/* Add 3D building layer */}
          <Source
            id="mapbox-streets"
            type="vector"
            url="mapbox://mapbox.mapbox-streets-v8"
          >
            <Layer
              id="3d-buildings"
              source="mapbox-streets"
              source-layer="building"
              type="fill-extrusion"
              minzoom={15}
              paint={{
                'fill-extrusion-color': '#aaa',
                'fill-extrusion-height': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  15,
                  0,
                  15.05,
                  ['get', 'height']
                ],
                'fill-extrusion-base': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  15,
                  0,
                  15.05,
                  ['get', 'min_height']
                ],
                'fill-extrusion-opacity': 0.6
              }}
            />
          </Source>

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

      {/* Left Sidebar with glassmorphism */}
      <div
        className={`fixed top-0 left-0 h-full z-20 transition-transform duration-500 ease-in-out
        ${isSidebarOpen ? 'w-80 translate-x-0' : 'w-80 -translate-x-full'}
        backdrop-blur-sm bg-black/30 shadow-xl`}
      >
        {/* Toggle button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-8 top-6 bg-black/30 backdrop-blur-sm p-1.5 rounded-r-lg shadow-lg hover:bg-black/40 transition-colors duration-300"
        >
          {isSidebarOpen ? (
            <ChevronLeftIcon className="h-5 w-5 text-white" />
          ) : (
            <ChevronRightIcon className="h-5 w-5 text-white" />
          )}
        </button>

        {/* Sidebar content */}
        {isSidebarOpen && (
          <div className="p-6 h-full flex flex-col text-white">
            {/* Top buttons section */}
            <div className="space-y-4 mb-8">
              {!isSignedIn && (
                <SignUpButton mode="modal">
                  <button className="w-full flex items-center justify-center px-6 py-2 bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-colors">
                    <UserPlusIcon className="w-5 h-5 mr-2" />
                    Sign Up
                  </button>
                </SignUpButton>
              )}
              
              <button
                onClick={() => router.push('/history')}
                className="w-full flex items-center justify-center px-6 py-2 bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-colors"
              >
                <ClockIcon className="w-5 h-5 mr-2" />
                View History
              </button>
            </div>

            {/* Trip details section */}
            {tripData && (
              <div className="space-y-4">
                <h2 className="text-lg font-medium text-white/90">Trip Stops</h2>
                
                {/* Start Location */}
                <div className="bg-white/10 backdrop-blur-sm p-3 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
                    <div>
                      <h3 className="font-medium text-white/90">{tripData.startLocation.name}</h3>
                      <p className="text-sm text-white/70">Starting Point</p>
                    </div>
                  </div>
                </div>

                {/* Waypoints */}
                {tripData.waypoints.map((waypoint, index) => (
                  <div key={index} className="bg-white/10 backdrop-blur-sm p-3 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        waypoint.type === 'scenic' ? 'bg-blue-500' : 
                        waypoint.type === 'historic' ? 'bg-yellow-500' : 
                        'bg-purple-500'
                      }`} />
                      <div>
                        <h3 className="font-medium text-white/90">{waypoint.name}</h3>
                        <p className="text-sm text-white/70 capitalize">{waypoint.type}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* End Location */}
                <div className="bg-white/10 backdrop-blur-sm p-3 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
                    <div>
                      <h3 className="font-medium text-white/90">{tripData.endLocation.name}</h3>
                      <p className="text-sm text-white/70">Destination</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col min-h-screen pointer-events-none">
        <div className="flex-1 flex items-center justify-center mb-24">
          <main className="max-w-2xl mx-auto p-8 backdrop-blur-sm bg-black/30 rounded-lg shadow-xl text-white pointer-events-auto">
            <h1 className="text-4xl font-bold mb-6 text-center">Plan Your Adventure</h1>
            <div className="space-y-6">
              <textarea
                className="w-full p-4 bg-white/20 backdrop-blur-md rounded-lg border border-white/30 text-white placeholder-white/70 disabled:opacity-50"
                placeholder="Describe your dream journey..."
                rows={4}
                value={tripDescription}
                onChange={(e) => setTripDescription(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={isLoading}
              />
              <button
                className="w-full flex items-center justify-center px-6 py-3 bg-emerald-500/80 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleGenerateRoute}
                disabled={isLoading || !tripDescription.trim()}
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="h-5 w-5 mr-2" />
                    Generate Route
                  </>
                )}
              </button>
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
    </div>
  );
}
