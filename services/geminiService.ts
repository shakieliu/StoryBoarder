import { GoogleGenAI, Type } from "@google/genai";
import { Scene } from "../types";

const getClient = () => {
    return new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
}

export const breakdownStory = async (storyText: string): Promise<Scene[]> => {
  try {
    const ai = getClient();
    
    const prompt = `You are a professional storyboard artist. Break down the following user research story into 3-6 distinct visual scenes for a comic strip.
    
    Return a JSON array of objects with "description" field.
    Each description should be visual, describing what is seen in the panel.
    
    Story: ${storyText}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING }
            }
          }
        }
      }
    });

    const jsonStr = response.text || "[]";
    const parsed = JSON.parse(jsonStr);
    
    // Map to Scene interface with IDs
    return parsed.map((item: any, index: number) => ({
      id: Date.now().toString() + index,
      description: item.description,
      imageUrl: undefined,
      isGenerating: false
    }));

  } catch (error: any) {
    console.error("Breakdown Error:", error);
    // Fallback logic
    const sentences = storyText.split(/[.。!！?？\n]+/).filter(s => s.trim().length > 5);
    return sentences.slice(0, 6).map((s, i) => ({
        id: Date.now().toString() + i,
        description: s.trim()
    }));
  }
};

export const analyzeCharacterFromImage = async (base64Image: string): Promise<string> => {
  try {
    const ai = getClient();
    
    const matches = base64Image.match(/^data:(.+);base64,(.+)$/);
    if (!matches) return "";

    const mimeType = matches[1];
    const data = matches[2];

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                {
                    text: "Analyze this character image. Provide a comma-separated list of key visual features to maintain consistency (e.g., 'short black hair, red glasses, blue hoodie, denim jeans, white sneakers'). Focus ONLY on physical appearance and clothing. Do not mention pose or background."
                },
                {
                    inlineData: {
                        mimeType,
                        data
                    }
                }
            ]
        }
    });

    return response.text || "";
  } catch (error) {
    console.error("Character Analysis Error:", error);
    return "";
  }
};

export const generateImageFromPrompt = async (promptText: string, referenceImageBase64?: string): Promise<string> => {
  try {
    const ai = getClient();
    
    const parts: any[] = [];

    // Add reference image if available
    if (referenceImageBase64) {
        const matches = referenceImageBase64.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
             parts.push({
                inlineData: {
                    mimeType: matches[1],
                    data: matches[2]
                }
            });
        }
    }

    // Add text prompt
    parts.push({ text: promptText });
    
    // Using gemini-2.5-flash-image (Nano Banana) as requested for non-paid implementation
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: parts
      },
      config: {
        imageConfig: {
            aspectRatio: "1:1" 
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image generated.");
  } catch (error: any) {
    console.error("Gemini Image Gen Error:", error);
    throw new Error("Failed to generate image.");
  }
};
