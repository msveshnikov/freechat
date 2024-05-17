import { tools } from "./tools.js";
import { VertexAI } from "@google-cloud/vertexai";
import { handleToolCall } from "./tools.js";
import dotenv from "dotenv";
dotenv.config({ override: true });
process.env["GOOGLE_APPLICATION_CREDENTIALS"] = "./allchat.json";

export const renameProperty = (obj) => {
    const newObj = { ...obj };
    newObj["parameters"] = newObj["input_schema"];
    delete newObj["input_schema"];
    return newObj;
};

export async function getTextGemini(prompt, temperature, imageBase64, fileType, userId, model, webTools) {
    const vertex_ai = new VertexAI({ project: process.env.GOOGLE_KEY, location: "us-central1" });

    if (fileType) {
        webTools = false;
    }
    if (model?.includes("gemini-1.5")) {
        model = "gemini-1.5-flash-preview-0514";
    }
    const parts = [];

    if (fileType === "mp4") {
        parts.push({
            inlineData: {
                mimeType: "video/mp4",
                data: imageBase64,
            },
        });
    } else if (fileType === "png" || fileType === "jpg" || fileType === "jpeg") {
        parts.push({
            inlineData: {
                mimeType: "image/png",
                data: imageBase64,
            },
        });
    } else if (fileType === "mp3" || fileType === "x-m4a" || fileType === "mpeg") {
        parts.push({
            inlineData: {
                mimeType: "audio/mp3",
                data: imageBase64,
            },
        });
    } else if (fileType === "ogg") {
        parts.push({
            inlineData: {
                mimeType: "audio/ogg",
                data: imageBase64,
            },
        });
    } else if (fileType === "wav") {
        parts.push({
            inlineData: {
                mimeType: "audio/wav",
                data: imageBase64,
            },
        });
    }

    const contents = {
        contents: [
            {
                role: "user",
                parts: [{ text: prompt }, ...parts],
            },
        ],
        tools: webTools
            ? [
                  {
                      function_declarations: tools.map(renameProperty),
                  },
              ]
            : [
                  {
                      googleSearchRetrieval: {
                          disableAttribution: true,
                      },
                  },
              ],
    };

    const generativeModel = vertex_ai.preview.getGenerativeModel({
        model: model,
        generation_config: {
            maxOutputTokens: 8192,
            temperature: temperature || 0.5,
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        ],
    });
    let iterationCount = 0;
    let finalResponse = null;

    while (!finalResponse && iterationCount < 5) {
        const generateContentResponse = await generativeModel.generateContent(contents);
        const modelResponse = generateContentResponse?.response?.candidates?.[0]?.content;

        if (modelResponse) {
            const functionCallPart = modelResponse?.parts?.find((part) => part.functionCall);

            if (functionCallPart) {
                const functionCall = functionCallPart.functionCall;
                const functionName = functionCall.name;
                const functionArgs = functionCall.args;

                const functionResponse = await handleToolCall(functionName, functionArgs, userId);
                contents.contents.push(
                    {
                        role: "model",
                        parts: [{ functionCall: functionCall }],
                    },
                    {
                        role: "function",
                        parts: [
                            {
                                functionResponse: {
                                    name: functionName,
                                    response: {
                                        content: functionResponse,
                                    },
                                },
                            },
                        ],
                    }
                );
            } else {
                finalResponse = modelResponse?.parts?.[0]?.text;
            }
        } else {
            console.log("No valid response from the model");
            break;
        }

        iterationCount++;
    }

    return finalResponse;
}
