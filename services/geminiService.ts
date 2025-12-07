import { Scene } from "../types";

// 🔧 配置：阿里云 DashScope API
const API_KEY = import.meta.env.VITE_DASHSCOPE_API_KEY;
const BASE_URL = "https://dashscope.aliyuncs.com/api/v1";

// 通用请求头
const getHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${API_KEY}`,
  "X-DashScope-Async": "enable" // 生图必须开启异步
});

// -----------------------------------------------------------
// 1. 拆解故事 (使用 Qwen-Plus 文本模型)
// -----------------------------------------------------------
export const breakdownStory = async (storyText: string): Promise<Scene[]> => {
  if (!API_KEY) throw new Error("Missing VITE_DASHSCOPE_API_KEY");

  // 使用 OpenAI 兼容接口调用 Qwen
  const url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
  
  const prompt = `You are a professional storyboard artist. Break down the following user research story into 3-6 distinct visual scenes for a comic strip.
  
  Return a JSON array of objects with "description" field.
  Each description should be visual, describing what is seen in the panel.
  
  Story: ${storyText}
  
  IMPORTANT: Return ONLY raw JSON array. No markdown formatting.`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}` 
      },
      body: JSON.stringify({
        model: "qwen-plus", // 阿里云性价比极高的文本模型
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" } // 强制 JSON
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const content = data.choices[0].message.content;
    // 清理一下可能存在的 Markdown 符号
    const cleanJson = content.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    
    // 兼容可能返回 { scenes: [...] } 或直接 [...]
    const items = Array.isArray(parsed) ? parsed : (parsed.scenes || parsed.items || []);

    return items.map((item: any, index: number) => ({
      id: Date.now().toString() + index,
      description: item.description,
      imageUrl: undefined,
      isGenerating: false
    }));

  } catch (error: any) {
    console.error("Qwen Breakdown Error:", error);
    // 降级方案：简单的按句分割
    const sentences = storyText.split(/[.。!！?？\n]+/).filter(s => s.trim().length > 5);
    return sentences.slice(0, 6).map((s, i) => ({
        id: Date.now().toString() + i,
        description: s.trim()
    }));
  }
};

// -----------------------------------------------------------
// 2. 分析图片 (使用 Qwen-VL-Max 视觉模型)
// -----------------------------------------------------------
export const analyzeCharacterFromImage = async (base64Image: string): Promise<string> => {
  if (!API_KEY) return "";
  const url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}` 
      },
      body: JSON.stringify({
        model: "qwen-vl-max", // 阿里云最强视觉模型
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this character image. Provide a comma-separated list of physical features (hair, clothes, accessories) to maintain consistency. Keep it brief." },
              { type: "image_url", image_url: { url: base64Image } }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.error("Qwen VL Error:", error);
    return "";
  }
};

// -----------------------------------------------------------
// 3. 生成图片 (使用 Tongyi Wanxiang 通义万相)
// -----------------------------------------------------------
export const generateImageFromPrompt = async (promptText: string, referenceImageBase64?: string): Promise<string> => {
  if (!API_KEY) throw new Error("Missing VITE_DASHSCOPE_API_KEY");
  
  // 阿里云生图是“异步任务”：1. 提交任务 -> 2. 轮询状态 -> 3. 获取结果
  const submitUrl = `${BASE_URL}/services/aigc/text2image/image-synthesis`;

  try {
    // A. 提交任务
    // 注意：Wanx 目前对垫图支持不完善，为保稳定，我们这里只用纯文字生图
    // 如果必须垫图，需要上传到 OSS 获取 URL，流程极复杂，建议先跑通纯文字
    const submitRes = await fetch(submitUrl, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: "wanx-v1",
        input: { prompt: promptText },
        parameters: { style: "<auto>", size: "1024*1024", n: 1 }
      })
    });
    
    const submitData = await submitRes.json();
    if (submitData.code) throw new Error(submitData.message);
    
    const taskId = submitData.output.task_id;
    console.log("Wanx Task Submitted:", taskId);

    // B. 轮询检查 (Polling)
    // 每隔 1 秒查一次，最多查 30 秒
    const taskResultUrl = `${BASE_URL}/tasks/${taskId}`;
    
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000)); // 等1秒

      const checkRes = await fetch(taskResultUrl, {
        headers: { "Authorization": `Bearer ${API_KEY}` }
      });
      const checkData = await checkRes.json();

      if (checkData.output.task_status === "SUCCEEDED") {
        const imgUrl = checkData.output.results[0].url;
        
        // C. 将 URL 转换为 Base64 (为了兼容前端显示并避免跨域)
        const imgFetch = await fetch(imgUrl);
        const blob = await imgFetch.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
      }

      if (checkData.output.task_status === "FAILED") {
        throw new Error("Wanx Task Failed");
      }
      // 如果是 PENDING 或 RUNNING，继续循环
    }

    throw new Error("Image generation timed out");

  } catch (error: any) {
    console.error("Wanx Gen Error:", error);
    // 失败保底：返回灰色占位图
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
  }
};
