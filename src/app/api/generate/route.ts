import OpenAI from "openai";
import { NextResponse } from 'next/server';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
});

export async function POST(request: Request) {
    try {
        const { prompt } = await request.json();

        const completion = await openai.chat.completions.create({
            messages: [{
                role: "system",
                content: `You are a travel expert. Given a trip description, extract the start and end locations, 
                and suggest scenic and historic stops along the way. Include approximate coordinates for all locations. 
                Return the response as a structured JSON object.`
            }, {
                role: "user",
                content: `For this trip: "${prompt}", provide a JSON response with:
                - start_location: {
                    name: string,
                    coordinates: {
                        latitude: number (in decimal degrees),
                        longitude: number (in decimal degrees)
                    }
                }
                - end_location: {
                    name: string,
                    coordinates: {
                        latitude: number (in decimal degrees),
                        longitude: number (in decimal degrees)
                    }
                }
                - waypoints: array of {
                    name: string,
                    description: string (2-3 sentences),
                    type: string ("scenic", "historic", or "both"),
                    coordinates: {
                        latitude: number (in decimal degrees),
                        longitude: number (in decimal degrees)
                    }
                }`
            }],
            model: "gpt-4o",
            // model: "o1",
            response_format: { type: "json_object" }
        });

        const result = completion.choices[0].message.content;
        console.log(result);
        return NextResponse.json(JSON.parse(result || '{}'));
    } catch (error) {
        console.error('Error processing trip request:', error);
        return NextResponse.json(
            { error: 'Failed to process trip request' },
            { status: 500 }
        );
    }
}