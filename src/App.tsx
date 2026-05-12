import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import html2pdf from 'html2pdf.js';
import { motion, AnimatePresence } from "motion/react";
import { 
  FileUp, 
  BookOpen, 
  Download, 
  Trash2, 
  Loader2, 
  AlertCircle,
  FileText,
  Image as ImageIcon,
  CheckCircle2
} from "lucide-react";

interface ImageFile {
  id: string;
  file: File;
  preview: string;
  base64: string;
}

export default function App() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Cleanup previews on unmount
    return () => {
      images.forEach(img => URL.revokeObjectURL(img.preview));
    };
  }, [images]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);
    const newImages: ImageFile[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setError('Please upload only images.');
        continue;
      }

      try {
        const base64 = await fileToBase64(file);
        newImages.push({
          id: Math.random().toString(36).substring(7),
          file,
          preview: URL.createObjectURL(file),
          base64: base64.split(',')[1]
        });
      } catch (err) {
        console.error("Error processing file:", err);
      }
    }

    setImages(prev => [...prev, ...newImages]);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter(i => i.id !== id);
    });
  };

  const generateNotes = async () => {
    if (images.length === 0) {
      setError('Please upload at least one screenshot.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("API_KEY_MISSING");
      }
      
      const aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Analyze these screenshots from a study material, lecture, or textbook. 
      Transform the content into high-quality, comprehensive, and well-structured study notes.
      
      Requirements:
      1. Use a professional, academic tone.
      2. Organize with clear headings (H1, H2) and subheadings.
      3. Use bullet points for key concepts, definitions, and important details.
      4. Highlight critical terms using bold text.
      5. Include a summary or conclusion section if appropriate.
      6. If there are diagrams described in text, summarize their main purpose.
      7. Ensure the flow is logical and easy to study from.
      
      Format your entire response in valid Markdown.`;

      const contents = {
        parts: [
          ...images.map(img => ({
            inlineData: {
              mimeType: img.file.type,
              data: img.base64
            }
          })),
          { text: prompt }
        ]
      };

      const response = await aiInstance.models.generateContent({
        model: "gemini-3-flash-preview",
        contents
      });

      if (!response.text) {
        throw new Error("No response generated from AI.");
      }

      setNotes(response.text);
      setSuccess(true);
    } catch (err: any) {
      console.error("Generation error:", err);
      let message = err?.message || "Failed to generate notes. Please try again.";
      
      if (err?.message === "API_KEY_MISSING" || message.includes("403") || message.includes("PERMISSION_DENIED") || message.includes("API_KEY_INVALID")) {
        message = "Missing or invalid API key. Please set your Gemini API key in the 'Settings > Secrets' panel to enable note generation.";
      } else if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
        message = "Gemini API quota exceeded. If you continue to see this, consider selecting a billing-enabled API key in 'Settings > Secrets'.";
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = () => {
    if (!notesRef.current) return;

    const element = notesRef.current;
    const opt = {
      margin: 10,
      filename: `Study_Notes_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };

    html2pdf().from(element).set(opt).save();
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#F5F5F5] font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-200 h-[64px] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
            <span className="text-white font-bold text-xs uppercase">SN</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-gray-900">NotesGen Studio</span>
        </div>
        
        <div className="flex items-center gap-6">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></div>
              Generating Study Notes...
            </div>
          )}
          {notes && (
            <button 
              onClick={exportToPDF}
              className="px-4 py-2 bg-black text-white text-xs font-medium rounded hover:bg-gray-800 transition-colors shadow-sm"
              id="download-button"
            >
              Export as PDF
            </button>
          )}
        </div>
      </nav>

      <main className="flex flex-1 overflow-hidden h-full">
        {/* Sidebar: Source Screenshots */}
        <aside className="w-[300px] bg-white border-r border-gray-200 p-6 flex flex-col shrink-0 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Source Material</h2>
            <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-600">
              {images.length} {images.length === 1 ? 'Image' : 'Images'}
            </span>
          </div>

          {/* Upload Area inside Sidebar */}
          <div 
            className="mb-8 border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-gray-300 transition-colors bg-gray-50"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files);
              if (files.length > 0) {
                const event = { target: { files } } as any;
                handleFileChange(event);
              }
            }}
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              accept="image/*"
              className="hidden"
            />
            <FileUp className="w-6 h-6 mx-auto mb-2 text-gray-400" />
            <p className="text-[11px] font-medium text-gray-600 underline">Add Screenshots</p>
          </div>

          <div className="flex flex-col gap-4">
            <AnimatePresence>
              {images.map((img) => (
                <motion.div 
                  layout
                  key={img.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="relative aspect-video bg-gray-100 rounded border border-gray-200 overflow-hidden group shadow-sm flex items-center justify-center"
                >
                  <img 
                    src={img.preview} 
                    className="w-full h-full object-cover transition-transform group-hover:scale-105" 
                    alt="Source"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(img.id);
                      }}
                      className="p-1.5 bg-white text-red-600 rounded-full shadow-md hover:bg-gray-100 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="mt-8">
            <button
              onClick={generateNotes}
              disabled={images.length === 0 || loading}
              className={`
                w-full flex items-center justify-center gap-2 px-4 py-3 rounded font-bold text-xs uppercase tracking-wider transition-all
                ${loading 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-black text-white hover:bg-gray-800 shadow-lg active:scale-95'}
              `}
              id="generate-button"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BookOpen className="w-4 h-4" />
              )}
              {loading ? 'Synthesizing...' : 'Generate Notes'}
            </button>
          </div>

          <div className="mt-auto pt-6 border-t border-gray-100">
            <div className="p-4 bg-gray-50 rounded border border-gray-100 mb-4">
              <p className="text-[10px] text-gray-400 leading-relaxed uppercase font-bold mb-1">Status</p>
              <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                {notes ? 'Notes generated successfully.' : 'Ready to analyze materials.'}
              </p>
            </div>
            <div className="flex flex-col gap-1 text-[10px] text-gray-400 font-medium uppercase tracking-tighter">
              <p>© {new Date().getFullYear()} NotesGen Studio</p>
              <p className="flex items-center gap-1">
                <ImageIcon className="w-2.5 h-2.5" />
                Powered By by TECHLINK-ES
              </p>
            </div>
          </div>
        </aside>

        {/* Right: Generated Notes Preview */}
        <section className="flex-1 p-12 overflow-y-auto bg-[#F0F0F0] flex justify-center scroll-smooth">
          <div className="w-full max-w-[700px] h-fit min-h-full">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex items-center gap-3 p-4 bg-white border-l-4 border-red-500 text-red-600 shadow-sm rounded-r-lg"
              >
                <AlertCircle className="w-5 h-5" />
                <p className="text-xs font-bold uppercase tracking-wider">{error}</p>
              </motion.div>
            )}

            {!notes && !loading && (
              <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-400">
                <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 opacity-20" />
                </div>
                <p className="text-sm font-medium">Select source material to preview notes here</p>
              </div>
            )}

            {loading && !notes && (
              <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <Loader2 className="w-12 h-12 animate-spin text-black mb-4" />
                <p className="text-sm font-bold text-gray-900 uppercase tracking-widest">Synthesizing Content</p>
                <p className="text-xs text-gray-500 mt-2">Gemini AI is analyzing your screenshots...</p>
              </div>
            )}

            <AnimatePresence>
              {notes && (
                <motion.div 
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white shadow-2xl border border-gray-300 p-12 md:p-16 relative"
                >
                  <div ref={notesRef} className="markdown-body">
                    <Markdown>{notes}</Markdown>
                  </div>

                  <footer className="mt-16 pt-8 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-400 uppercase font-bold tracking-widest">
                    <span>NotesGen AI Engine v3.0</span>
                    <div className="flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      <span>{images.length} Source Refs</span>
                    </div>
                  </footer>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>
    </div>
  );
}
