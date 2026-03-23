/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import { 
  User, 
  MessageSquare, 
  Video, 
  Download, 
  Loader2, 
  Sparkles, 
  Image as ImageIcon,
  Volume2,
  Key,
  Mic,
  Upload,
  Plus,
  Trash2,
  Play,
  Pause,
  ChevronRight,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface AvatarState {
  image: string | null;
  isGenerating: boolean;
  source: 'generated' | 'uploaded' | null;
}

interface AudioState {
  url: string | null;
  isGenerating: boolean;
  source: 'text' | 'recorded' | 'uploaded' | null;
  blob?: Blob;
}

interface VideoState {
  url: string | null;
  isGenerating: boolean;
  status: string;
  operation?: any;
}

// --- App Component ---
export default function App() {
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
  const [prompt, setPrompt] = useState('');
  const [avatarPrompt, setAvatarPrompt] = useState('A professional 3D animated character, friendly expression, studio lighting, high detail');
  const [avatar, setAvatar] = useState<AvatarState>({ image: null, isGenerating: false, source: null });
  const [audio, setAudio] = useState<AudioState>({ url: null, isGenerating: false, source: null });
  const [video, setVideo] = useState<VideoState>({ url: null, isGenerating: false, status: '' });
  const [error, setError] = useState<string | null>(null);
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Check for API key on mount
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setApiKeySelected(hasKey);
      }
    };
    checkKey();
  }, []);

  const handleOpenKeyDialog = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setApiKeySelected(true);
    }
  };

  const generateAvatar = async () => {
    setAvatar(prev => ({ ...prev, isGenerating: true }));
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: avatarPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      let imageUrl = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageUrl) {
        setAvatar({ image: imageUrl, isGenerating: false, source: 'generated' });
      } else {
        throw new Error("Failed to generate image");
      }
    } catch (err) {
      console.error(err);
      setError("Avatar generation failed. Please try again.");
      setAvatar(prev => ({ ...prev, isGenerating: false, source: null }));
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar({ image: reader.result as string, isGenerating: false, source: 'uploaded' });
      };
      reader.readAsDataURL(file);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudio({ url: audioUrl, isGenerating: false, source: 'recorded', blob: audioBlob });
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const audioUrl = URL.createObjectURL(file);
      setAudio({ url: audioUrl, isGenerating: false, source: 'uploaded', blob: file });
    }
  };

  const generateAudioFromText = async () => {
    if (!prompt) return;
    setAudio(prev => ({ ...prev, isGenerating: true }));
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say naturally: ${prompt}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
        setAudio({ url: audioUrl, isGenerating: false, source: 'text' });
      } else {
        throw new Error("Failed to generate audio");
      }
    } catch (err) {
      console.error(err);
      setError("Audio generation failed.");
      setAudio(prev => ({ ...prev, isGenerating: false, source: null }));
    }
  };

  const generateVideo = async () => {
    if (!avatar.image) return;
    if (!apiKeySelected) {
      handleOpenKeyDialog();
      return;
    }

    setVideo({ url: null, isGenerating: true, status: 'Initializing video generation...' });
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const base64Image = avatar.image.split(',')[1];
      
      // We use the prompt or a default description
      const videoPrompt = prompt 
        ? `A talking video of this character speaking the following text: "${prompt}". The character's mouth should move in sync with speech, maintaining the same artistic style.`
        : `A cinematic video of this character speaking and moving naturally. High quality, smooth animation.`;

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: videoPrompt,
        image: {
          imageBytes: base64Image,
          mimeType: 'image/png',
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '1:1'
        }
      });

      setVideo(prev => ({ ...prev, status: 'Processing video (this may take a minute)...', operation }));

      // Polling
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const videoResponse = await fetch(downloadLink, {
          method: 'GET',
          headers: {
            'x-goog-api-key': process.env.GEMINI_API_KEY || '',
          },
        });
        const blob = await videoResponse.blob();
        const videoUrl = URL.createObjectURL(blob);
        setVideo({ url: videoUrl, isGenerating: false, status: 'Completed', operation });
      } else {
        throw new Error("Video generation failed to return a link.");
      }
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Requested entity was not found")) {
        setApiKeySelected(false);
        setError("API Key session expired. Please select your key again.");
      } else {
        setError("Video generation failed. Please check your API key and try again.");
      }
      setVideo({ url: null, isGenerating: false, status: '', operation: undefined });
    }
  };

  const extendVideo = async () => {
    if (!video.operation || !video.url) return;
    
    setVideo(prev => ({ ...prev, isGenerating: true, status: 'Extending video (adding 7s)...' }));
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: "The character continues to speak and move naturally, maintaining the same environment and style.",
        video: video.operation.response?.generatedVideos?.[0]?.video,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '1:1',
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const videoResponse = await fetch(downloadLink, {
          method: 'GET',
          headers: {
            'x-goog-api-key': process.env.GEMINI_API_KEY || '',
          },
        });
        const blob = await videoResponse.blob();
        const videoUrl = URL.createObjectURL(blob);
        setVideo({ url: videoUrl, isGenerating: false, status: 'Extended', operation });
      }
    } catch (err) {
      console.error(err);
      setError("Failed to extend video.");
      setVideo(prev => ({ ...prev, isGenerating: false }));
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] text-black font-sans selection:bg-blue-500 selection:text-white">
      {/* iOS-Style Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-black/5 p-4 sticky top-0 z-50 flex justify-between items-center px-6">
        <div className="flex flex-col">
          <h1 className="text-lg font-bold tracking-tight">Avatar Talk</h1>
          <p className="text-[10px] uppercase tracking-widest text-black/40 font-semibold">AI Studio Pro</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleOpenKeyDialog}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              apiKeySelected 
                ? 'bg-green-100 text-green-700' 
                : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            }`}
          >
            <Key size={14} />
            {apiKeySelected ? 'Key Active' : 'Select Key'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 md:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Left Column: Input Panel */}
        <div className="lg:col-span-7 space-y-10">
          
          {/* Avatar Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-black/40 uppercase tracking-wider">1. Avatar Identity</h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 bg-white rounded-full shadow-sm border border-black/5 text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Upload Image"
                >
                  <Upload size={16} />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleAvatarUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            </div>
            
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-black/5 space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <textarea 
                    value={avatarPrompt}
                    onChange={(e) => setAvatarPrompt(e.target.value)}
                    placeholder="Describe your character..."
                    className="w-full bg-[#F2F2F7] rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none h-24 border-none"
                  />
                </div>
                <div className="w-24 h-24 bg-[#F2F2F7] rounded-2xl overflow-hidden flex-shrink-0 border border-black/5">
                  {avatar.image ? (
                    <img src={avatar.image} className="w-full h-full object-cover" alt="Preview" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-black/10">
                      <User size={32} />
                    </div>
                  )}
                </div>
              </div>
              <button 
                onClick={generateAvatar}
                disabled={avatar.isGenerating}
                className="w-full bg-black text-white font-bold py-4 rounded-2xl hover:bg-black/80 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {avatar.isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                {avatar.isGenerating ? 'Generating...' : 'Generate New Avatar'}
              </button>
            </div>
          </section>

          {/* Script Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-black/40 uppercase tracking-wider">2. Voice & Script</h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => audioInputRef.current?.click()}
                  className="p-2 bg-white rounded-full shadow-sm border border-black/5 text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Upload Audio"
                >
                  <Upload size={16} />
                </button>
                <input 
                  type="file" 
                  ref={audioInputRef} 
                  onChange={handleAudioUpload} 
                  accept="audio/*" 
                  className="hidden" 
                />
                <button 
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={stopRecording}
                  className={`p-2 rounded-full shadow-sm border transition-all ${
                    isRecording 
                      ? 'bg-red-500 text-white border-red-600 animate-pulse' 
                      : 'bg-white text-red-500 border-black/5 hover:bg-red-50'
                  }`}
                  title="Hold to Record"
                >
                  <Mic size={16} />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-black/5 space-y-6">
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What should the avatar say?"
                className="w-full bg-[#F2F2F7] rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none h-32 border-none"
              />
              
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={generateAudioFromText}
                  disabled={audio.isGenerating || !prompt}
                  className="flex-1 bg-[#F2F2F7] text-black font-semibold py-4 rounded-2xl hover:bg-[#E5E5EA] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {audio.isGenerating ? <Loader2 className="animate-spin" /> : <Volume2 size={18} />}
                  Preview Voice
                </button>
                <button 
                  onClick={generateVideo}
                  disabled={video.isGenerating || !avatar.image}
                  className="flex-1 bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {video.isGenerating ? <Loader2 className="animate-spin" /> : <Video size={18} />}
                  Create Video
                </button>
              </div>
            </div>
          </section>

          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm flex items-center gap-3"
            >
              <Info size={18} />
              {error}
            </motion.div>
          )}
        </div>

        {/* Right Column: Preview Panel */}
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28 space-y-6">
            <div className="aspect-square bg-white rounded-[2.5rem] shadow-xl border border-black/5 overflow-hidden relative group">
              <AnimatePresence mode="wait">
                {video.url ? (
                  <motion.video 
                    key="video"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    src={video.url} 
                    controls 
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                ) : avatar.image ? (
                  <motion.img 
                    key="avatar"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    src={avatar.image} 
                    alt="Avatar" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <motion.div 
                    key="placeholder"
                    className="w-full h-full flex flex-col items-center justify-center text-black/10 p-12 text-center"
                  >
                    <div className="w-20 h-20 bg-[#F2F2F7] rounded-full flex items-center justify-center mb-4">
                      <User size={40} />
                    </div>
                    <p className="text-sm font-medium text-black/30">Preview Area</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {video.isGenerating && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center">
                  <div className="relative mb-6">
                    <Loader2 className="w-16 h-16 animate-spin text-blue-600" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Video size={24} className="text-blue-600" />
                    </div>
                  </div>
                  <p className="text-lg font-bold tracking-tight text-black">{video.status}</p>
                  <p className="text-xs text-black/40 mt-2 font-medium">This may take up to 60 seconds</p>
                </div>
              )}
            </div>

            {audio.url && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-black/5 flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                  <Volume2 size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-black/30 mb-1">Audio Source: {audio.source}</p>
                  <audio ref={audioRef} src={audio.url} controls className="w-full h-8 accent-blue-600" />
                </div>
                <button 
                  onClick={() => setAudio({ url: null, isGenerating: false, source: null })}
                  className="p-2 text-black/20 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}

            {video.url && (
              <div className="grid grid-cols-2 gap-4">
                <a 
                  href={video.url} 
                  download="avatar-talk.mp4"
                  className="bg-white text-black font-bold py-4 rounded-2xl shadow-sm border border-black/5 hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                >
                  <Download size={20} />
                  Save
                </a>
                <button 
                  onClick={extendVideo}
                  disabled={video.isGenerating}
                  className="bg-black text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-black/80 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Plus size={20} />
                  Extend (+7s)
                </button>
              </div>
            )}

            <div className="bg-white/50 rounded-3xl p-6 border border-black/5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-black/30 mb-4">Pro Tips</h3>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5 flex-shrink-0">
                    <ImageIcon size={14} className="text-blue-500" />
                  </div>
                  <p className="text-xs text-black/60 leading-relaxed">
                    Upload a high-quality portrait for the best animation results.
                  </p>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5 flex-shrink-0">
                    <Mic size={14} className="text-red-500" />
                  </div>
                  <p className="text-xs text-black/60 leading-relaxed">
                    Use the record button to capture your own voice for the avatar.
                  </p>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5 flex-shrink-0">
                    <Plus size={14} className="text-green-500" />
                  </div>
                  <p className="text-xs text-black/60 leading-relaxed">
                    Use "Extend" to make your video longer. Each extension adds 7 seconds.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-5xl mx-auto p-12 text-center text-black/20 text-[10px] font-bold uppercase tracking-[0.3em]">
        Powered by Gemini 3.1 & Veo AI Technology
      </footer>
    </div>
  );
}
