import { Scene } from "../types";

// 🔧 配置：使用 SiliconFlow (硅基流动)
// 解决了阿里云官方接口不支持浏览器直连(CORS)的问题
const API_KEY = import.meta.env.VITE_SILICONFLOW_API_KEY;
const BASE_URL = "https://api.siliconflow.cn/v1";

const getHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${API_KEY}`
});

// -----------------------------------------------------------
// 1. 拆解故事 (使用 Qwen/Qwen2.5-7B-Instruct)
// -----------------------------------------------------------
export const breakdownStory = async (storyText: string): Promise<Scene[]> => {
  if (!API_KEY) throw new Error("Missing VITE_SILICONFLOW_API_KEY");

  const prompt = `You are a professional storyboard artist. Break down the following user research story into 3-6 distinct visual scenes for a comic strip.
  Return a JSON array of objects with "description" field.
  Story: ${storyText}
  IMPORTANT: Return ONLY raw JSON array.`;

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: "Qwen/Qwen2.5-7B-Instruct", // 使用通义千问模型
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Text Gen Failed");

    const content = data.choices[0].message.content;
    const cleanJson = content.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    const items = Array.isArray(parsed) ? parsed : (parsed.scenes || parsed.items || []);

    return items.map((item: any, index: number) => ({
      id: Date.now().toString() + index,
      description: item.description,
      isGenerating: false
    }));
  } catch (error: any) {
    console.error("Qwen Error:", error);
    // 降级方案
    return storyText.split(/[.。!！?？\n]+/).slice(0,6).map((s,i)=>({id:Date.now()+i, description:s}));
  }
};

// -----------------------------------------------------------
// 2. 分析图片 (暂时跳过)
// -----------------------------------------------------------
export const analyzeCharacterFromImage = async (base64Image: string): Promise<string> => {
  return ""; 
};

// -----------------------------------------------------------
// 3. 生成图片 (使用 FLUX.1 - 比通义万相更强，且支持浏览器调用)
// -----------------------------------------------------------
export const generateImageFromPrompt = async (promptText: string, referenceImageBase64?: string): Promise<string> => {
  if (!API_KEY) throw new Error("Missing Key");
  
  try {
    // SiliconFlow 的生图接口兼容 OpenAI 格式，非常简单，且不报 CORS 错
    const response = await fetch(`${BASE_URL}/images/generations`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: "black-forest-labs/FLUX.1-schnell", // 速度极快的 FLUX 模型
        prompt: promptText,
        image_size: "1024x1024"
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Image Gen Failed");
    
    // 获取图片 URL
    const imageUrl = data.data?.[0]?.url;
    if (!imageUrl) throw new Error("No image URL returned");

    // 转换成 Base64 以防跨域显示问题
    const imgFetch = await fetch(imageUrl);
    const blob = await imgFetch.blob();
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });

  } catch (error: any) {
    console.error("Flux Error:", error);
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
  }
};
