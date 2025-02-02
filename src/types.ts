export interface PromptHistory {
  id: string;
  prompt: string;
  timestamp: number;
  tripData: {
    startLocation: {
      name: string;
      coordinates?: [number, number];
    };
    endLocation: {
      name: string;
      coordinates?: [number, number];
    };
    waypoints: {
      name: string;
      description: string;
      type: string;
      coordinates?: [number, number];
    }[];
  };
}

// You can add other types/interfaces here as well 