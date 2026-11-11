import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));

  function sanitizeSchema(schema: any): any {
    if (Array.isArray(schema)) return schema.map(sanitizeSchema);
    if (!schema || typeof schema !== 'object') return schema;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === 'maxItems' || k === 'minItems' || k === 'additionalProperties') continue;
      out[k] = sanitizeSchema(v);
    }
    return out;
  }

  const EXHAUSTED_MODELS = new Set([
    'gemini-3-flash',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-flash-preview-09-2025',
    'gemini-2.5-flash-lite',
    'gemini-3-flash-lite',
    'gemini-2.5-pro',
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash',
  ]);

  // Universal server-side proxy for MG Creator Motion AI calls
  app.post('/api/gemini', async (req, res) => {
    try {
      const { model = 'gemini-3.1-flash-lite', action = 'generateContent', payload = {} } = req.body;

      if (action === 'predict') {
        const prompt = payload?.instances?.[0]?.prompt || 'High quality cinematic background';
        const aspectRatio = payload?.parameters?.aspectRatio || '9:16';
        const imgResp = await ai.models.generateImages({
          model: model || 'imagen-4.0-generate-001',
          prompt,
          config: {
            numberOfImages: 1,
            aspectRatio,
          },
        });
        const predictions = (imgResp.generatedImages || []).map((g: any) => ({
          bytesBase64Encoded: g?.image?.imageBytes || '',
          mimeType: g?.image?.mimeType || 'image/png',
        }));
        res.json({ predictions });
        return;
      }

      const genConfig: Record<string, any> = {
        ...(payload.generationConfig || {}),
      };
      if (payload.systemInstruction) {
        genConfig.systemInstruction = payload.systemInstruction;
      }
      if (genConfig.responseSchema) {
        genConfig.responseSchema = sanitizeSchema(genConfig.responseSchema);
      }

      const rawModel = String(model || 'gemini-3.1-flash-lite');
      const targetModel = EXHAUSTED_MODELS.has(rawModel) ? 'gemini-3.1-flash-lite' : rawModel;
      const isTts =
        targetModel.includes('tts') ||
        genConfig?.responseModalities?.includes('AUDIO');
      const isImage =
        targetModel.includes('image') ||
        genConfig?.responseModalities?.includes('IMAGE');

      const candidateModels = isTts
        ? Array.from(
            new Set([
              'gemini-3.8-flash-lite-tts',
              targetModel,
              'gemini-2.5-flash-preview-tts',
            ])
          )
        : isImage
        ? Array.from(
            new Set([
              targetModel,
              'gemini-3.1-flash-lite-image',
              'gemini-2.5-flash-image',
            ])
          )
        : Array.from(
            new Set([
              targetModel,
              'gemini-3.1-flash-lite',
              'gemini-3.5-flash-lite',
              'gemini-3.1-flash-lite-preview',
              'gemini-flash-lite-latest',
            ])
          );

      let lastErr: any = null;
      for (const m of candidateModels) {
        const cfg = { ...genConfig };
        if (!m.startsWith('gemini-3') || m.includes('lite')) {
          delete cfg.thinkingConfig;
        }
        if (m.includes('3.8') || m.includes('argon')) {
          delete cfg.temperature;
          delete cfg.topP;
          delete cfg.topK;
        }

        try {
          const response = await ai.models.generateContent({
            model: m,
            contents: payload.contents || [],
            config: cfg,
          });
          res.json({
            candidates: response.candidates || [],
          });
          return;
        } catch (err: any) {
          lastErr = err;
          if (err?.status === 400) {
            const fallbackCfg = { ...cfg };
            delete fallbackCfg.thinkingConfig;
            delete fallbackCfg.maxOutputTokens;
            try {
              const retryResp = await ai.models.generateContent({
                model: m,
                contents: payload.contents || [],
                config: fallbackCfg,
              });
              res.json({
                candidates: retryResp.candidates || [],
              });
              return;
            } catch (retryErr: any) {
              lastErr = retryErr;
              if (retryErr?.status === 400 && fallbackCfg.responseSchema) {
                try {
                  const schemaStr = JSON.stringify(fallbackCfg.responseSchema);
                  const noSchemaCfg: Record<string, any> = {
                    ...fallbackCfg,
                    responseMimeType: 'application/json',
                  };
                  delete noSchemaCfg.responseSchema;
                  const clonedContents = JSON.parse(JSON.stringify(payload.contents || []));
                  const lastContent = clonedContents[clonedContents.length - 1];
                  if (lastContent && Array.isArray(lastContent.parts)) {
                    lastContent.parts.push({
                      text: `\n\nRespond strictly with valid JSON conforming to this schema:\n${schemaStr}`,
                    });
                  }
                  const schemaFallbackResp = await ai.models.generateContent({
                    model: m,
                    contents: clonedContents,
                    config: noSchemaCfg,
                  });
                  res.json({
                    candidates: schemaFallbackResp.candidates || [],
                  });
                  return;
                } catch (schemaFallbackErr: any) {
                  lastErr = schemaFallbackErr;
                }
              }
            }
          }
        }
      }

      throw lastErr || new Error('Semua model AI sedang sibuk.');
    } catch (error: any) {
      console.warn('Gemini Studio Proxy Warning:', error?.message || error);
      const status =
        typeof error?.status === 'number' && error.status >= 400 && error.status < 600
          ? error.status
          : 500;
      res.status(status).json({
        error: {
          code: status,
          message: error?.message || 'Gagal memproses permintaan AI di server.',
        },
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Auto Motion Studio server running on http://localhost:${PORT}`);
  });
}

startServer();
