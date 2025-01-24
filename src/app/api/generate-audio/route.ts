import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import Replicate from 'replicate';
import { PlayIcon, PauseIcon, SpeakerWaveIcon as VolumeIcon } from '@heroicons/react/24/solid';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: Request) {
  try {
    const { tripDescription, waypoints, startLocation, endLocation } = await req.json();

    // Create a detailed prompt for the audio narration
    const prompt = `Create an engaging and entertaining podcast-style narration about a journey from ${startLocation.name} to ${endLocation.name}. 
    Include interesting facts about:
    - Local history and culture
    - Notable attractions and landmarks
    - Traditional food and customs
    - Interesting historical events
    - Local people and their way of life
    - Architecture and monuments
    
    The route includes these stops: ${waypoints.map((wp: any) => wp.name).join(', ')}.
    
    Original trip description: ${tripDescription}
    
    Make it conversational and entertaining, like a friendly tour guide sharing fascinating stories about the region.`;

    const response = await openai.chat.completions.create({
      messages: [
        { role: "user", 
            content: "You are a friendly tour guide who is giving a podcast style narration about a journey from ${startLocation.name} to ${endLocation.name}. The route includes these stops: ${waypoints.map(wp => wp.name).join(', ')}. The original trip description is: ${tripDescription}. DO NOT INCLUDE ANY OTHER TEXT THAN THE NARRATION."
        },
        { 
            role: "assistant", 
            content: prompt 
        }
        ],
      model: "gpt-4o",
      temperature: 0.7,
    });

    // Get the text content from OpenAI response
    const narrationText = response.choices[0].message.content;
    console.log(narrationText);
    // Generate audio using Replicate's Kokoro model
    const output = await replicate.run(
      "jaaari/kokoro-82m:dfdf537ba482b029e0a761699e6f55e9162cfd159270bfe0e44857caa5f275a6",
      {
        input: {
          text: narrationText,
          speed: 0.9,
          voice: "bf_isabella",
        }
      }
    );
    
    if (output instanceof ReadableStream) {
        // Get the audio data as an ArrayBuffer
        const reader = output.getReader();
        const chunks = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
  
        // Concatenate chunks into a single Uint8Array
        const concatenated = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
          concatenated.set(chunk, offset);
          offset += chunk.length;
        }
  
        // Create response with the audio data
        return new Response(concatenated, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': concatenated.length.toString(),
          },
        });
      }
      
      return NextResponse.json({ error: 'Invalid output format' }, { status: 500 });
  } catch (error) {
    console.error('Error generating audio:', error);
    return NextResponse.json({ error: 'Failed to generate audio' }, { status: 500 });
  }
}
